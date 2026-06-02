/**
 * Webhook de finalización de generación multimedia asíncrona (video/audio).
 *
 * El proveedor llama a esta URL al terminar el job:
 *   POST /api/generate/webhook?asset_id=<id>&token=<MEDIA_WEBHOOK_SECRET>
 *   body: { status: 'ready'|'failed', media_url?: string }
 *
 * Descarga el binario resultante, lo guarda en Supabase Storage bajo el
 * prefijo del usuario dueño del activo y marca el activo como 'ready'.
 * Usa el cliente service_role (no hay sesión en un webhook).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'assets';

const EXT_BY_TYPE: Record<string, string> = { video: 'mp4', audio: 'mp3' };

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

  let body: { status?: string; media_url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const supabase = createServiceSupabase();
  const { data: asset } = await supabase
    .from('assets')
    .select('user_id, type')
    .eq('id', assetId)
    .single();
  if (!asset) {
    return NextResponse.json({ error: 'Activo no encontrado.' }, { status: 404 });
  }

  // Fallo reportado por el proveedor.
  if (body.status === 'failed' || !body.media_url) {
    await supabase.from('assets').update({ status: 'failed' }).eq('id', assetId);
    return NextResponse.json({ ok: true });
  }

  try {
    const mediaRes = await fetch(body.media_url);
    if (!mediaRes.ok) throw new Error(`descarga ${mediaRes.status}`);
    const buf = Buffer.from(await mediaRes.arrayBuffer());
    const contentType =
      mediaRes.headers.get('content-type') ??
      (asset.type === 'video' ? 'video/mp4' : 'audio/mpeg');
    const ext = EXT_BY_TYPE[asset.type] ?? 'bin';
    const path = `${asset.user_id}/generated/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) throw new Error(upErr.message);

    await supabase
      .from('assets')
      .update({ content_url: path, status: 'ready' })
      .eq('id', assetId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    await supabase.from('assets').update({ status: 'failed' }).eq('id', assetId);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
