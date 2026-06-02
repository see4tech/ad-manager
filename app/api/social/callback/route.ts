/**
 * Callback de OAuth para Meta (Facebook/Instagram) y LinkedIn.
 *
 * 1. Verifica el `state` contra la cookie (anti-CSRF).
 * 2. Intercambia el `code` por un access_token.
 * 3. Enriquece la conexión (token de larga duración + pageId/igUserId para
 *    Meta; authorUrn para LinkedIn).
 * 4. Cifra el token y lo persiste en social_connections.
 *
 * Se ejecuta como Netlify Function (Node.js).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { encryptToken } from '@/lib/social-media';
import { exchangeCode, enrichConnection } from '@/lib/social-media/oauth';
import type { SocialPlatform } from '@/types';

export const runtime = 'nodejs';

function fail(req: NextRequest, msg: string) {
  return NextResponse.redirect(
    new URL(`/settings?error=${encodeURIComponent(msg)}`, req.url),
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get('platform') as SocialPlatform | null;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) return fail(req, oauthError);
  if (!platform || !code) return fail(req, 'missing_params');

  // 1. Verificar state contra la cookie.
  const cookieState = req.cookies.get(`oauth_state_${platform}`)?.value;
  if (!cookieState || !state || cookieState !== state) {
    return fail(req, 'state_mismatch');
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  try {
    // 2. Intercambiar code por token.
    const { accessToken, expiresIn } = await exchangeCode(platform, code);
    // 3. Enriquecer (metadata + token de larga duración).
    const enriched = await enrichConnection(platform, accessToken, expiresIn);

    // 4. Persistir cifrado.
    const { error: dbError } = await supabase.from('social_connections').upsert(
      {
        user_id: user.id,
        platform,
        access_token: encryptToken(enriched.accessToken),
        expires_at: enriched.expiresAt,
        metadata: enriched.metadata,
      },
      { onConflict: 'user_id,platform' },
    );
    if (dbError) throw new Error(dbError.message);

    const res = NextResponse.redirect(new URL('/settings?connected=1', req.url));
    res.cookies.delete(`oauth_state_${platform}`);
    return res;
  } catch (err) {
    return fail(req, (err as Error).message);
  }
}
