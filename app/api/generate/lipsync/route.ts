/**
 * Webhook de finalización de lip-sync (Sync.so) — etapa 2 del pipeline de video.
 *
 *   POST /api/generate/lipsync?asset_id=<id>&token=<MEDIA_WEBHOOK_SECRET>
 *
 * Consulta el estado autoritativo en Sync.so (no depende del cuerpo), descarga
 * el video sincronizado y lo guarda como resultado final del activo.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';
import { getLipsync } from '@/lib/lipsync';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'assets';

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
    .select('user_id, provider_job_id')
    .eq('id', assetId)
    .single();
  if (!asset?.provider_job_id) {
    return NextResponse.json({ error: 'Activo/job no encontrado.' }, { status: 404 });
  }

  const markFailed = (msg?: string) =>
    supabase
      .from('assets')
      .update({ status: 'failed' })
      .eq('id', assetId)
      .then(() => NextResponse.json({ ok: true, failed: true, error: msg }));

  try {
    const job = await getLipsync(asset.provider_job_id);
    if (['FAILED', 'REJECTED'].includes(job.status)) return markFailed(job.error);
    if (job.status !== 'COMPLETED' || !job.outputUrl) {
      return NextResponse.json({ ok: true, status: job.status });
    }

    const dl = await fetch(job.outputUrl);
    if (!dl.ok) return markFailed(`descarga ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const path = `${asset.user_id}/generated/${Date.now()}_synced.mp4`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: 'video/mp4', upsert: false });
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
