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
import { PostChip } from './post-chip';

export const dynamic = 'force-dynamic';

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
    supabase
      .from('assets')
      .select('id, name')
      .eq('is_draft', false)
      .order('created_at', { ascending: false }),
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
                  <PostChip key={p.id} post={p} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
