'use client';

import { format } from 'date-fns';
import { Download, Trash2 } from 'lucide-react';
import type { ScheduledPost } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/button';
import { deleteScheduledPost, getPostDownload } from './actions';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700',
  published: 'bg-green-500/15 text-green-700',
  failed: 'bg-destructive/15 text-destructive',
};

function triggerDownload(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Descarga el post: caption como .txt + el media (si lo tiene). */
async function downloadPost(postId: string) {
  try {
    const { caption, mediaUrl, mediaName } = await getPostDownload(postId);
    if (caption) {
      const blob = new Blob([caption], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `caption_${postId.slice(0, 8)}.txt`);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    if (mediaUrl) triggerDownload(mediaUrl, mediaName ?? 'media');
    if (!caption && !mediaUrl) alert('Este post no tiene contenido descargable.');
  } catch (e) {
    alert(`No se pudo descargar: ${(e as Error).message}`);
  }
}

export function PostChip({ post }: { post: ScheduledPost }) {
  return (
    <div
      className={cn(
        'group flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[11px]',
        STATUS_COLOR[post.status],
      )}
    >
      <span className="truncate">
        {format(new Date(post.scheduled_at), 'HH:mm')} {post.platforms.join(', ')}
      </span>
      <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
        <button
          type="button"
          title="Descargar post (caption + media)"
          onClick={() => downloadPost(post.id)}
          className="p-0.5"
        >
          <Download className="h-3 w-3" />
        </button>
        <form action={deleteScheduledPost}>
          <input type="hidden" name="id" value={post.id} />
          <Button variant="ghost" size="icon" className="h-4 w-4">
            <Trash2 className="h-3 w-3" />
          </Button>
        </form>
      </div>
    </div>
  );
}
