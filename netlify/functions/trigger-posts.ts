/**
 * Netlify Scheduled Function (Node.js).
 * Se ejecuta periódicamente (ver schedule en netlify.toml) y procesa las
 * publicaciones programadas pendientes.
 */
import type { Config } from '@netlify/functions';
import { processPendingPosts } from '../../lib/scheduler';

export default async function handler() {
  const summary = await processPendingPosts();
  return new Response(JSON.stringify(summary), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/5 * * * *',
};
