/**
 * Proxy de imágenes para modelos externos (OpenRouter video).
 *
 * Las Signed URLs de Supabase fallan con 400 cuando terceros (OpenRouter)
 * las fetchean directamente. Este endpoint sirve la imagen desde nuestro
 * dominio con una URL limpia que cualquier servidor puede fetchear.
 *
 *   GET /api/image-proxy?id=<assetId>
 *
 * No requiere auth de usuario (el assetId actúa como token opaco).
 * El asset debe existir en la DB (validación server-side con service role).
 * TTL implícito: la imagen se sirve directamente desde Storage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';

const BUCKET = 'assets';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) {
    return new NextResponse('Falta id.', { status: 400 });
  }

  const supabase = createServiceSupabase();

  // Verificar que el activo existe y es una imagen.
  const { data: asset, error } = await supabase
    .from('assets')
    .select('content_url, type')
    .eq('id', id)
    .in('type', ['image'])
    .single();

  if (error || !asset?.content_url) {
    return new NextResponse('No encontrado.', { status: 404 });
  }

  // Descargar el binario desde Storage con service role (sin Signed URL).
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(asset.content_url);

  if (dlErr || !blob) {
    return new NextResponse('Error al obtener imagen.', { status: 502 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || 'image/png';

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // Cacheable 1h — suficiente para la duración del job de video.
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
