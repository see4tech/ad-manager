'use client';

import { FileText, MoreVertical, Trash2 } from 'lucide-react';
import { useStorage } from '@/hooks/useStorage';
import type { Asset } from '@/types';
import { Card, CardContent } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/app/components/ui/dropdown-menu';
import { deleteAsset } from './actions';

export function AssetGrid({ assets }: { assets: Asset[] }) {
  const paths = assets
    .map((a) => a.content_url)
    .filter((p): p is string => Boolean(p));
  const { urls } = useStorage(paths);

  if (assets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay activos en esta carpeta todavía.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {assets.map((asset) => {
        const url = asset.content_url ? urls[asset.content_url] : undefined;
        return (
          <Card key={asset.id} className="overflow-hidden">
            <div className="flex aspect-video items-center justify-center bg-muted">
              {asset.status === 'processing' ? (
                <span className="animate-pulse text-xs text-muted-foreground">
                  Procesando…
                </span>
              ) : (
                <MediaPreview asset={asset} url={url} />
              )}
            </div>
            <CardContent className="flex items-center justify-between gap-2 p-3">
              <span className="truncate text-sm" title={asset.name}>
                {asset.name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <form action={deleteAsset}>
                    <input type="hidden" name="id" value={asset.id} />
                    <input
                      type="hidden"
                      name="path"
                      value={asset.content_url ?? ''}
                    />
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full text-destructive">
                        <Trash2 className="h-4 w-4" /> Eliminar
                      </button>
                    </DropdownMenuItem>
                  </form>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MediaPreview({ asset, url }: { asset: Asset; url?: string }) {
  if (!url) {
    return <FileText className="h-8 w-8 text-muted-foreground" />;
  }
  switch (asset.type) {
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <img src={url} alt={asset.name} className="h-full w-full object-cover" />
      );
    case 'video':
      return <video src={url} controls className="h-full w-full" />;
    case 'audio':
      return <audio src={url} controls className="w-full px-2" />;
    default:
      return <FileText className="h-8 w-8 text-muted-foreground" />;
  }
}
