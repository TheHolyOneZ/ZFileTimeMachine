import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, FolderOpen, Settings2, Pause, Play, History } from 'lucide-react';
import { FolderIcon } from './FolderIcon';
import type { ActivityEntry, FileEntry, Folder } from '@/lib/types';
import { useRemoveFolder, useToggleFolderPause, useUndeleteFolder } from '@/hooks/useFolders';
import { folderTint } from '@/lib/folderAppearance';
import { formatPath } from '@/lib/tauri';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { gsap, dur } from '@/lib/motion';

interface Props {
  folder: Folder;
  files?: FileEntry[];
  activity?: ActivityEntry[];
}

export function triggerLabel(folder: Folder): string {
  const t = folder.config.trigger;
  if (t.type === 'OnChange') return 'Every save';
  if (t.type === 'Manual') return 'Only by hand';
  if (t.type === 'Interval') return `Saves and every ${t.minutes} min`;
  if (t.type === 'Hybrid') return `Saves and every ${t.interval_minutes} min`;
  return '';
}

export function retentionLabel(folder: Folder): string {
  const r = folder.config.retention;
  if (r.type === 'KeepLast') return `Last ${r.count} versions`;
  if (r.type === 'TimeBased') return `${r.days} days of history`;
  if (r.type === 'Hybrid') return `${r.days} days, up to ${r.count}`;
  return '';
}

const DAYS = 14;

function Sparkline({ activity }: { activity?: ActivityEntry[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const bars = useMemo(() => {
    const counts = new Array(DAYS).fill(0);
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    for (const a of activity ?? []) {
      if (a.action !== 'snapshot_created') continue;
      const daysAgo = Math.floor((startOfToday.getTime() - a.timestamp) / 86_400_000) + 1;
      const idx = a.timestamp >= startOfToday.getTime() ? DAYS - 1 : DAYS - 1 - daysAgo;
      if (idx >= 0 && idx < DAYS) counts[idx]++;
    }
    const max = Math.max(1, ...counts);
    return counts.map((c) => c / max);
  }, [activity]);
  const total = (activity ?? []).filter((a) => a.action === 'snapshot_created').length;

  useLayoutEffect(() => {
    if (!ref.current || activity == null) return;
    gsap.fromTo(ref.current.children, { scaleY: 0 }, { scaleY: 1, duration: dur(0.7), stagger: 0.025, ease: 'zftm', transformOrigin: '50% 100%' });
  }, [activity == null]);

  return (
    <div className="flex items-end gap-[3px] h-7" ref={ref} aria-label={`${total} recent versions over the last two weeks`} role="img">
      {bars.map((v, i) => (
        <span
          key={i}
          className={`w-[5px] rounded-[calc(2px*var(--rs))] ${i === DAYS - 1 ? 'bg-foreground/55' : v > 0 ? 'bg-foreground/25' : 'bg-foreground/[0.08]'}`}
          style={{ height: `${Math.max(12, v * 100)}%` }}
        />
      ))}
    </div>
  );
}

export function FolderCard({ folder, files, activity }: Props) {
  const navigate = useNavigate();
  const remove = useRemoveFolder();
  const togglePause = useToggleFolderPause();
  const undelete = useUndeleteFolder();
  const { menu, open, close } = useContextMenu();
  const { toast } = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isPaused = folder.paused;
  const isRemoving = remove.isPending && remove.variables === folder.id;
  const fileCount = files?.length;
  const versionCount = files?.reduce((s, f) => s + f.snapshotCount, 0);

  function doRemove() {
    setConfirmRemove(false);
    remove.mutate(folder.id, {
      onSuccess: () => {
        toast('info', `Stopped watching ${folder.displayName}.`, {
          action: { label: 'Undo', onClick: () => undelete.mutate(folder.id) },
          duration: 8000,
        });
      },
    });
  }

  function openFolder() {
    if (!isRemoving) navigate(`/folder/${folder.id}`);
  }

  return (
    <>
      <div
        role="link"
        tabIndex={0}
        aria-label={`Open ${folder.displayName}`}
        onClick={openFolder}
        onKeyDown={(e) => e.key === 'Enter' && openFolder()}
        onContextMenu={(e) => open(e, [
          { label: 'Open', icon: <FolderOpen size={14} />, onClick: openFolder },
          { label: 'Recover files', icon: <History size={14} />, onClick: () => navigate(`/folder/${folder.id}/recover`) },
          { label: 'Folder settings', icon: <Settings2 size={14} />, onClick: () => navigate(`/folder/${folder.id}/settings`) },
          {
            label: isPaused ? 'Resume watching' : 'Pause watching',
            icon: isPaused ? <Play size={14} /> : <Pause size={14} />,
            onClick: () => togglePause.mutate({ id: folder.id, paused: !isPaused }),
            separator: true,
          },
          { label: 'Stop watching', icon: <Trash2 size={14} />, variant: 'destructive', onClick: () => setConfirmRemove(true) },
        ])}
        className={`group relative flex flex-col gap-4 p-4 rounded-xl bg-card shadow-card cursor-pointer
                    transition-[transform,box-shadow] duration-300 ease-zftm
                    hover:-translate-y-0.5 hover:shadow-card-hover
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70
                    ${isRemoving ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0">
            <FolderIcon name={folder.config.icon} size={19} {...folderTint(folder.config.color)} />
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-md font-semibold text-foreground truncate">{folder.displayName}</span>
            </div>
            <p className="text-xs text-faint font-mono truncate mt-0.5" title={folder.path}>{formatPath(folder.path)}</p>
          </div>
          <span className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-2xs font-medium
                            ${isPaused ? 'bg-foreground/[0.06] text-muted-foreground' : 'bg-positive/10 text-positive'}`}>
            {isPaused ? <Pause size={10} /> : <span className="live-dot w-1.5 h-1.5 rounded-full bg-positive" />}
            {isPaused ? 'Paused' : 'Watching'}
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="flex gap-6">
            <div>
              <p className="text-xl font-semibold tabular-nums leading-none text-foreground">
                {versionCount != null ? versionCount.toLocaleString() : <span className="skeleton inline-block w-8 h-5 align-middle" />}
              </p>
              <p className="text-2xs text-muted-foreground mt-1.5">versions</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums leading-none text-foreground/80">
                {fileCount != null ? fileCount.toLocaleString() : <span className="skeleton inline-block w-6 h-5 align-middle" />}
              </p>
              <p className="text-2xs text-muted-foreground mt-1.5">files</p>
            </div>
          </div>
          <Sparkline activity={activity} />
        </div>

        <div className="flex items-center justify-between gap-3 pt-3 -mb-0.5 border-t border-[hsl(var(--line))] text-2xs text-muted-foreground">
          <span className="truncate">{triggerLabel(folder)}</span>
          <span className="truncate text-faint">{retentionLabel(folder)}</span>
        </div>
      </div>
      {menu && <ContextMenu {...menu} onClose={close} />}
      <ConfirmDialog
        open={confirmRemove}
        title={`Stop watching ${folder.displayName}?`}
        confirmLabel="Stop watching"
        destructive
        onConfirm={doRemove}
        onCancel={() => setConfirmRemove(false)}
      >
        Your files stay where they are. The history is kept for 7 days, so you can undo this.
      </ConfirmDialog>
    </>
  );
}
