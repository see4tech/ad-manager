'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';
import type { SocialPlatform } from '@/types';

async function requireUser() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');
  return { supabase, user };
}

const BUCKET = 'assets';

export interface PostDownload {
  caption: string | null;
  mediaUrl: string | null;
  mediaName: string | null;
}

/**
 * Devuelve el caption y una Signed URL de descarga del media asociado a un
 * post programado, para que el usuario lo suba manualmente a sus redes.
 */
export async function getPostDownload(postId: string): Promise<PostDownload> {
  const { supabase } = await requireUser();
  const { data: post, error } = await supabase
    .from('scheduled_posts')
    .select('caption, asset_id')
    .eq('id', postId)
    .single();
  if (error) throw new Error(error.message);

  let mediaUrl: string | null = null;
  let mediaName: string | null = null;
  if (post?.asset_id) {
    const { data: asset } = await supabase
      .from('assets')
      .select('name, content_url')
      .eq('id', post.asset_id)
      .single();
    if (asset?.content_url) {
      const safe = (asset.name || 'media').replace(/[^\w.\-]/g, '_');
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(asset.content_url, 120, { download: safe });
      mediaUrl = signed?.signedUrl ?? null;
      mediaName = asset.name ?? null;
    }
  }
  return { caption: post?.caption ?? null, mediaUrl, mediaName };
}

export async function schedulePost(formData: FormData) {
  const { supabase, user } = await requireUser();

  const assetId = (formData.get('asset_id') as string) || null;
  const caption = String(formData.get('caption') ?? '');
  const scheduledAt = String(formData.get('scheduled_at') ?? '');
  const platforms = formData.getAll('platforms').map(String) as SocialPlatform[];

  if (!scheduledAt) throw new Error('Falta la fecha de publicación.');
  if (platforms.length === 0) throw new Error('Selecciona al menos una plataforma.');

  const { error } = await supabase.from('scheduled_posts').insert({
    user_id: user.id,
    asset_id: assetId,
    caption,
    platforms,
    scheduled_at: new Date(scheduledAt).toISOString(),
    status: 'pending',
  });
  if (error) throw new Error(error.message);
  revalidatePath('/calendar');
}

export async function deleteScheduledPost(formData: FormData) {
  const { supabase } = await requireUser();
  const id = String(formData.get('id'));
  const { error } = await supabase.from('scheduled_posts').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/calendar');
}
