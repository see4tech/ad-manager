'use server';

import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/media');
}

export async function signUp(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const companyName = String(formData.get('company_name') ?? '');

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { company_name: companyName } },
  });

  if (error) {
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }
  redirect('/login?registered=1');
}

export async function signOut() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
