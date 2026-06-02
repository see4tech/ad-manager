'use server';

import { createServerSupabase } from '@/lib/supabase';

const BUCKET = 'assets';
const TTL = 60 * 60; // 1h — suficiente para que el modelo descargue la imagen.

export interface ImageReference {
  id: string;
  name: string;
  url: string; // Signed URL temporal.
}

/**
 * Lista los activos de imagen del usuario (status 'ready') con Signed URLs,
 * para usarlos como imágenes de referencia en el prompt del chat.
 */
export async function listImageReferences(): Promise<ImageReference[]> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, name, content_url')
    .eq('type', 'image')
    .eq('status', 'ready')
    .not('content_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw new Error(error.message);

  const paths = (assets ?? [])
    .map((a) => a.content_url as string)
    .filter(Boolean);
  if (paths.length === 0) return [];

  const { data: signed, error: sErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, TTL);
  if (sErr) throw new Error(sErr.message);

  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.signedUrl]),
  );

  return (assets ?? [])
    .map((a) => ({
      id: a.id,
      name: a.name,
      url: urlByPath.get(a.content_url as string) ?? '',
    }))
    .filter((r) => r.url);
}
