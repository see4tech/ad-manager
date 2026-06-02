/**
 * Inicia el flujo OAuth: genera un `state` anti-CSRF, lo guarda en una cookie
 * httpOnly y redirige al proveedor. El callback verifica que el `state`
 * recibido coincida con la cookie.
 *
 *   GET /api/social/connect?platform=facebook|instagram|linkedin
 */
import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { authorizeUrl } from '@/lib/social-media/oauth';
import type { SocialPlatform } from '@/types';

export const runtime = 'nodejs';

const VALID: SocialPlatform[] = ['facebook', 'instagram', 'linkedin'];

export async function GET(req: NextRequest) {
  const platform = req.nextUrl.searchParams.get('platform') as SocialPlatform | null;
  if (!platform || !VALID.includes(platform)) {
    return NextResponse.redirect(new URL('/settings?error=bad_platform', req.url));
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const state = randomBytes(16).toString('hex');
  const res = NextResponse.redirect(authorizeUrl(platform, state));
  res.cookies.set(`oauth_state_${platform}`, state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10 min
  });
  return res;
}
