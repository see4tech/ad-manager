/**
 * Núcleo del scheduler de publicaciones.
 *
 * Consulta los scheduled_posts en estado 'pending' cuya fecha ya venció,
 * resuelve el activo (Signed URL), descifra los tokens OAuth del usuario y
 * publica en cada plataforma destino. Actualiza el estado a 'published' o
 * 'failed'. Pensado para ejecutarse desde una Netlify Scheduled Function
 * (sin sesión de usuario) usando el cliente service_role.
 */
import { createServiceSupabase } from '@/lib/supabase';
import { getPublisher, decryptToken } from '@/lib/social-media';
import type { PublishResult } from '@/lib/social-media';
import type { AssetType, ScheduledPost, SocialPlatform } from '@/types';

const BUCKET = 'assets';
const SIGNED_TTL = 60 * 60;

export interface RunSummary {
  processed: number;
  published: number;
  failed: number;
}

export async function processPendingPosts(): Promise<RunSummary> {
  const supabase = createServiceSupabase();
  const nowIso = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .limit(50);
  if (error) throw new Error(error.message);

  const summary: RunSummary = { processed: 0, published: 0, failed: 0 };

  for (const post of (posts as ScheduledPost[] | null) ?? []) {
    summary.processed++;
    try {
      const { mediaUrl, mediaType } = await resolveMedia(supabase, post.asset_id);
      const tokens = await loadTokens(supabase, post.user_id, post.platforms);

      const results: PublishResult[] = [];
      for (const platform of post.platforms) {
        const conn = tokens.get(platform);
        if (!conn) {
          results.push({
            platform,
            ok: false,
            error: `Sin conexión para ${platform}`,
          });
          continue;
        }
        const publisher = getPublisher(platform);
        results.push(
          await publisher.publish({
            accessToken: conn.accessToken,
            caption: post.caption ?? '',
            mediaUrl,
            mediaType,
            metadata: conn.metadata,
          }),
        );
      }

      const allOk = results.every((r) => r.ok);
      const errors = results
        .filter((r) => !r.ok)
        .map((r) => `${r.platform}: ${r.error}`)
        .join('; ');

      await supabase
        .from('scheduled_posts')
        .update({
          status: allOk ? 'published' : 'failed',
          error: allOk ? null : errors,
        })
        .eq('id', post.id);

      if (allOk) summary.published++;
      else summary.failed++;
    } catch (err) {
      summary.failed++;
      await supabase
        .from('scheduled_posts')
        .update({ status: 'failed', error: (err as Error).message })
        .eq('id', post.id);
    }
  }

  return summary;
}

async function resolveMedia(
  supabase: ReturnType<typeof createServiceSupabase>,
  assetId: string | null,
): Promise<{ mediaUrl?: string; mediaType?: AssetType }> {
  if (!assetId) return {};
  const { data: asset } = await supabase
    .from('assets')
    .select('content_url, type')
    .eq('id', assetId)
    .single();
  if (!asset?.content_url) return { mediaType: asset?.type as AssetType | undefined };

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(asset.content_url, SIGNED_TTL);
  return { mediaUrl: signed?.signedUrl, mediaType: asset.type };
}

interface ConnInfo {
  accessToken: string;
  metadata: Record<string, unknown>;
}

async function loadTokens(
  supabase: ReturnType<typeof createServiceSupabase>,
  userId: string,
  platforms: SocialPlatform[],
): Promise<Map<SocialPlatform, ConnInfo>> {
  const { data } = await supabase
    .from('social_connections')
    .select('platform, access_token, metadata')
    .eq('user_id', userId)
    .in('platform', platforms);

  const map = new Map<SocialPlatform, ConnInfo>();
  for (const row of data ?? []) {
    try {
      map.set(row.platform as SocialPlatform, {
        accessToken: decryptToken(row.access_token),
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
      });
    } catch {
      // Token corrupto: se omite y la publicación quedará marcada como failed.
    }
  }
  return map;
}
