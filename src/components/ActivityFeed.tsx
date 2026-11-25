import { useLayoutEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, isToday, isYesterday } from 'date-fns';
import { Camera, Trash2, RotateCcw, ScanLine, RefreshCw, History, ShieldOff, Clock, Undo2, Pencil, Activity } from 'lucide-react';
import { listActivityLog } from '@/lib/tauri';
import { gsap, dur } from '@/lib/motion';
import type { ActivityEntry } from '@/lib/types';

interface Props {
  folderId: number;
  onOpenFile?: (relPath: string) => void;
}

function describe(e: ActivityEntry): { icon: React.ReactNode; title: string; detail?: string; tone?: 'neg' | 'accent' } {
  switch (e.action) {
    case 'snapshot_created': {
      const by: Record<string, { icon: React.ReactNode; title: string }> = {
        manual: { icon: <Camera size={13} />, title: 'Saved by hand' },
        interval: { icon: <Clock size={13} />, title: 'Saved on schedule' },
        'pre-rewind': { icon: <Undo2 size={13} />, title: 'Kept before a restore' },
        initial: { icon: <ScanLine size={13} />, title: 'First version' },
      };
      return by[e.reason ?? ''] ?? { icon: <Pencil size={13} />, title: 'Saved' };
    }
    case 'file_deleted': return { icon: <Trash2 size={13} />, title: 'Deleted', tone: 'neg' };
    case 'rewind': return { icon: <RotateCcw size={13} />, title: 'Restored an earlier version', tone: 'accent' };
    case 'bulk_recover': return { icon: <History size={13} />, title: 'Recovered files', detail: e.reason ?? undefined, tone: 'accent' };
    case 'watcher_restart': return { icon: <RefreshCw size={13} />, title: 'Watching restarted' };
    case 'scan_complete': {
      const kv = Object.fromEntries((e.reason ?? '').split(' ').map((p) => p.split('=')));
      const total = kv.total;
      const changed = kv.new_or_changed ?? kv.new;
      return {
        icon: <ScanLine size={13} />,
        title: 'Checked the folder',
        detail: total !== undefined && changed !== undefined
          ? `${Number(total).toLocaleString()} files looked at, ${Number(changed).toLocaleString()} new or changed`
          : undefined,
      };
    }
    case 'app_data_excluded': {
      const removed = (e.reason ?? '').match(/removed=(\d+)/)?.[1];
      return {
        icon: <ShieldOff size={13} />,
        title: "Skipped ZFileTimeMachine's own data",
        detail: removed ? `${Number(removed).toLocaleString()} ${removed === '1' ? 'file' : 'files'} removed from tracking` : undefined,
      };
    }
    default: return { icon: <Activity size={13} />, title: e.action.replace(/_/g, ' ') };
  }
}

function dayLabel(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMMM d');
}

export function ActivityFeed({ folderId, onOpenFile }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const animated = useRef(false);
  const { data: entries, isLoading } = useQuery({
    queryKey: ['activity', folderId],
    queryFn: () => listActivityLog(folderId, 200),
    refetchInterval: 5_000,
  });

  useLayoutEffect(() => {
    if (!entries?.length || !listRef.current || animated.current) return;
    animated.current = true;
    const rows = listRef.current.querySelectorAll('[data-row]');
    gsap.fromTo(rows, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: dur(0.45), stagger: Math.min(0.02, 0.6 / rows.length), ease: 'zftm', clearProps: 'transform' });
  }, [entries]);

  if (isLoading) {
    return (
      <div className="flex-1 px-6 pt-5 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-7 h-7 rounded-full" />
            <div className="skeleton h-3" style={{ width: `${30 + i * 8}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex-1 grid place-items-center px-8 text-center">
        <div>
          <Activity size={22} className="mx-auto text-faint mb-3" />
          <p className="text-sm text-muted-foreground">Nothing has happened in this folder yet.</p>
        </div>
      </div>
    );
  }

  const groups: { label: string; items: ActivityEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(e); else groups.push({ label, items: [e] });
  }

  return (
    <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 pb-10 scroll-fade-y">
      <div className="max-w-[820px]">
        {groups.map((g) => (
          <section key={g.label}>
            <h3 data-row className="px-3 pt-5 pb-2 text-2xs font-medium text-faint">{g.label}</h3>
            {g.items.map((e, idx) => {
              const d = describe(e);
              const clickable = !!(e.relPath && onOpenFile && e.action !== 'file_deleted');
              const last = idx === g.items.length - 1;
              const Tag = clickable ? 'button' : 'div';
              return (
                <Tag
                  key={e.id}
                  data-row
                  onClick={clickable ? () => onOpenFile!(e.relPath!) : undefined}
                  className={`relative w-full flex items-start gap-3 px-3 py-2 rounded-[calc(9px*var(--rs))] text-left ${clickable ? 'hover:bg-foreground/[0.04]' : ''}`}
                >
                  {!last && <span className="absolute left-[25px] top-9 -bottom-1 w-px bg-[hsl(var(--line))]" aria-hidden />}
                  <span className={`relative w-7 h-7 rounded-full grid place-items-center shrink-0 shadow-[inset_0_0_0_1px_hsl(var(--line))]
                                    ${d.tone === 'neg' ? 'bg-negative/10 text-negative' : d.tone === 'accent' ? 'bg-primary/12 text-primary' : 'bg-surface-raised text-muted-foreground'}`}>
                    {d.icon}
                  </span>
                  <span className="flex-1 min-w-0 pt-1">
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="text-sm text-foreground shrink-0">{d.title}</span>
                      {e.relPath && <span className="text-sm text-muted-foreground font-mono truncate">{e.relPath}</span>}
                    </span>
                    {d.detail && <span className="block text-xs text-faint mt-0.5">{d.detail}</span>}
                  </span>
                  <time className="text-xs text-faint shrink-0 pt-1.5 tabular-nums" title={format(new Date(e.timestamp), 'PPpp')}>
                    {format(new Date(e.timestamp), 'HH:mm')}
                  </time>
                </Tag>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
