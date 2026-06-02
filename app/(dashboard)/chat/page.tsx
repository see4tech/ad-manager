'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '@/lib/openrouter';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { cn } from '@/lib/utils';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [fast, setFast] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
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
            Pide un copy publicitario. El asistente aplica marcos AIDA y PAS.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
              m.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-secondary',
            )}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="animate-pulse text-sm text-muted-foreground">
            Generando…
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Ej: Escribe un anuncio para Instagram con marco AIDA…"
          disabled={loading}
        />
        <Button onClick={send} disabled={loading} size="icon">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
