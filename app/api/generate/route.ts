/**
 * Generación de contenido (texto/imagen/video/audio) como API route.
 *
 * Se ejecuta con maxDuration=60 (Netlify Function con timeout extendido), a
 * diferencia de una Server Action que usa el timeout corto por defecto y
 * cortaba la generación de imagen (>10s) con "fetch failed".
 *
 * Los activos nacen como borrador (is_draft); el usuario decide guardarlos.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { chatCompletion, generateImage, submitVideo } from '@/lib/openrouter';
import {
  dispatchMediaJob,
  isMediaProviderConfigured,
} from '@/lib/media-generation';
import { isLipsyncConfigured } from '@/lib/lipsync';
import type { AssetType } from '@/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'assets';
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.MEDIA_WEBHOOK_SECRET ?? '';

interface Body {
  type: AssetType;
  prompt: string;
  referenceImages?: string[];
  /** IDs de activos de la librería — se usan para el proxy de imágenes. */
  referenceAssetIds?: (string | null)[];
  voiceAudioId?: string | null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const prompt = (body.prompt ?? '').trim();
  const type = (body.type ?? 'text') as AssetType;
  const rawRefs = (body.referenceImages ?? []).filter(Boolean);
  const rawIds = (body.referenceAssetIds ?? []);
  if (!prompt) {
    return NextResponse.json({ error: 'El prompt es obligatorio.' }, { status: 400 });
  }

  /**
   * Convierte referencias a URLs HTTP limpias accesibles por OpenRouter:
   * - Si tenemos el assetId de la librería → /api/image-proxy?id=<id>  ✅
   * - Si es data URL (base64, equipo) → sube a Storage + proxy              ✅
   * - Si es URL externa ya limpia → pasa tal cual                           ✅
   */
  async function resolveRefs(): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < rawRefs.length; i++) {
      const ref = rawRefs[i];
      const assetId = rawIds[i] ?? null;

      if (assetId) {
        // Referencia de la librería: usar proxy con el ID (URL limpia, sin expirar)
        out.push(`${SITE}/api/image-proxy?id=${assetId}`);
        continue;
      }

      if (ref.startsWith('data:')) {
        // Base64 desde el equipo: subir a Storage y servir vía proxy
        const match = /^data:([^;]+);base64,(.+)$/s.exec(ref);
        if (!match) continue;
        const [, mime, b64] = match;
        const ext = mime.split('/')[1] ?? 'png';
        if (!user) continue;
        const path = `${user.id}/ref-tmp/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, Buffer.from(b64, 'base64'), { contentType: mime, upsert: false });
        if (upErr) continue;
        const { data: row } = await supabase
          .from('assets')
          .insert({
            user_id: user!.id,
            name: 'ref-tmp',
            type: 'image',
            content_url: path,
            status: 'ready',
            is_draft: true,
          })
          .select('id')
          .single();
        if (row?.id) out.push(`${SITE}/api/image-proxy?id=${row.id}`);
        continue;
      }

      // URL externa normal
      out.push(ref);
    }
    return out;
  }

  const refs = await resolveRefs();

  try {
    // ── Texto ──
    if (type === 'text') {
      const { content } = await chatCompletion({
        messages: [{ role: 'user', content: prompt }],
      });
      const path = `${user.id}/generated/${Date.now()}.txt`;
      await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(content, 'utf8'), {
          contentType: 'text/plain; charset=utf-8',
        });
      const { data, error } = await supabase
        .from('assets')
        .insert({
          user_id: user.id,
          name: prompt.slice(0, 60),
          type: 'text',
          content_url: path,
          status: 'ready',
          is_draft: true,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ assetId: data.id, status: 'ready', text: content });
    }

    // ── Imagen (síncrona) ──
    if (type === 'image') {
      const img = await generateImage({ prompt, referenceImages: refs });
      const ext = img.mimeType.split('/')[1] ?? 'png';
      const path = `${user.id}/generated/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(img.base64, 'base64'), {
          contentType: img.mimeType,
        });
      if (upErr) throw new Error(upErr.message);
      const { data, error } = await supabase
        .from('assets')
        .insert({
          user_id: user.id,
          name: prompt.slice(0, 60),
          type: 'image',
          content_url: path,
          status: 'ready',
          is_draft: true,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ assetId: data.id, status: 'ready' });
    }

    // ── Video / Audio (async, borrador 'processing') ──
    const { data, error } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        name: prompt.slice(0, 60),
        type,
        content_url: null,
        status: 'processing',
        is_draft: true,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    const callbackUrl = `${SITE}/api/generate/webhook?asset_id=${data.id}&token=${WEBHOOK_SECRET}`;

    if (type === 'video') {
      let voicePath: string | null = null;
      if (body.voiceAudioId) {
        if (!isLipsyncConfigured()) {
          await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
          return NextResponse.json(
            { error: 'Voz adjunta pero lip-sync no configurado (SYNC_API_KEY).' },
            { status: 400 },
          );
        }
        const { data: voice } = await supabase
          .from('assets')
          .select('content_url, type')
          .eq('id', body.voiceAudioId)
          .single();
        if (!voice?.content_url || voice.type !== 'audio') {
          await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
          return NextResponse.json({ error: 'Activo de voz inválido.' }, { status: 400 });
        }
        voicePath = voice.content_url;
      }
      const job = await submitVideo({
        prompt,
        referenceImages: refs,
        generateAudio: !voicePath,
        callbackUrl,
      });
      await supabase
        .from('assets')
        .update({ provider_job_id: job.id, voice_audio_path: voicePath })
        .eq('id', data.id);
      return NextResponse.json({ assetId: data.id, status: 'processing' });
    }

    // Audio → proveedor externo si está configurado.
    if (isMediaProviderConfigured(type)) {
      await dispatchMediaJob({ assetId: data.id, type, prompt });
    }
    return NextResponse.json({ assetId: data.id, status: 'processing' });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
