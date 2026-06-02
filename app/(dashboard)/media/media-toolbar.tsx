'use client';

import { useRef, useState } from 'react';
import { FolderPlus, Upload } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { createFolder, uploadAsset } from './actions';

export function MediaToolbar({ folderId }: { folderId: string | null }) {
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const folderForm = useRef<HTMLFormElement>(null);
  const uploadForm = useRef<HTMLFormElement>(null);

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

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogTrigger asChild>
          <Button size="sm">
            <Upload className="h-4 w-4" /> Subir archivo
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir activos</DialogTitle>
          </DialogHeader>
          <form
            ref={uploadForm}
            action={async (fd) => {
              await uploadAsset(fd);
              setUploadOpen(false);
              uploadForm.current?.reset();
            }}
            className="space-y-4"
          >
            <input type="hidden" name="folder_id" value={folderId ?? ''} />
            <Input
              name="file"
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              required
            />
            <p className="text-xs text-muted-foreground">
              Puedes seleccionar varios archivos a la vez.
            </p>
            <Button type="submit" className="w-full">
              Subir
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
