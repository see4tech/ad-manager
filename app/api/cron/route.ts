/**
 * Disparador manual / externo del scheduler.
 * Protegido por CRON_SECRET (cabecera Authorization: Bearer <secret>).
 * Útil para pruebas o como respaldo de la Scheduled Function de Netlify.
 */
import { NextRequest, NextResponse } from 'next/server';
import { processPendingPosts } from '@/lib/scheduler';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  try {
    const summary = await processPendingPosts();
    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
