'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import { chatCompletion, generateImage } from '@/lib/openrouter';
import { dispatchMediaJob, isMediaProviderConfigured } from '@/lib/media-generation';
import type { AssetType } from '@/types';

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
    const img = await generateImage({ prompt });
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
  // Se persiste 'processing' y se despacha al proveedor; el webhook
  // (/api/generate/webhook) actualizará content_url y status al terminar.
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

  if (isMediaProviderConfigured(type)) {
    try {
      await dispatchMediaJob({ assetId: data.id, type, prompt });
    } catch (err) {
      await supabase
        .from('assets')
        .update({ status: 'failed' })
        .eq('id', data.id);
      throw new Error(`No se pudo encolar el job: ${(err as Error).message}`);
    }
  }
  // Si no hay proveedor configurado, el activo queda 'processing' a la espera
  // de que se configure (ver lib/media-generation.ts).

  revalidatePath('/media');
  return { assetId: data.id, status: 'processing' };
}
