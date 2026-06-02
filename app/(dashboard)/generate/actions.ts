'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import { chatCompletion, generateImage, submitVideo } from '@/lib/openrouter';
import { dispatchMediaJob, isMediaProviderConfigured } from '@/lib/media-generation';
import type { AssetType } from '@/types';

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

  // ── Texto: resolución inmediata con el LLM ───────────────────
  if (type === 'text') {
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
    });
    const { data, error } = await supabase
      .from('assets')
      .insert({
        user_id: user.id,
        name: prompt.slice(0, 60),
        type: 'text',
        content_url: null,
        status: 'ready',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    revalidatePath('/media');
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
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    revalidatePath('/media');
    return { assetId: data.id, status: 'ready' };
  }

  // ── Video / Audio: generación asíncrona (excede el timeout) ──
  // Se persiste 'processing'; el webhook (/api/generate/webhook) actualizará
  // content_url y status al terminar.
  const { data, error } = await supabase
    .from('assets')
    .insert({
      user_id: user.id,
      name: prompt.slice(0, 60),
      type,
      content_url: null,
      status: 'processing',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);

  const callbackUrl = `${SITE}/api/generate/webhook?asset_id=${data.id}&token=${WEBHOOK_SECRET}`;

  // Video → OpenRouter /api/v1/videos (async, con callback nativo).
  if (type === 'video') {
    try {
      const refs = formData.getAll('reference_image').map(String).filter(Boolean);
      const job = await submitVideo({
        prompt,
        referenceImages: refs,
        generateAudio: true, // voz/audio sincronizado si el modelo lo soporta
        callbackUrl,
      });
      await supabase
        .from('assets')
        .update({ provider_job_id: job.id })
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

  revalidatePath('/media');
  return { assetId: data.id, status: 'processing' };
}
