/**
 * Publicador para LinkedIn (UGC Posts API).
 * Publica como el autor (persona u organización) indicado en metadata.authorUrn.
 */
import type { PublishInput, PublishResult, SocialPublisher } from './types';

const UGC = 'https://api.linkedin.com/v2/ugcPosts';

export const linkedinPublisher: SocialPublisher = {
  platform: 'linkedin',
  async publish(input: PublishInput): Promise<PublishResult> {
    try {
      const author = String(input.metadata?.authorUrn ?? '');
      if (!author) throw new Error('Falta authorUrn (ej: urn:li:person:xxx).');

      const body = {
        author,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: input.caption },
            shareMediaCategory: input.mediaUrl ? 'IMAGE' : 'NONE',
          },
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
        },
      };

      const res = await fetch(UGC, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LinkedIn ${res.status}: ${text}`);
      }
      const id = res.headers.get('x-restli-id') ?? undefined;
      return { platform: 'linkedin', ok: true, externalId: id };
    } catch (err) {
      return { platform: 'linkedin', ok: false, error: (err as Error).message };
    }
  },
};
