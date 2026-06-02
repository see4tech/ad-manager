/**
 * Callback de OAuth para Meta (Facebook/Instagram) y LinkedIn.
 * Intercambia el `code` por un access_token, lo cifra y lo persiste
 * en social_connections. Se ejecuta como Netlify Function (Node.js).
 *
 * Redirección esperada del proveedor:
 *   /api/social/callback?platform=facebook&code=...&state=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { encryptToken } from '@/lib/social-media';
import type { SocialPlatform } from '@/types';

export const runtime = 'nodejs';

function redirectUri() {
  const base = process.env.OPENROUTER_SITE_URL ?? 'http://localhost:3000';
  return `${base}/api/social/callback`;
}

async function exchangeMeta(code: string) {
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    redirect_uri: redirectUri(),
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/v20.0/oauth/access_token?${params}`,
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Meta token error');
  return { accessToken: data.access_token as string, expiresIn: data.expires_in };
}

async function exchangeLinkedIn(code: string) {
  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error_description ?? 'LinkedIn token error');
  return { accessToken: data.access_token as string, expiresIn: data.expires_in };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform') as SocialPlatform | null;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!platform || !code) {
    return NextResponse.redirect(new URL('/settings?error=missing_params', req.url));
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  try {
    const { accessToken, expiresIn } =
      platform === 'linkedin'
        ? await exchangeLinkedIn(code)
        : await exchangeMeta(code);

    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

    const { error: dbError } = await supabase.from('social_connections').upsert(
      {
        user_id: user.id,
        platform,
        access_token: encryptToken(accessToken),
        expires_at: expiresAt,
      },
      { onConflict: 'user_id,platform' },
    );
    if (dbError) throw new Error(dbError.message);

    return NextResponse.redirect(new URL('/settings?connected=1', req.url));
  } catch (err) {
    return NextResponse.redirect(
      new URL(
        `/settings?error=${encodeURIComponent((err as Error).message)}`,
        req.url,
      ),
    );
  }
}
