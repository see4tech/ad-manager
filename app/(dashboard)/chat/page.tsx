'use client';

import { useRef, useState } from 'react';
import { Send, Paperclip, X } from 'lucide-react';
import type { ChatMessage, ContentPart } from '@/lib/openrouter';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { cn } from '@/lib/utils';
import { ReferencePicker, type SelectedReference } from './reference-picker';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fast, setFast] = useState(false);
  const [refs, setRefs] = useState<SelectedReference[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  function addRefs(newRefs: SelectedReference[]) {
    setRefs((prev) => [...prev, ...newRefs]);
  }

  function removeRef(idx: number) {
    setRefs((prev) => prev.filter((_, i) => i !== idx));
  }

  // Adjuntar imágenes desde el equipo (se envían como data URL base64).
  async function onFiles(files: FileList | null) {
    if (!files) return;
    const read = (f: File) =>
      new Promise<SelectedReference>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve({ name: f.name, url: String(fr.result) });
        fr.onerror = reject;
        fr.readAsDataURL(f);
      });
    const loaded = await Promise.all(
      Array.from(files)
        .filter((f) => f.type.startsWith('image/'))
        .map(read),
    );
    addRefs(loaded);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function send() {
    const text = input.trim();
    if ((!text && refs.length === 0) || loading) return;

    // Construir contenido multimodal: texto + imágenes de referencia.
    const content: string | ContentPart[] =
      refs.length === 0
        ? text
        : [
            { type: 'text', text: text || 'Usa estas imágenes como referencia.' },
            ...refs.map(
              (r): ContentPart => ({
                type: 'image_url',
                image_url: { url: r.url },
              }),
            ),
          ];

    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setRefs([]);
    setLoading(true);
    try {
      const res = await fetch('/api/openrouter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, fast }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setMessages([...next, { role: 'assistant', content: data.content }]);
    } catch (err) {
      setMessages([
        ...next,
        { role: 'assistant', content: `⚠️ ${(err as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-3rem)] max-w-2xl flex-col">
      <div className="flex items-center justify-between pb-4">
        <h1 className="text-2xl font-semibold">Chat IA · Copys</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={fast}
            onChange={(e) => setFast(e.target.checked)}
          />
          Modo rápido
        </label>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-lg border p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Pide un copy publicitario. Adjunta imágenes de referencia (de tu
            librería o tu equipo) y el asistente las tendrá en cuenta.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={i} message={m} />
        ))}
        {loading && (
          <div className="animate-pulse text-sm text-muted-foreground">
            Generando…
          </div>
        )}
      </div>

      {/* Chips de referencias seleccionadas */}
      {refs.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-3">
          {refs.map((r, i) => (
            <div
              key={i}
              className="relative h-14 w-14 overflow-hidden rounded-md border"
              title={r.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.url} alt={r.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeRef(i)}
                className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-4">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <Button
          variant="outline"
          size="icon"
          title="Adjuntar desde el equipo"
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <ReferencePicker onAdd={addRefs} />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Escribe tu prompt… (puedes adjuntar referencias)"
          disabled={loading}
        />
        <Button onClick={send} disabled={loading} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const parts = Array.isArray(message.content) ? message.content : null;
  const text = parts
    ? parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
    : typeof message.content === 'string'
      ? message.content
      : '';
  const images = parts
    ? parts.filter(
        (p): p is { type: 'image_url'; image_url: { url: string } } =>
          p.type === 'image_url',
      )
    : [];

  return (
    <div
      className={cn(
        'max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm',
        isUser ? 'ml-auto bg-primary text-primary-foreground' : 'bg-secondary',
      )}
    >
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={img.image_url.url}
              alt="referencia"
              className="h-16 w-16 rounded object-cover"
            />
          ))}
        </div>
      )}
      {text && <div className="whitespace-pre-wrap">{text}</div>}
    </div>
  );
}
