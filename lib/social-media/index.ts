import type { SocialPlatform } from '@/types';
import type { SocialPublisher } from './types';
import { facebookPublisher, instagramPublisher } from './meta';
import { linkedinPublisher } from './linkedin';

export * from './types';
export { encryptToken, decryptToken } from './crypto';

const PUBLISHERS: Record<SocialPlatform, SocialPublisher> = {
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  linkedin: linkedinPublisher,
};

export function getPublisher(platform: SocialPlatform): SocialPublisher {
  const p = PUBLISHERS[platform];
  if (!p) throw new Error(`Plataforma no soportada: ${platform}`);
  return p;
}
