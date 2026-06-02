/**
 * Flujo OAuth para Meta (Facebook/Instagram) y LinkedIn.
 *
 * - authorizeUrl: construye la URL de autorización con `state` (CSRF).
 * - exchangeCode: intercambia el `code` por un access_token.
 * - enrichConnection: para Meta, canjea a token de larga duración y descubre
 *   la página + cuenta de Instagram; para LinkedIn obtiene el URN del autor.
 *   Devuelve el token y la metadata listos para persistir.
 */
import type { SocialPlatform } from '@/types';

const GRAPH = 'https://graph.facebook.com/v20.0';

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
}

export function redirectUri(platform: SocialPlatform): string {
  return `${siteUrl()}/api/social/callback?platform=${platform}`;
}

/** Scopes mínimos por plataforma para publicar contenido. */
const SCOPES: Record<SocialPlatform, string> = {
  facebook: 'pages_manage_posts,pages_read_engagement',
  instagram:
    'pages_show_list,instagram_basic,instagram_content_publish,pages_read_engagement',
  linkedin: 'w_member_social openid profile',
};

export function authorizeUrl(platform: SocialPlatform, state: string): string {
  if (platform === 'linkedin') {
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      redirect_uri: redirectUri(platform),
      scope: SCOPES.linkedin,
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
  }
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    redirect_uri: redirectUri(platform),
    scope: SCOPES[platform],
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${p}`;
}

export interface TokenExchange {
  accessToken: string;
  expiresIn?: number;
}

export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
): Promise<TokenExchange> {
  if (platform === 'linkedin') {
    const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(platform),
        client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? '',
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error_description ?? 'LinkedIn token error');
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }

  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    redirect_uri: redirectUri(platform),
    code,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? 'Meta token error');
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

export interface EnrichedConnection {
  /** Token a persistir (para Meta, el token de la página). */
  accessToken: string;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
}

/**
 * Completa la conexión con los datos que la publicación necesita:
 * - Meta: token de larga duración + pageId + (Instagram) igUserId.
 * - LinkedIn: authorUrn del miembro.
 */
export async function enrichConnection(
  platform: SocialPlatform,
  userToken: string,
  userTokenExpiresIn?: number,
): Promise<EnrichedConnection> {
  if (platform === 'linkedin') {
    const res = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? 'LinkedIn userinfo error');
    return {
      accessToken: userToken,
      metadata: { authorUrn: `urn:li:person:${data.sub}` },
      expiresAt: userTokenExpiresIn
        ? new Date(Date.now() + userTokenExpiresIn * 1000).toISOString()
        : null,
    };
  }

  // Meta: canjear a token de larga duración (~60 días).
  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID ?? '',
    client_secret: process.env.META_APP_SECRET ?? '',
    fb_exchange_token: userToken,
  });
  const longRes = await fetch(`${GRAPH}/oauth/access_token?${longParams}`);
  const longData = await longRes.json();
  const longToken: string = longRes.ok ? longData.access_token : userToken;
  const longExpiresIn: number | undefined = longData.expires_in;

  // Descubrir la primera página administrada y su token.
  const pagesRes = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`,
  );
  const pagesData = await pagesRes.json();
  if (!pagesRes.ok) throw new Error(pagesData?.error?.message ?? 'Meta pages error');
  const page = pagesData?.data?.[0];
  if (!page) {
    throw new Error(
      'No se encontró ninguna página de Facebook administrada por esta cuenta.',
    );
  }

  const metadata: Record<string, unknown> = {
    pageId: page.id,
    pageName: page.name,
  };
  if (platform === 'instagram') {
    const igId = page.instagram_business_account?.id;
    if (!igId) {
      throw new Error(
        'La página no tiene una cuenta de Instagram Business vinculada.',
      );
    }
    metadata.igUserId = igId;
  }

  return {
    // Para publicar en una página se usa el page access token (no expira si el
    // user token es de larga duración).
    accessToken: page.access_token ?? longToken,
    metadata,
    expiresAt: longExpiresIn
      ? new Date(Date.now() + longExpiresIn * 1000).toISOString()
      : null,
  };
}
