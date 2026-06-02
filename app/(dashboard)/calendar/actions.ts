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
