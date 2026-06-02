import Link from 'next/link';
import { Folder as FolderIcon, Trash2 } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase';
import type { Asset, Folder } from '@/types';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { AssetGrid } from './asset-grid';
import { MediaToolbar } from './media-toolbar';
import { deleteFolder } from './actions';

export const dynamic = 'force-dynamic';

export default async function MediaPage({
  searchParams,
}: {
  searchParams: { folder?: string };
}) {
  const folderId = searchParams.folder ?? null;
  const supabase = createServerSupabase();

  // Sub-carpetas del nivel actual y activos contenidos.
  const foldersQuery = supabase
    .from('folders')
    .select('*')
    .order('name');
  const subfolders = folderId
    ? foldersQuery.eq('parent_id', folderId)
    : foldersQuery.is('parent_id', null);

  const assetsQuery = supabase.from('assets').select('*').order('created_at', {
    ascending: false,
  });
  const assets = folderId
    ? assetsQuery.eq('folder_id', folderId)
    : assetsQuery.is('folder_id', null);

  const [{ data: folders }, { data: assetRows }] = await Promise.all([
    subfolders,
    assets,
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Activos</h1>
          {folderId && (
            <Link
              href="/media"
              className="text-sm text-muted-foreground underline"
            >
              ← Raíz
            </Link>
          )}
        </div>
        <MediaToolbar folderId={folderId} />
      </div>

      {(folders as Folder[] | null)?.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {(folders as Folder[]).map((f) => (
            <Card
              key={f.id}
              className="group flex items-center justify-between gap-2 p-3"
            >
              <Link
                href={`/media?folder=${f.id}`}
                className="flex min-w-0 items-center gap-2"
              >
                <FolderIcon className="h-5 w-5 shrink-0" />
                <span className="truncate text-sm">{f.name}</span>
              </Link>
              <form action={deleteFolder}>
                <input type="hidden" name="id" value={f.id} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </form>
            </Card>
          ))}
        </div>
      ) : null}

      <AssetGrid assets={(assetRows as Asset[]) ?? []} />
    </div>
  );
}
