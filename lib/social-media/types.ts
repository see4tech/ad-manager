import type { SocialPlatform } from '@/types';

export interface PublishInput {
  /** Token de acceso ya descifrado. */
  accessToken: string;
  /** Texto del post / caption. */
  caption: string;
  /** URL pública o firmada del activo multimedia (si aplica). */
  mediaUrl?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'text';
  /** Metadatos específicos de la cuenta (ej: pageId, igUserId, authorUrn). */
  metadata?: Record<string, unknown>;
}

export interface PublishResult {
  platform: SocialPlatform;
  ok: boolean;
  externalId?: string;
  error?: string;
}

export interface SocialPublisher {
  platform: SocialPlatform;
  publish(input: PublishInput): Promise<PublishResult>;
}
