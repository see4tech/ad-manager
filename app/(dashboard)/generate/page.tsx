'use client';

import { useRef, useState } from 'react';
import { Sparkles, X, CornerDownLeft } from 'lucide-react';
import type { AssetType } from '@/types';
import { Button } from '@/app/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/card';
import {
  ReferencePicker,
  type SelectedReference,
} from '../chat/reference-picker';
import { generateMedia } from './actions';

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'image', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Texto' },
];

/** Tipos que admiten imágenes de referencia. */
const SUPPORTS_REFS: AssetType[] = ['image', 'video'];

export default function GeneratePage() {
  const [type, setType] = useState<AssetType>('image');
  const [prompt, setPrompt] = useState('');
  const [refs, setRefs] = useState<SelectedReference[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const showRefs = SUPPORTS_REFS.includes(type);

  function addRefs(newRefs: SelectedReference[]) {
    setRefs((prev) => [...prev, ...newRefs]);
  }

  function removeRef(idx: number) {
    setRefs((prev) => prev.filter((_, i) => i !== idx));
  }

  const tokenFor = (idx: number) => `[Imagen ${idx + 1}]`;

  /** Inserta el marcador de una referencia en la posición del cursor. */
  function insertToken(idx: number) {
    const token = tokenFor(idx);
    const el = promptRef.current;
    if (!el) {
      setPrompt((p) => `${p}${token} `);
      return;
    }
    const start = el.selectionStart ?? prompt.length;
    const end = el.selectionEnd ?? prompt.length;
    const next = `${prompt.slice(0, start)}${token} ${prompt.slice(end)}`;
    setPrompt(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  async function generate() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setStatus(null);
    setText(null);
    try {
      const fd = new FormData();
      fd.set('type', type);
      fd.set('prompt', prompt);
      if (showRefs) {
        for (const r of refs) fd.append('reference_image', r.url);
      }
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
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Generar contenido</h1>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo activo multimedia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tipo */}
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

          {/* Referencias desde activos */}
          {showRefs && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">
                  Imágenes de referencia
                </span>
                <ReferencePicker onAdd={addRefs} />
              </div>
              {refs.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Elige imágenes de tus activos y usa “Insertar” para marcar en
                  el texto dónde quieres que aparezca cada una.
                </p>
              ) : (
                <div className="space-y-2">
                  {refs.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.url}
                        alt={r.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                      <span className="text-xs font-medium">
                        {tokenFor(i)}
                      </span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {r.name}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => insertToken(i)}
                      >
                        <CornerDownLeft className="h-3 w-3" /> Insertar
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => removeRef(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prompt */}
          <textarea
            ref={promptRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              showRefs
                ? 'Describe la escena… ej: “El producto [Imagen 1] gira sobre fondo blanco, el logo [Imagen 2] aparece al final.”'
                : 'Describe lo que quieres generar…'
            }
            className="min-h-[110px] w-full rounded-md border border-input bg-background p-3 text-sm"
          />

          <Button
            type="button"
            onClick={generate}
            disabled={loading || !prompt.trim()}
            className="w-full"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Generando…' : 'Generar'}
          </Button>

          {status && (
            <p className="text-sm text-muted-foreground">{status}</p>
          )}
          {text && (
            <pre className="whitespace-pre-wrap rounded-md bg-secondary p-3 text-sm">
              {text}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
