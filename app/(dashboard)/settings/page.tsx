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

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const REDIRECT = `${SITE}/api/social/callback`;

/** URLs de autorización OAuth por plataforma. */
function authorizeUrl(platform: SocialPlatform): string {
  if (platform === 'linkedin') {
    const p = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.LINKEDIN_CLIENT_ID ?? '',
      redirect_uri: `${REDIRECT}?platform=linkedin`,
      scope: 'w_member_social r_liteprofile',
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${p}`;
  }
  // Meta (facebook / instagram comparten app).
  const p = new URLSearchParams({
    client_id: process.env.META_APP_ID ?? '',
    redirect_uri: `${REDIRECT}?platform=${platform}`,
    scope:
      'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish',
    response_type: 'code',
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${p}`;
}

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
    .select('platform');
  const connected = new Set((connections ?? []).map((c) => c.platform));

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
          const isConnected = connected.has(id);
          return (
            <Card key={id}>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-base">{label}</CardTitle>
                {isConnected ? (
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> Conectado
                  </span>
                ) : (
                  <Button asChild size="sm" variant="outline">
                    <a href={authorizeUrl(id)}>
                      <Link2 className="h-4 w-4" /> Conectar
                    </a>
                  </Button>
                )}
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Publica contenido programado en {label} desde el calendario.
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
