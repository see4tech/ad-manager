import { CheckCircle2, Link2 } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import type { SocialPlatform } from '@/types';
import { disconnect } from './actions';

export const dynamic = 'force-dynamic';

const PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const supabase = createServerSupabase();
  const { data: connections } = await supabase
    .from('social_connections')
    .select('platform, metadata');
  const byPlatform = new Map(
    (connections ?? []).map((c) => [c.platform as SocialPlatform, c.metadata]),
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Conexiones</h1>
      {searchParams.connected && (
        <p className="text-sm text-green-600">Cuenta conectada correctamente.</p>
      )}
      {searchParams.error && (
        <p className="text-sm text-destructive">{searchParams.error}</p>
      )}
      <div className="space-y-3">
        {PLATFORMS.map(({ id, label }) => {
          const meta = byPlatform.get(id) as Record<string, unknown> | undefined;
          const isConnected = byPlatform.has(id);
          const detail =
            (meta?.pageName as string) ?? (meta?.authorUrn as string) ?? '';
          return (
            <Card key={id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{label}</CardTitle>
                {isConnected ? (
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> Conectado
                    </span>
                    <form action={disconnect}>
                      <input type="hidden" name="platform" value={id} />
                      <Button size="sm" variant="ghost">
                        Desconectar
                      </Button>
                    </form>
                  </div>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/social/connect?platform=${id}`}>
                      <Link2 className="h-4 w-4" /> Conectar
                    </a>
                  </Button>
                )}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {isConnected && detail
                  ? `Publicando como: ${detail}`
                  : `Publica contenido programado en ${label} desde el calendario.`}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
