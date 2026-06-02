/**
 * Generación multimedia asíncrona (video / audio).
 *
 * La generación de imagen es síncrona (ver lib/openrouter.generateImage).
 * Video y audio exceden el timeout de las Netlify Functions, así que se
 * delegan a un proveedor externo que trabaja en background y notifica el
 * resultado a /api/generate/webhook.
 *
 * Este módulo es un *seam* agnóstico de proveedor: se configura por env y
 * no asume un proveedor concreto. Para activar video/audio, define:
 *
 *   MEDIA_VIDEO_PROVIDER_URL   Endpoint del proveedor de video
 *   MEDIA_AUDIO_PROVIDER_URL   Endpoint del proveedor de audio
 *   MEDIA_PROVIDER_API_KEY     API key (Bearer) del proveedor
 *   MEDIA_WEBHOOK_SECRET       Secreto compartido para firmar el webhook
 *
 * El contrato esperado: el proveedor recibe { prompt, webhook } y, al
 * terminar, hace POST al `webhook` con { asset_id, status, media_url }.
 */
import type { AssetType } from '@/types';

type AsyncMediaType = Extract<AssetType, 'video' | 'audio'>;

function providerUrl(type: AsyncMediaType): string | undefined {
  return type === 'video'
    ? process.env.MEDIA_VIDEO_PROVIDER_URL
    : process.env.MEDIA_AUDIO_PROVIDER_URL;
}

/** Modelo a usar por tipo (slug del proveedor; configurable por env). */
function mediaModel(type: AsyncMediaType): string | undefined {
  return type === 'video'
    ? process.env.MEDIA_VIDEO_MODEL
    : process.env.MEDIA_AUDIO_MODEL;
}

/** ¿Hay proveedor configurado para este tipo? */
export function isMediaProviderConfigured(type: AssetType): boolean {
  if (type !== 'video' && type !== 'audio') return false;
  return Boolean(providerUrl(type) && process.env.MEDIA_PROVIDER_API_KEY);
}

function webhookUrl(assetId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const secret = process.env.MEDIA_WEBHOOK_SECRET ?? '';
  const params = new URLSearchParams({ asset_id: assetId, token: secret });
  return `${base}/api/generate/webhook?${params}`;
}

export interface DispatchInput {
  assetId: string;
  type: AsyncMediaType;
  prompt: string;
  /** Imágenes de referencia (URLs) para image/frame-to-video. */
  referenceImages?: string[];
}

/**
 * Encola un job de generación en el proveedor configurado.
 * @throws si el proveedor no está configurado o responde con error.
 */
export async function dispatchMediaJob(input: DispatchInput): Promise<void> {
  const url = providerUrl(input.type);
  const apiKey = process.env.MEDIA_PROVIDER_API_KEY;
  if (!url || !apiKey) {
    throw new Error(`Proveedor de ${input.type} no configurado.`);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: mediaModel(input.type),
      prompt: input.prompt,
      reference_images: input.referenceImages ?? [],
      webhook: webhookUrl(input.assetId),
      metadata: { asset_id: input.assetId },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Proveedor respondió ${res.status}: ${text}`);
  }
}
