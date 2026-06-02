import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { createServerSupabase } from '@/lib/supabase';
import type { Asset, ScheduledPost } from '@/types';
import { cn } from '@/lib/utils';
import { ScheduleDialog } from './schedule-dialog';
import { deleteScheduledPost } from './actions';
import { Button } from '@/app/components/ui/button';
import { Trash2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

const STATUS_COLOR: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-700',
  published: 'bg-green-500/15 text-green-700',
  failed: 'bg-destructive/15 text-destructive',
};

export default async function CalendarPage() {
  const supabase = createServerSupabase();

  const today = new Date();
  const gridStart = startOfWeek(startOfMonth(today), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(today), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const [{ data: posts }, { data: assets }] = await Promise.all([
    supabase
      .from('scheduled_posts')
      .select('*')
      .gte('scheduled_at', gridStart.toISOString())
      .lte('scheduled_at', gridEnd.toISOString())
      .order('scheduled_at'),
    supabase.from('assets').select('id, name').order('created_at', {
      ascending: false,
    }),
  ]);

  const byDay = new Map<string, ScheduledPost[]>();
  for (const p of (posts as ScheduledPost[] | null) ?? []) {
    const key = format(new Date(p.scheduled_at!), 'yyyy-MM-dd');
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(p);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {format(today, 'MMMM yyyy')}
        </h1>
        <ScheduleDialog assets={(assets as Pick<Asset, 'id' | 'name'>[]) ?? []} />
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
          <div key={d} className="bg-card p-2 text-center font-medium">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const dayPosts = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={cn(
                'min-h-[96px] bg-card p-1.5',
                !isSameMonth(day, today) && 'text-muted-foreground opacity-60',
                isSameDay(day, today) && 'ring-2 ring-ring ring-inset',
              )}
            >
              <div className="mb-1 text-xs">{format(day, 'd')}</div>
              <div className="space-y-1">
                {dayPosts.map((p) => (
                  <form
                    key={p.id}
                    action={deleteScheduledPost}
                    className={cn(
                      'group flex items-center justify-between gap-1 rounded px-1.5 py-0.5 text-[11px]',
                      STATUS_COLOR[p.status],
                    )}
                  >
                    <span className="truncate">
                      {format(new Date(p.scheduled_at!), 'HH:mm')}{' '}
                      {p.platforms.join(', ')}
                    </span>
                    <input type="hidden" name="id" value={p.id} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </form>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
