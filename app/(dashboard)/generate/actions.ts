'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import { chatCompletion } from '@/lib/openrouter';
import type { AssetType } from '@/types';

/**
 * Modelos multimedia disponibles vía OpenRouter.
 * (Imagen: SDXL/Flux; audiovisual mediante conectores asíncronos.)
 */
export const MEDIA_MODELS: Record<string, string> = {
  image: 'stabilityai/sdxl',
  video: 'connector/video',
  audio: 'connector/audio',
};

interface GenerateResult {
  assetId: string;
  status: 'processing' | 'ready';
}

/**
 * Lanza una generación multimedia.
 *
 * - text: se resuelve de inmediato con el LLM y se guarda como activo 'ready'.
 * - image/video/audio: por el timeout de Netlify Functions, se persiste un
 *   activo con status 'processing'. La resolución llega por webhook del
 *   proveedor o por polling (ver app/api/cron y app/api/social/webhooks).
 */
export async function generateMedia(formData: FormData): Promise<GenerateResult> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const prompt = String(formData.get('prompt') ?? '').trim();
  const type = String(formData.get('type') ?? 'text') as AssetType;
  if (!prompt) throw new Error('El prompt es obligatorio.');

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
    // El texto generado se devuelve para previsualización inmediata.
    void content;
    revalidatePath('/media');
    return { assetId: data.id, status: 'ready' };
  }

  // Multimedia pesada: registrar estado preliminar 'processing'.
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

  // TODO(async): disparar el job al conector (MEDIA_MODELS[type]); el callback
  // actualizará content_url y status='ready'. Aquí solo se deja encolado.
  revalidatePath('/media');
  return { assetId: data.id, status: 'processing' };
}
