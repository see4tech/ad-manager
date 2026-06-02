'use client';

import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import type { Asset, SocialPlatform } from '@/types';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { schedulePost } from './actions';

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin'];

export function ScheduleDialog({
  assets,
  defaultDate,
}: {
  assets: Pick<Asset, 'id' | 'name'>[];
  defaultDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Programar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Programar publicación</DialogTitle>
        </DialogHeader>
        <form
          ref={form}
          action={async (fd) => {
            await schedulePost(fd);
            setOpen(false);
            form.current?.reset();
          }}
          className="space-y-4"
        >
          <div>
            <label className="mb-1 block text-sm">Activo</label>
            <select
              name="asset_id"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Solo texto —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <textarea
            name="caption"
            placeholder="Texto / caption del post…"
            className="min-h-[80px] w-full rounded-md border border-input bg-background p-3 text-sm"
          />

          <Input
            name="scheduled_at"
            type="datetime-local"
            defaultValue={defaultDate}
            required
          />

          <fieldset className="space-y-1">
            <legend className="text-sm">Plataformas</legend>
            <div className="flex gap-4">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm capitalize">
                  <input type="checkbox" name="platforms" value={p} />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>

          <Button type="submit" className="w-full">
            Programar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
