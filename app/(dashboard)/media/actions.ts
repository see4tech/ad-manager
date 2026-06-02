'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import type { AssetType } from '@/types';

const BUCKET = 'assets';
const SIGNED_URL_TTL = 60 * 60; // 1 hora, según especificación.

async function requireUser() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');
  return { supabase, user };
}

/** Deduce el tipo de activo a partir del MIME. */
function assetTypeFromMime(mime: string): AssetType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'text';
}

export async function createFolder(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  const parentId = (formData.get('parent_id') as string) || null;
  if (!name) throw new Error('El nombre es obligatorio.');

  const { error } = await supabase.from('folders').insert({
    name,
    parent_id: parentId,
    user_id: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/media');
}

export async function deleteFolder(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get('id'));
  const { error } = await supabase.from('folders').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/media');
}

export async function uploadAsset(formData: FormData) {
  const { supabase, user } = await requireUser();
  // Acepta múltiples archivos (input multiple, name="file").
  const files = formData
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  const folderId = (formData.get('folder_id') as string) || null;
  if (files.length === 0) throw new Error('Selecciona al menos un archivo.');

  const rows: {
    user_id: string;
    folder_id: string | null;
    name: string;
    type: AssetType;
    content_url: string;
    status: 'ready';
  }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const type = assetTypeFromMime(file.type);
    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    // Prefijo por usuario para cumplir la política RLS de Storage.
    const path = `${user.id}/${folderId ?? 'root'}/${Date.now()}_${i}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    rows.push({
      user_id: user.id,
      folder_id: folderId,
      name: file.name,
      type,
      content_url: path,
      status: 'ready',
    });
  }

  const { error: dbError } = await supabase.from('assets').insert(rows);
  if (dbError) throw new Error(dbError.message);
  revalidatePath('/media');
}

/**
 * Inserta filas de activos ya subidos directamente a Storage por el cliente.
 * Payload pequeño (solo metadata) → evita el límite de tamaño de la Function.
 */
export async function registerAssets(
  items: {
    folder_id: string | null;
    name: string;
    type: AssetType;
    content_url: string;
  }[],
) {
  const { supabase, user } = await requireUser();
  if (items.length === 0) return;
  const rows = items.map((it) => ({
    user_id: user.id,
    folder_id: it.folder_id,
    name: it.name,
    type: it.type,
    content_url: it.content_url,
    status: 'ready' as const,
  }));
  const { error } = await supabase.from('assets').insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath('/media');
}

export async function deleteAsset(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get('id'));
  const path = String(formData.get('path') ?? '');

  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
  const { error } = await supabase.from('assets').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/media');
}

/**
 * Genera Signed URLs (1h) para una lista de rutas del bucket.
 * Devuelve un mapa { path -> signedUrl } para consumo multimedia seguro.
 */
export async function getSignedUrls(
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { supabase } = await requireUser();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL);
  if (error) throw new Error(error.message);

  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.signedUrl && item.path) map[item.path] = item.signedUrl;
  }
  return map;
}

/**
 * Signed URL con descarga forzada (Content-Disposition: attachment).
 * Para que el usuario descargue el activo y lo suba manualmente a sus redes.
 */
export async function getDownloadUrl(
  path: string,
  fileName: string,
): Promise<string> {
  const { supabase } = await requireUser();
  const safe = fileName.replace(/[^\w.\-]/g, '_') || 'descarga';
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 120, { download: safe });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
