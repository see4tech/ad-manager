/**
 * Publicador para Meta Graph API (Facebook Pages / Instagram).
 * Flujo IG: crear contenedor de media → publicar el contenedor.
 */
import type { PublishInput, PublishResult, SocialPublisher } from './types';
import type { SocialPlatform } from '@/types';

const GRAPH = 'https://graph.facebook.com/v20.0';

async function graphPost(
  path: string,
  params: Record<string, string>,
): Promise<any> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Graph ${res.status}`);
  }
  return data;
}

function makeMetaPublisher(platform: SocialPlatform): SocialPublisher {
  return {
    platform,
    async publish(input: PublishInput): Promise<PublishResult> {
      try {
        if (platform === 'instagram') {
          const igUserId = String(input.metadata?.igUserId ?? '');
          if (!igUserId) throw new Error('Falta igUserId en metadata.');
          if (!input.mediaUrl) throw new Error('Instagram requiere mediaUrl.');

          const container = await graphPost(`${igUserId}/media`, {
            access_token: input.accessToken,
            caption: input.caption,
            ...(input.mediaType === 'video'
              ? { media_type: 'REELS', video_url: input.mediaUrl }
              : { image_url: input.mediaUrl }),
          });
          const published = await graphPost(`${igUserId}/media_publish`, {
            access_token: input.accessToken,
            creation_id: String(container.id),
          });
          return { platform, ok: true, externalId: String(published.id) };
        }

        // Facebook Page feed.
        const pageId = String(input.metadata?.pageId ?? 'me');
        const path = input.mediaUrl ? `${pageId}/photos` : `${pageId}/feed`;
        const result = await graphPost(path, {
          access_token: input.accessToken,
          ...(input.mediaUrl
            ? { url: input.mediaUrl, caption: input.caption }
            : { message: input.caption }),
        });
        return {
          platform,
          ok: true,
          externalId: String(result.id ?? result.post_id),
        };
      } catch (err) {
        return { platform, ok: false, error: (err as Error).message };
      }
    },
  };
}

export const facebookPublisher = makeMetaPublisher('facebook');
export const instagramPublisher = makeMetaPublisher('instagram');
