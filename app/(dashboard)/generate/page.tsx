'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { AssetType } from '@/types';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import { generateMedia } from './actions';

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'image', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Texto' },
];

export default function GeneratePage() {
  const [type, setType] = useState<AssetType>('image');
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Generar contenido</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo activo multimedia</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async (fd) => {
              setLoading(true);
              setStatus(null);
              setText(null);
              try {
                fd.set('type', type);
                const res = await generateMedia(fd);
                if (res.text) setText(res.text);
                setStatus(
                  res.status === 'processing'
                    ? 'En proceso — aparecerá en Activos al completarse.'
                    : 'Listo — disponible en Activos.',
                );
              } catch (e) {
                setStatus(`⚠️ ${(e as Error).message}`);
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <Button
                  key={t.value}
                  type="button"
                  variant={type === t.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setType(t.value)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
            <Input
              name="prompt"
              placeholder="Describe lo que quieres generar…"
              required
            />
            <Button type="submit" disabled={loading} className="w-full">
              <Sparkles className="h-4 w-4" />
              {loading ? 'Generando…' : 'Generar'}
            </Button>
          </form>
          {status && (
            <p className="mt-4 text-sm text-muted-foreground">{status}</p>
          )}
          {text && (
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-secondary p-3 text-sm">
              {text}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
