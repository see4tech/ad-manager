/**
 * Configuración de clientes Supabase.
 *
 * - createBrowserSupabase: cliente para componentes de cliente (anon key).
 * - createServerSupabase: cliente para Server Components / Route Handlers,
 *   respetando la sesión vía cookies (RLS aplica según el usuario autenticado).
 * - createServiceSupabase: cliente con service_role para tareas de backend
 *   (cron, webhooks). NUNCA exponer al cliente; salta RLS.
 */
import {
  createBrowserClient,
  createServerClient,
  type CookieOptions,
} from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createBrowserSupabase() {
  return createBrowserClient(url, anonKey);
}

export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component sin respuesta mutable: ignorar.
        }
      },
    },
  });
}

/** Solo backend. Requiere SUPABASE_SERVICE_ROLE_KEY. */
export function createServiceSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
