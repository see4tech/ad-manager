'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para el navegador (componentes cliente).
 * Módulo separado de lib/supabase.ts para no arrastrar `next/headers`
 * (solo-servidor) al bundle del cliente.
 */
export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
