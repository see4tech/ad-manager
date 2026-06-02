'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import { chatCompletion, generateImage, submitVideo } from '@/lib/openrouter';
import { dispatchMediaJob, isMediaProviderConfigured } from '@/lib/media-generation';
import { isLipsyncConfigured } from '@/lib/lipsync';
import type { AssetType, AssetStatus } from '@/types';

const SIGNED_TTL = 60 * 60;

export interface AudioReference {
  id: string;
  name: string;
  url: string;
}

/** Lista los activos de audio (status 'ready') para usarlos como voz. */
export async function listVoiceAudios(): Promise<AudioReference[]> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { data: rows, error } = await supabase
    .from('assets')
    .select('id, name, content_url')
    .eq('type', 'audio')
    .eq('status', 'ready')
    .eq('is_draft', false)
    .not('content_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const paths = (rows ?? []).map((r) => r.content_url as string).filter(Boolean);
  if (paths.length === 0) return [];

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_TTL);
  const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (rows ?? [])
    .map((r) => ({
      id: r.id,
      name: r.name,
      url: byPath.get(r.content_url as string) ?? '',
    }))
    .filter((r) => r.url);
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.MEDIA_WEBHOOK_SECRET ?? '';

const BUCKET = 'assets';

interface GenerateResult {
  assetId: string;
  status: 'processing' | 'ready';
  /** Texto generado (solo para type='text'), para previsualización inmediata. */
  text?: string;
}

export async function generateMedia(formData: FormData): Promise<GenerateResult> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const prompt = String(formData.get('prompt') ?? '').trim();
  const type = String(formData.get('type') ?? 'text') as AssetType;
  if (!prompt) throw new Error('El prompt es obligatorio.');

  // Todos los activos generados nacen como BORRADOR (is_draft); no aparecen
  // en Archivos hasta que el usuario los guarde explícitamente.

  // ── Texto: resolución inmediata con el LLM ───────────────────
  if (type === 'text') {
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
    });
    const path = `${user.id}/generated/${Date.now()}.txt`;
    await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(content, 'utf8'), {
        contentType: 'text/plain; charset=utf-8',
        upsert: false,
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
    return { assetId: data.id, status: 'ready', text: content };
  }

  // ── Imagen: generación síncrona (cabe en el timeout) ─────────
  if (type === 'image') {
    const imgRefs = formData.getAll('reference_image').map(String).filter(Boolean);
    const img = await generateImage({ prompt, referenceImages: imgRefs });
    const ext = img.mimeType.split('/')[1] ?? 'png';
    const path = `${user.id}/generated/${Date.now()}.${ext}`;
    const bytes = Buffer.from(img.base64, 'base64');

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: img.mimeType, upsert: false });
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
    return { assetId: data.id, status: 'ready' };
  }

  // ── Video / Audio: generación asíncrona (excede el timeout) ──
  // Se persiste 'processing' como borrador; el webhook actualiza content_url
  // y status al terminar.
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

  // Video → OpenRouter /api/v1/videos (async, con callback nativo).
  if (type === 'video') {
    // ¿Voz adjunta para lip-sync? Resolvemos su ruta de Storage por id.
    const voiceId = (formData.get('voice_audio_id') as string) || null;
    let voicePath: string | null = null;
    if (voiceId) {
      if (!isLipsyncConfigured()) {
        await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
        throw new Error(
          'Adjuntaste voz pero el proveedor de lip-sync no está configurado (SYNC_API_KEY).',
        );
      }
      const { data: voice } = await supabase
        .from('assets')
        .select('content_url, type')
        .eq('id', voiceId)
        .single();
      if (!voice?.content_url || voice.type !== 'audio') {
        await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
        throw new Error('El activo de voz no es válido.');
      }
      voicePath = voice.content_url;
    }

    try {
      const refs = formData.getAll('reference_image').map(String).filter(Boolean);
      const job = await submitVideo({
        prompt,
        referenceImages: refs,
        // Si vamos a sincronizar nuestra voz, no necesitamos el audio del modelo.
        generateAudio: !voicePath,
        callbackUrl,
      });
      await supabase
        .from('assets')
        .update({ provider_job_id: job.id, voice_audio_path: voicePath })
        .eq('id', data.id);
    } catch (err) {
      await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
      throw new Error(`No se pudo encolar el video: ${(err as Error).message}`);
    }
    revalidatePath('/media');
    return { assetId: data.id, status: 'processing' };
  }

  // Audio → proveedor externo configurable (seam lib/media-generation).
  if (isMediaProviderConfigured(type)) {
    try {
      await dispatchMediaJob({ assetId: data.id, type, prompt });
    } catch (err) {
      await supabase.from('assets').update({ status: 'failed' }).eq('id', data.id);
      throw new Error(`No se pudo encolar el job: ${(err as Error).message}`);
    }
  }

  return { assetId: data.id, status: 'processing' };
}

export interface AssetPreview {
  status: AssetStatus;
  type: AssetType;
  url: string | null; // Signed URL para previsualizar (null si aún processing).
  isDraft: boolean;
}

/** Estado + URL firmada de un activo, para previsualizar/pollear en /generate. */
export async function getAssetPreview(assetId: string): Promise<AssetPreview> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { data: asset, error } = await supabase
    .from('assets')
    .select('type, status, content_url, is_draft')
    .eq('id', assetId)
    .single();
  if (error) throw new Error(error.message);

  let url: string | null = null;
  if (asset.content_url && asset.status === 'ready') {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(asset.content_url, SIGNED_TTL);
    url = signed?.signedUrl ?? null;
  }
  return {
    status: asset.status as AssetStatus,
    type: asset.type as AssetType,
    url,
    isDraft: Boolean(asset.is_draft),
  };
}

/** Guarda el borrador en Archivos (lo hace visible en la librería). */
export async function saveAsset(assetId: string) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { error } = await supabase
    .from('assets')
    .update({ is_draft: false })
    .eq('id', assetId)
    .eq('user_id', user.id);
  if (error) throw new Error(error.message);
  revalidatePath('/media');
}

/** Descarta el borrador: borra el archivo de Storage y la fila. */
export async function discardAsset(assetId: string) {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { data: asset } = await supabase
    .from('assets')
    .select('content_url')
    .eq('id', assetId)
    .eq('user_id', user.id)
    .single();
  if (asset?.content_url) {
    await supabase.storage.from(BUCKET).remove([asset.content_url]);
  }
  await supabase.from('assets').delete().eq('id', assetId).eq('user_id', user.id);
}
