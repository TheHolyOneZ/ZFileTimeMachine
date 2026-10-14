import { useQuery } from '@tanstack/react-query';
import { listActivityLog } from '@/lib/tauri';
import { formatDistanceToNow, format } from 'date-fns';
import { Camera, Trash2, RotateCcw, Zap, AlertCircle, History, RefreshCw } from 'lucide-react';
import type { ActivityEntry } from '@/lib/types';

interface Props {
  folderId: number;
}

const ACTION_META: Record<string, {
  icon: React.ReactNode;
  label: string;
  colors: string;
}> = {
  snapshot_created: {
    icon: <Camera size={11} />,
    label: 'Snapshot',
    colors: 'bg-emerald-500/15 text-emerald-400',
  },
  file_deleted: {
    icon: <Trash2 size={11} />,
    label: 'Deleted',
    colors: 'bg-destructive/15 text-destructive/80',
  },
  rewind: {
    icon: <RotateCcw size={11} />,
    label: 'Rewound',
    colors: 'bg-primary/15 text-primary',
  },
  scan_complete: {
    icon: <Zap size={11} />,
    label: 'Scan complete',
    colors: 'bg-amber-500/15 text-amber-400',
  },
  watcher_restart: {
    icon: <AlertCircle size={11} />,
    label: 'Watcher restarted',
    colors: 'bg-amber-500/15 text-amber-400',
  },
  bulk_recover: {
    icon: <History size={11} />,
    label: 'Recovery',
    colors: 'bg-purple-500/15 text-purple-400',
  },
};

function getDefaultMeta(action: string) {
  return {
    icon: <RefreshCw size={11} />,
    label: action.replace(/_/g, ' '),
    colors: 'bg-secondary/80 text-muted-foreground/60',
  };
}

function getDateLabel(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStr = now.toDateString();
  const yestStr = new Date(now.getTime() - 86_400_000).toDateString();
  if (d.toDateString() === todayStr) return 'Today';
  if (d.toDateString() === yestStr) return 'Yesterday';
  return format(d, 'MMMM d');
}

interface Group {
  label: string;
  entries: ActivityEntry[];
}

function groupByDay(entries: ActivityEntry[]): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  for (const e of entries) {
    const label = getDateLabel(e.timestamp);
    if (!current || current.label !== label) {
      current = { label, entries: [] };
      groups.push(current);
    }
    current.entries.push(e);
  }
  return groups;
}

function humanizeReason(action: string, reason: string): string {
  if (action === 'scan_complete') {
    const kv = Object.fromEntries(reason.split(' ').map((p) => p.split('=')));
    const total = kv.total;
    const changed = kv.new_or_changed ?? kv.new;
    if (total !== undefined && changed !== undefined) {
      return `${total} file${total === '1' ? '' : 's'} checked · ${changed} new or changed`;
    }
  }
  const SOURCES: Record<string, string> = {
    change: 'Saved', manual: 'Taken manually', interval: 'Scheduled', 'pre-rewind': 'Backup before a rewind', initial: 'First scan',
  };
  return SOURCES[reason] ?? reason;
}

export function ActivityFeed({ folderId }: Props) {
  const { data: entries, isLoading } = useQuery({
    queryKey: ['activity', folderId],
    queryFn: () => listActivityLog(folderId, 100),
    refetchInterval: 3_000,
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start gap-3 px-3">
            <div className="w-6 h-6 rounded-full bg-secondary/60 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5 pt-0.5">
              <div className="flex items-center gap-2">
                <div className="h-2.5 bg-secondary rounded-full w-20" />
                <div className="h-2.5 bg-secondary/50 rounded-full w-32" />
              </div>
              <div className="h-2 bg-secondary/30 rounded-full w-16" />
            </div>
            <div className="h-2 bg-secondary/30 rounded-full w-12 mt-1 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground/70">
        <div className="w-10 h-10 rounded-full bg-secondary/40 border border-border/30 flex items-center justify-center">
          <Zap size={18} className="opacity-40" />
        </div>
        <p className="text-xs">No activity yet — snapshots will appear here as you work</p>
      </div>
    );
  }

  const groups = groupByDay(entries);

  return (
    <div className="overflow-y-auto py-2">
      {groups.map((group) => (
        <div key={group.label}>

          <div className="flex items-center gap-3 px-4 py-2">
            <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
              {group.label}
            </span>
            <div className="flex-1 h-px bg-border/20" />
          </div>


          {group.entries.map((entry, idx) => {
            const meta = ACTION_META[entry.action] ?? getDefaultMeta(entry.action);
            const isLast = idx === group.entries.length - 1;

            return (
              <div key={entry.id} className="relative flex items-start gap-3 px-4 py-2 hover:bg-secondary/20 transition-colors group">

                {!isLast && (
                  <div className="absolute left-[25px] top-8 bottom-0 w-px bg-border/20 pointer-events-none" />
                )}


                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${meta.colors}`}>
                  {meta.icon}
                </div>


                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-xs font-medium text-foreground/80">{meta.label}</span>
                    {entry.relPath && (
                      <span className="text-xs font-mono text-foreground/70 truncate">
                        {entry.relPath}
                      </span>
                    )}
                  </div>
                  {entry.reason && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {humanizeReason(entry.action, entry.reason)}
                    </p>
                  )}
                </div>


                <span
                  className="text-[11px] text-muted-foreground shrink-0 mt-0.5"
                  title={format(new Date(entry.timestamp), 'PPpp')}
                >
                  {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
