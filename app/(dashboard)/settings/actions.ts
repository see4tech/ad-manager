'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase';

export async function disconnect(formData: FormData) {
  const platform = String(formData.get('platform'));
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado.');

  const { error } = await supabase
    .from('social_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('platform', platform);
  if (error) throw new Error(error.message);
  revalidatePath('/settings');
}
