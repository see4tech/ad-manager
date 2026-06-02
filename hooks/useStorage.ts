'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSignedUrls } from '@/app/(dashboard)/media/actions';

/**
 * Resuelve Signed URLs (1h) para rutas del bucket de Supabase Storage.
 * Re-firma automáticamente antes de expirar para no romper reproducción.
 */
export function useStorage(paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const key = paths.join('|');

  const refresh = useCallback(async () => {
    if (paths.length === 0) {
      setUrls({});
      return;
    }
    setLoading(true);
    try {
      const map = await getSignedUrls(paths);
      setUrls(map);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void refresh();
    // Re-firmar a los 55 min (antes del TTL de 60 min).
    const t = setInterval(() => void refresh(), 55 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  return { urls, loading, refresh };
}
