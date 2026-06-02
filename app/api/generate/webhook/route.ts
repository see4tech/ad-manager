/**
 * Webhook de finalización de generación multimedia asíncrona.
 *
 *   POST /api/generate/webhook?asset_id=<id>&token=<MEDIA_WEBHOOK_SECRET>
 *
 * Dos flujos según el origen del activo:
 *
 * 1. OpenRouter video — el activo tiene `provider_job_id`. El callback solo
 *    actúa de "ping": consultamos el estado autoritativo en OpenRouter
 *    (getVideoJob) y, si está completo, descargamos el binario (downloadVideo)
 *    y lo subimos a Storage. No dependemos del cuerpo del callback.
 *
 * 2. Proveedor externo (audio) — el proveedor hace POST con
 *    { status, media_url }; descargamos ese media_url.
 *
 * Usa el cliente service_role (no hay sesión en un webhook).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { getVideoJob, downloadVideo } from '@/lib/openrouter';
import { submitLipsync } from '@/lib/lipsync';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'assets';
const EXT_BY_TYPE: Record<string, string> = { video: 'mp4', audio: 'mp3' };
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const SECRET = process.env.MEDIA_WEBHOOK_SECRET ?? '';

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const assetId = searchParams.get('asset_id');
  const token = searchParams.get('token');

  const expected = process.env.MEDIA_WEBHOOK_SECRET;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  if (!assetId) {
    return NextResponse.json({ error: 'Falta asset_id.' }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data: asset } = await supabase
    .from('assets')
    .select('user_id, type, provider_job_id, voice_audio_path')
    .eq('id', assetId)
    .single();
  if (!asset) {
    return NextResponse.json({ error: 'Activo no encontrado.' }, { status: 404 });
  }

  const markFailed = (msg?: string) =>
    supabase
      .from('assets')
      .update({ status: 'failed' })
      .eq('id', assetId)
      .then(() => NextResponse.json({ ok: true, failed: true, error: msg }));

  try {
    let buf: Buffer;
    let contentType: string;

    if (asset.provider_job_id) {
      // ── Flujo OpenRouter video ──
      const job = await getVideoJob(asset.provider_job_id);
      if (job.status === 'failed') return markFailed(job.error);
      if (job.status !== 'completed') {
        // Callback prematuro o estado intermedio: no finalizamos aún.
        return NextResponse.json({ ok: true, status: job.status });
      }
      const dl = await downloadVideo(asset.provider_job_id);
      buf = Buffer.from(dl.buffer);
      contentType = dl.contentType;

      // ── Etapa 2 (opcional): lip-sync con la voz adjunta ──
      if (asset.voice_audio_path) {
        // Subimos el video intermedio y firmamos URLs para Sync.so.
        const tmpPath = `${asset.user_id}/generated/_tmp_${Date.now()}.mp4`;
        const { error: tmpErr } = await supabase.storage
          .from(BUCKET)
          .upload(tmpPath, buf, { contentType, upsert: false });
        if (tmpErr) return markFailed(tmpErr.message);

        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls([tmpPath, asset.voice_audio_path], 60 * 60);
        const videoUrl = signed?.find((s) => s.path === tmpPath)?.signedUrl;
        const audioUrl = signed?.find(
          (s) => s.path === asset.voice_audio_path,
        )?.signedUrl;
        if (!videoUrl || !audioUrl) return markFailed('No se firmaron las URLs.');

        const lip = await submitLipsync({
          videoUrl,
          audioUrl,
          callbackUrl: `${SITE}/api/generate/lipsync?asset_id=${assetId}&token=${SECRET}`,
        });
        // El lip-sync pasa a ser el job activo; el activo sigue 'processing'.
        await supabase
          .from('assets')
          .update({ provider_job_id: lip.id })
          .eq('id', assetId);
        return NextResponse.json({ ok: true, stage: 'lipsync', jobId: lip.id });
      }
    } else {
      // ── Flujo proveedor externo (audio) ──
      const body = (await req.json().catch(() => ({}))) as {
        status?: string;
        media_url?: string;
      };
      if (body.status === 'failed' || !body.media_url) {
        return markFailed('proveedor reportó fallo');
      }
      const mediaRes = await fetch(body.media_url);
      if (!mediaRes.ok) return markFailed(`descarga ${mediaRes.status}`);
      buf = Buffer.from(await mediaRes.arrayBuffer());
      contentType =
        mediaRes.headers.get('content-type') ??
        (asset.type === 'video' ? 'video/mp4' : 'audio/mpeg');
    }

    const ext = EXT_BY_TYPE[asset.type] ?? 'bin';
    const path = `${asset.user_id}/generated/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) return markFailed(upErr.message);

    await supabase
      .from('assets')
      .update({ content_url: path, status: 'ready' })
      .eq('id', assetId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return markFailed((err as Error).message);
  }
}
