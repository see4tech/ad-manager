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
  // También acepta ?path=<storage-path> para Supabase Signed URLs extraídas por el backend.
  const storagePath = req.nextUrl.searchParams.get('path');

  if (!id && !storagePath) {
    return new NextResponse('Falta id o path.', { status: 400 });
  }

  const supabase = createServiceSupabase();
  let contentPath: string;

  if (id) {
    // Buscar por asset ID
    const { data: asset, error } = await supabase
      .from('assets')
      .select('content_url, type')
      .eq('id', id)
      .single();
    if (error || !asset?.content_url) {
      return new NextResponse(`No encontrado. id=${id}`, { status: 404 });
    }
    contentPath = asset.content_url;
  } else {
    // storagePath directo (viene del backend al extraerlo de una Signed URL)
    contentPath = storagePath!;
  }

  // Descargar el binario desde Storage con service role (sin Signed URL).
  const { data: blob, error: dlErr } = await supabase.storage
    .from(BUCKET)
    .download(contentPath);

  if (dlErr || !blob) {
    return new NextResponse('Error al obtener imagen.', { status: 502 });
  }

  const buf = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || 'image/png';

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      // NO cachear en CDN: Netlify ignoraba el query string y servía
      // la primera respuesta para todos los ?id=. Cada imagen es distinta.
      'Cache-Control': 'private, no-store',
      // Forzar cache key único por URL completa (query string incluido).
      'Netlify-CDN-Cache-Control': 'no-store',
      'Vary': 'Accept',
    },
  });
}
