/**
 * Preview / guardar / descartar de activos generados (borradores).
 *
 * Como API route (no Server Action) para evitar el re-render completo de la
 * página /generate en cada llamada, que provocaba 503 intermitentes en el
 * polling de la generación.
 *
 *   GET  /api/generate/asset?assetId=X        → estado + signed URL
 *   POST /api/generate/asset {assetId, action: 'save' | 'discard'}
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase';
import { getVideoJob, downloadVideo } from '@/lib/openrouter';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'assets';
const TTL = 60 * 60;

async function getUser() {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const assetId = req.nextUrl.searchParams.get('assetId');
  if (!assetId) return NextResponse.json({ error: 'Falta assetId.' }, { status: 400 });

  const { data: asset, error } = await supabase
    .from('assets')
    .select('type, status, content_url, is_draft, provider_job_id, voice_audio_path')
    .eq('id', assetId)
    .single();
  if (error || !asset) {
    return NextResponse.json({ error: error?.message ?? 'No encontrado.' }, { status: 404 });
  }

  let status: string = asset.status;
  let contentUrl: string | null = asset.content_url;

  // Auto-finalización de video (no depende del webhook de OpenRouter):
  // si el video sigue 'processing' y no requiere lip-sync, consultamos el
  // estado en OpenRouter y, si está listo, descargamos y guardamos aquí mismo.
  if (
    asset.type === 'video' &&
    status === 'processing' &&
    asset.provider_job_id &&
    !asset.voice_audio_path
  ) {
    try {
      const job = await getVideoJob(asset.provider_job_id);
      if (job.status === 'failed') {
        await supabase
          .from('assets')
          .update({ status: 'failed' })
          .eq('id', assetId)
          .eq('status', 'processing');
        status = 'failed';
      } else if (job.status === 'completed') {
        const dl = await downloadVideo(asset.provider_job_id);
        const path = `${user.id}/generated/${Date.now()}.mp4`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, Buffer.from(dl.buffer), {
            contentType: dl.contentType,
            upsert: false,
          });
        if (!upErr) {
          await supabase
            .from('assets')
            .update({ content_url: path, status: 'ready' })
            .eq('id', assetId)
            .eq('status', 'processing');
          status = 'ready';
          contentUrl = path;
        }
      }
    } catch {
      /* reintentar en el siguiente poll */
    }
  }

  let url: string | null = null;
  if (contentUrl && status === 'ready') {
    const { data: signed } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(contentUrl, TTL);
    url = signed?.signedUrl ?? null;
  }
  return NextResponse.json({
    status,
    type: asset.type,
    url,
    isDraft: Boolean(asset.is_draft),
  });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  let body: { assetId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }
  const { assetId, action } = body;
  if (!assetId) return NextResponse.json({ error: 'Falta assetId.' }, { status: 400 });

  if (action === 'save') {
    const { error } = await supabase
      .from('assets')
      .update({ is_draft: false })
      .eq('id', assetId)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'discard') {
    const { data: asset } = await supabase
      .from('assets')
      .select('content_url')
      .eq('id', assetId)
      .eq('user_id', user.id)
      .single();
    if (asset?.content_url) {
      await supabase.storage.from(BUCKET).remove([asset.content_url]);
    }
    await supabase.from('assets').delete().eq('id', assetId).eq('user_id', user.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
}
