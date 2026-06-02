/**
 * Cliente de Sync.so (lip-sync) — sincroniza una pista de voz con un video.
 *
 * Se usa como segunda etapa del pipeline de video: OpenRouter genera el video
 * y, si el usuario adjuntó una voz, Sync.so sincroniza los labios con ese
 * audio. Async: submit → job id → webhook/poll → descargar outputUrl.
 *
 * Env: SYNC_API_KEY (requerida), SYNC_MODEL (opcional, default lipsync-2).
 */
const SYNC_BASE = 'https://api.sync.so/v2';

export interface LipsyncJob {
  id: string;
  status: string; // PENDING | PROCESSING | COMPLETED | FAILED | REJECTED
  outputUrl?: string;
  error?: string;
}

export function isLipsyncConfigured(): boolean {
  return Boolean(process.env.SYNC_API_KEY);
}

function apiKey(): string {
  const k = process.env.SYNC_API_KEY;
  if (!k) throw new Error('Falta SYNC_API_KEY (proveedor de lip-sync).');
  return k;
}

function jobFrom(d: any): LipsyncJob {
  return { id: d.id, status: d.status, outputUrl: d.outputUrl, error: d.error };
}

export interface SubmitLipsyncInput {
  videoUrl: string;
  audioUrl: string;
  callbackUrl?: string;
}

export async function submitLipsync(
  input: SubmitLipsyncInput,
): Promise<LipsyncJob> {
  const res = await fetch(`${SYNC_BASE}/generate`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.SYNC_MODEL || 'lipsync-2',
      input: [
        { type: 'video', url: input.videoUrl },
        { type: 'audio', url: input.audioUrl },
      ],
      ...(input.callbackUrl ? { webhookUrl: input.callbackUrl } : {}),
      outputFileName: 'synced',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Sync.so respondió ${res.status}: ${JSON.stringify(data)}`);
  }
  return jobFrom(data);
}

export async function getLipsync(id: string): Promise<LipsyncJob> {
  const res = await fetch(`${SYNC_BASE}/generate/${id}`, {
    headers: { 'x-api-key': apiKey() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sync.so status ${res.status}`);
  return jobFrom(data);
}
