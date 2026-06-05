'use client';

import { useRef, useState } from 'react';
import {
  Sparkles,
  X,
  CornerDownLeft,
  Loader2,
  Save,
  Trash2,
} from 'lucide-react';
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
import { AudioPicker } from './audio-picker';
import type { AudioReference } from './actions';

async function fetchPreview(assetId: string) {
  const r = await fetch(`/api/generate/asset?assetId=${assetId}`);
  if (!r.ok) throw new Error('preview');
  return r.json() as Promise<{
    status: 'processing' | 'ready' | 'failed';
    type: AssetType;
    url: string | null;
    error?: string | null;
  }>;
}

async function assetAction(assetId: string, action: 'save' | 'discard') {
  const r = await fetch('/api/generate/asset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, action }),
  });
  if (!r.ok) throw new Error((await r.json()).error ?? action);
}

const TYPES: { value: AssetType; label: string }[] = [
  { value: 'image', label: 'Imagen' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'text', label: 'Texto' },
];

const SUPPORTS_REFS: AssetType[] = ['image', 'video'];

type Phase = 'idle' | 'generating' | 'preview' | 'error';

export default function GeneratePage() {
  const [type, setType] = useState<AssetType>('image');
  const [prompt, setPrompt] = useState('');
  const [refs, setRefs] = useState<SelectedReference[]>([]);
  const [voice, setVoice] = useState<AudioReference | null>(null);

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<{
    assetId: string;
    type: AssetType;
    text?: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const pollCancel = useRef(false);

  const showRefs = SUPPORTS_REFS.includes(type);
  const busy = phase === 'generating';

  function addRefs(n: SelectedReference[]) {
    setRefs((p) => [...p, ...n]);
  }
  function removeRef(i: number) {
    setRefs((p) => p.filter((_, idx) => idx !== i));
  }
  const tokenFor = (i: number) => `[Imagen ${i + 1}]`;

  function insertToken(i: number) {
    const token = tokenFor(i);
    const el = promptRef.current;
    if (!el) return setPrompt((p) => `${p}${token} `);
    const s = el.selectionStart ?? prompt.length;
    const e = el.selectionEnd ?? prompt.length;
    setPrompt(`${prompt.slice(0, s)}${token} ${prompt.slice(e)}`);
    requestAnimationFrame(() => {
      el.focus();
      const pos = s + token.length + 1;
      el.setSelectionRange(pos, pos);
    });
  }

  function reset() {
    pollCancel.current = true;
    setPhase('idle');
    setResult(null);
    setPreviewUrl(null);
    setPrompt('');
    setRefs([]);
    setVoice(null);
  }

  /** Pollea el estado del activo hasta que esté listo (video/audio async). */
  async function poll(assetId: string, genType: AssetType) {
    pollCancel.current = false;
    const start = Date.now();
    const MAX = 12 * 60 * 1000;
    while (!pollCancel.current) {
      let p = null;
      try {
        p = await fetchPreview(assetId);
      } catch {
        /* reintentar */
      }
      if (p?.status === 'ready') {
        setPreviewUrl(p.url);
        setResult({ assetId, type: genType });
        setPhase('preview');
        return;
      }
      if (p?.status === 'failed') {
        setMessage(`⚠️ La generación falló: ${p.error ?? 'motivo desconocido'}`);
        setPhase('error');
        return;
      }
      if (Date.now() - start > MAX) {
        setMessage('Está tardando demasiado. Revisa más tarde o reintenta.');
        setPhase('error');
        return;
      }
      await new Promise((r) => setTimeout(r, 8000));
    }
  }

  async function generate() {
    if (!prompt.trim() || busy) return;
    const genType = type;
    setPhase('generating');
    setMessage(null);
    setPreviewUrl(null);
    setResult(null);
    try {
      const apiRes = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: genType,
          prompt,
          // Mandamos tanto el URL como el id del activo (si viene de la librería).
          // El backend usa el id para el proxy /api/image-proxy (URLs HTTP limpias).
          referenceImages: showRefs ? refs.map((r) => r.url) : [],
          referenceAssetIds: showRefs
            ? refs.map((r) => ('id' in r ? (r as { id?: string }).id ?? null : null))
            : [],
          voiceAudioId: genType === 'video' && voice ? voice.id : null,
        }),
      });
      const res = await apiRes.json();
      if (!apiRes.ok) throw new Error(res.error ?? 'Error al generar');

      if (genType === 'text') {
        setResult({ assetId: res.assetId, type: 'text', text: res.text });
        setPhase('preview');
        return;
      }
      if (res.status === 'ready') {
        const p = await fetchPreview(res.assetId);
        setPreviewUrl(p.url);
        setResult({ assetId: res.assetId, type: genType });
        setPhase('preview');
        return;
      }
      setResult({ assetId: res.assetId, type: genType });
      await poll(res.assetId, genType);
    } catch (e) {
      setMessage(`⚠️ ${(e as Error).message}`);
      setPhase('error');
    }
  }

  async function save() {
    if (!result) return;
    try {
      await assetAction(result.assetId, 'save');
      reset();
      setMessage('✅ Guardado en Archivos.');
    } catch (e) {
      setMessage(`⚠️ ${(e as Error).message}`);
    }
  }

  async function discard() {
    if (result) {
      try {
        await assetAction(result.assetId, 'discard');
      } catch {
        /* ignore */
      }
    }
    reset();
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Generar contenido</h1>
      <Card>
        <CardHeader>
          <CardTitle>
            {phase === 'preview'
              ? 'Vista previa'
              : phase === 'generating'
                ? 'Generando…'
                : 'Nuevo activo multimedia'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* ── Animación mientras genera ── */}
          {phase === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm font-medium">
                Generando {TYPES.find((t) => t.value === (result?.type ?? type))?.label.toLowerCase()}…
              </p>
              {(result?.type ?? type) === 'video' && (
                <p className="text-xs text-muted-foreground">
                  El video puede tardar varios minutos. No cierres esta página.
                </p>
              )}
            </div>
          )}

          {/* ── Vista previa + decisión ── */}
          {phase === 'preview' && result && (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-md border bg-muted">
                {result.type === 'image' && previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="Generado" className="w-full" />
                )}
                {result.type === 'video' && previewUrl && (
                  <video src={previewUrl} controls className="w-full" />
                )}
                {result.type === 'audio' && previewUrl && (
                  <audio src={previewUrl} controls className="w-full p-3" />
                )}
                {result.type === 'text' && (
                  <pre className="whitespace-pre-wrap p-3 text-sm">
                    {result.text}
                  </pre>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                ¿Guardar este activo en Archivos o descartarlo?
              </p>
              <div className="flex gap-2">
                <Button onClick={save} className="flex-1">
                  <Save className="h-4 w-4" /> Guardar en Archivos
                </Button>
                <Button onClick={discard} variant="outline" className="flex-1">
                  <Trash2 className="h-4 w-4" /> Descartar
                </Button>
              </div>
            </div>
          )}

          {/* ── Formulario (idle / error) ── */}
          {(phase === 'idle' || phase === 'error') && (
            <>
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
                      Elige imágenes de tus activos y usa “Insertar” para marcar
                      en el texto dónde quieres que aparezca cada una.
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

              {type === 'video' && (
                <div className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Voz (lip-sync)</p>
                    {voice ? (
                      <p className="truncate text-xs text-muted-foreground">
                        Sincronizar con: {voice.name}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Opcional: sincroniza el video con un audio de voz tuyo.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {voice && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setVoice(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <AudioPicker onSelect={setVoice} />
                  </div>
                </div>
              )}

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
                disabled={!prompt.trim()}
                className="w-full"
              >
                <Sparkles className="h-4 w-4" /> Generar
              </Button>

              {message && (
                <p className="text-sm text-muted-foreground">{message}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
