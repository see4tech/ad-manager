'use client';

import { useRef, useState } from 'react';
import { FolderPlus, Upload } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import type { AssetType } from '@/types';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { createFolder, registerAssets } from './actions';

const BUCKET = 'assets';

function assetTypeFromMime(mime: string): AssetType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'text';
}

export function MediaToolbar({ folderId }: { folderId: string | null }) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const folderForm = useRef<HTMLFormElement>(null);

  async function handleUpload() {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setProgress('');
    try {
      const supabase = createBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sesión expirada. Inicia sesión de nuevo.');

      const registered: {
        folder_id: string | null;
        name: string;
        type: AssetType;
        content_url: string;
      }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(`Subiendo ${i + 1}/${files.length}: ${file.name}`);
        const safe = file.name.replace(/[^\w.\-]/g, '_');
        const path = `${user.id}/${folderId ?? 'root'}/${Date.now()}_${i}_${safe}`;
        // Subida directa a Storage (no pasa por la Netlify Function).
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw new Error(`${file.name}: ${error.message}`);
        registered.push({
          folder_id: folderId,
          name: file.name,
          type: assetTypeFromMime(file.type),
          content_url: path,
        });
      }

      // Inserta toda la metadata en un solo paso (payload pequeño).
      await registerAssets(registered);

      setFiles([]);
      setUploadOpen(false);
    } catch (e) {
      setProgress(`⚠️ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderPlus className="h-4 w-4" /> Nueva carpeta
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva carpeta</DialogTitle>
          </DialogHeader>
          <form
            ref={folderForm}
            action={async (fd) => {
              await createFolder(fd);
              setFolderOpen(false);
              folderForm.current?.reset();
            }}
            className="space-y-4"
          >
            <input type="hidden" name="parent_id" value={folderId ?? ''} />
            <Input name="name" placeholder="Nombre de la carpeta" required />
            <Button type="submit" className="w-full">
              Crear
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onOpenChange={(o) => {
          if (!busy) {
            setUploadOpen(o);
            if (!o) {
              setFiles([]);
              setProgress('');
            }
          }
        }}
      >
        <DialogTrigger asChild>
          <Button size="sm">
            <Upload className="h-4 w-4" /> Subir archivo
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir activos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              disabled={busy}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="text-xs text-muted-foreground">
              {files.length > 0
                ? `${files.length} archivo(s) seleccionado(s).`
                : 'Puedes seleccionar varios archivos a la vez.'}
            </p>
            {progress && (
              <p className="text-xs text-muted-foreground">{progress}</p>
            )}
            <Button
              onClick={handleUpload}
              disabled={busy || files.length === 0}
              className="w-full"
            >
              {busy ? 'Subiendo…' : 'Subir'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
