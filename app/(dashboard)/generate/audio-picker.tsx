'use client';

import { useState } from 'react';
import { Mic, Check } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { cn } from '@/lib/utils';
import { listVoiceAudios, type AudioReference } from './actions';

/** Diálogo para elegir un activo de audio (voz) para lip-sync. */
export function AudioPicker({
  onSelect,
}: {
  onSelect: (a: AudioReference) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AudioReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await listVoiceAudios());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function confirm() {
    const a = items.find((i) => i.id === sel);
    if (a) onSelect(a);
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="Voz para sincronizar">
          <Mic className="h-4 w-4" /> Voz
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Voz para sincronizar (lip-sync)</DialogTitle>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes audios. Súbelos en Activos (acepta varios a la vez).
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => setSel(it.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border-2 p-2 text-left',
                  sel === it.id ? 'border-primary' : 'border-transparent',
                )}
              >
                <span className="flex-1 truncate text-sm">{it.name}</span>
                <audio
                  src={it.url}
                  controls
                  className="h-8"
                  onClick={(e) => e.stopPropagation()}
                />
                {sel === it.id && <Check className="h-4 w-4 text-primary" />}
              </button>
            ))}
          </div>
        )}
        <Button onClick={confirm} disabled={!sel}>
          Usar esta voz
        </Button>
      </DialogContent>
    </Dialog>
  );
}
