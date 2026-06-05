'use client';

import { useState } from 'react';
import { ImagePlus, Check } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { cn } from '@/lib/utils';
import { listImageReferences, type ImageReference } from './actions';

export interface SelectedReference {
  /** Presente cuando viene de la librería (permite usar el proxy de imágenes). */
  id?: string;
  name: string;
  url: string;
}

/** Diálogo para elegir imágenes de la librería como referencias. */
export function ReferencePicker({
  onAdd,
}: {
  onAdd: (refs: SelectedReference[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ImageReference[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    try {
      setItems(await listImageReferences());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirm() {
    const refs = items
      .filter((i) => selected.has(i.id))
      .map((i) => ({ id: i.id, name: i.name, url: i.url }));
    onAdd(refs);
    setSelected(new Set());
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
        <Button variant="outline" size="icon" title="Imagen de la librería">
          <ImagePlus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Imágenes de referencia</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tienes imágenes en la librería. Súbelas en Activos o adjunta una
            desde tu equipo.
          </p>
        ) : (
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto">
            {items.map((it) => {
              const on = selected.has(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggle(it.id)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-md border-2',
                    on ? 'border-primary' : 'border-transparent',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={it.url}
                    alt={it.name}
                    className="h-full w-full object-cover"
                  />
                  {on && (
                    <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <Button onClick={confirm} disabled={selected.size === 0}>
          Añadir {selected.size > 0 ? `(${selected.size})` : ''}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
