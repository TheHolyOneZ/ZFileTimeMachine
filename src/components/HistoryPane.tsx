import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { ago } from '@/lib/time';
import {
  Camera, Clock, Undo2, Sparkles, Pause, Play, Copy, Check, RotateCcw, Maximize2, Search, X, History, Pencil, ScrollText as WholeFileIcon,
} from 'lucide-react';
import type { FileEntry, Snapshot } from '@/lib/types';
import {
  useSnapshots, useLineStats, useDiff, useRewind, useManualSnapshot, useSetFileNote, useSetFileOverride, useSetSnapshotNote,
} from '@/hooks/useTimeline';
import { useToast } from '@/context/ToastContext';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';
import { DiffViewer, fmtSize } from './DiffViewer';
import { NoteEditor } from './NoteEditor';
import { FileIcon } from './ui/FileIcon';
import { CopyPath, joinPath } from './ui/CopyPath';
import { IconButton, Button } from './ui/Button';
import { Segmented } from './ui/Segmented';
import { Sheet, SheetHeader } from './ui/Sheet';
import { Switch } from './ui/Switch';
import { isPreviewableImage, snapshotImageUrl } from '@/lib/platform';
import { gsap, Flip, dur } from '@/lib/motion';
import { usePref, PREF_WHOLE_FILE } from '@/lib/prefs';

type Range = 'all' | 'today' | 'week';

const SOURCE: Record<string, { label: string; Icon: typeof Camera | null }> = {
  change: { label: 'Saved', Icon: null },
  manual: { label: 'Saved by hand', Icon: Camera },
  interval: { label: 'Saved on schedule', Icon: Clock },
  'pre-rewind': { label: 'Kept before a restore', Icon: Undo2 },
  initial: { label: 'First version', Icon: Sparkles },
};

function dayLabel(ts: number) {
  const d = new Date(ts);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, d.getFullYear() === new Date().getFullYear() ? 'EEEE, MMMM d' : 'MMMM d, yyyy');
}

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function ImagePreview({ snapshot, current, name }: { snapshot: Snapshot; current?: Snapshot; name: string }) {
  const panes = current && current.id !== snapshot.id
    ? [{ s: snapshot, label: `Version from ${format(new Date(snapshot.createdAt), 'MMM d, HH:mm')}` }, { s: current, label: 'Now' }]
    : [{ s: snapshot, label: current?.id === snapshot.id ? 'This version is the file on disk' : `Version from ${format(new Date(snapshot.createdAt), 'MMM d, HH:mm')}` }];
  return (
    <div className={`h-full grid gap-3 ${panes.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {panes.map(({ s, label }) => (
        <figure key={s.id} className="min-h-0 flex flex-col rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] overflow-hidden">
          <div className="flex-1 min-h-0 grid place-items-center p-3 bg-[conic-gradient(hsl(var(--foreground)/0.04)_25%,transparent_0_50%,hsl(var(--foreground)/0.04)_0_75%,transparent_0)] bg-[length:16px_16px]">
            <img
              src={snapshotImageUrl(s.id)}
              alt={`${name}, ${label}`}
              draggable={false}
              className="max-w-full max-h-full object-contain rounded-[calc(4px*var(--rs))] shadow-[0_8px_30px_-12px_hsl(var(--shadow)/0.6)] opacity-0 transition-opacity duration-500"
              onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
              onError={(e) => { e.currentTarget.replaceWith(Object.assign(document.createElement('p'), { className: 'text-sm text-muted-foreground', textContent: 'This preview could not be loaded.' })); }}
            />
          </div>
          <figcaption className="h-8 shrink-0 px-3 flex items-center justify-between text-2xs border-t border-[hsl(var(--line))]">
            <span className="text-muted-foreground truncate">{label}</span>
            <span className="text-faint tabular-nums">{fmtSize(s.sizeBytes)}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function RestoreSheet({ open, file, snapshot, stats, pending, onCancel, onConfirm }: {
  open: boolean;
  file: FileEntry;
  snapshot: Snapshot | null;
  stats?: { added: number; removed: number } | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (keepCurrent: boolean) => void;
}) {
  const [keep, setKeep] = useState(true);
  const name = file.relPath.split('/').pop();
  useEffect(() => { if (open) setKeep(true); }, [open]);
  return (
    <Sheet open={open} onClose={onCancel} width={440} label="Restore version" dismissible={!pending}>
      <SheetHeader
        icon={<RotateCcw size={18} />}
        title={`Restore ${name}?`}
        description={snapshot ? <>The file goes back to how it was on {format(new Date(snapshot.createdAt), "MMMM d 'at' HH:mm")}.</> : null}
      />
      <div className="px-6 pt-3 pb-2 space-y-3">
        {stats && (stats.added > 0 || stats.removed > 0) && (
          <div className="flex items-center gap-3 px-3.5 h-10 rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] text-sm">
            <span className="text-muted-foreground flex-1">Compared with the file now</span>
            <span className="tabular-nums text-positive font-medium">+{stats.added}</span>
            <span className="tabular-nums text-negative font-medium">−{stats.removed}</span>
          </div>
        )}
        <label className="flex items-start gap-3 px-3.5 py-3 rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] cursor-pointer">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Keep the current file as a version first</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">So you can undo this restore. Recommended.</p>
          </div>
          <Switch checked={keep} onChange={setKeep} label="Keep the current file as a version first" />
        </label>
      </div>
      <div className="flex justify-end gap-2 px-6 py-5">
        <Button onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button variant="primary" icon={<RotateCcw size={14} />} loading={pending} onClick={() => onConfirm(keep)} data-autofocus>
          Restore
        </Button>
      </div>
    </Sheet>
  );
}

export function HistoryPane({ file, folderPath }: { file: FileEntry; folderPath: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const flipState = useRef<Flip.FlipState | null>(null);
  const seenIds = useRef<Set<number> | null>(null);
  const width = useWidth(rootRef);
  const wide = width >= 720;

  const { data: snapshots, isLoading } = useSnapshots(file.id);
  const { data: lineStats } = useLineStats(file.id);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>('all');
  const [noteQuery, setNoteQuery] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [fullDiff, setFullDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const { menu, open: openMenu, close } = useContextMenu();
  const [whole, setWhole] = usePref(PREF_WHOLE_FILE, false);

  const rewind = useRewind();
  const manualSnap = useManualSnapshot();
  const setFileNote = useSetFileNote();
  const setSnapNote = useSetSnapshotNote();
  const setOverride = useSetFileOverride();

  const name = file.relPath.split('/').pop() ?? file.relPath;
  const dir = file.relPath.includes('/') ? file.relPath.slice(0, file.relPath.lastIndexOf('/')) : '';
  const isImage = isPreviewableImage(file.relPath);

  const statsById = useMemo(() => new Map((lineStats ?? []).map((s) => [s.snapshotId, s])), [lineStats]);
  const current = useMemo(() => snapshots?.find((s) => s.contentHash === file.currentHash), [snapshots, file.currentHash]);

  const visible = useMemo(() => {
    if (!snapshots) return [];
    const now = Date.now();
    const cutoff = range === 'today' ? new Date().setHours(0, 0, 0, 0) : range === 'week' ? now - 7 * 86_400_000 : 0;
    const q = noteQuery?.trim().toLowerCase();
    return snapshots.filter((s) => s.createdAt >= cutoff && (!q || s.note?.toLowerCase().includes(q)));
  }, [snapshots, range, noteQuery]);

  const groups = useMemo(() => {
    const out: { label: string; items: Snapshot[] }[] = [];
    for (const s of visible) {
      const label = dayLabel(s.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(s);
      else out.push({ label, items: [s] });
    }
    return out;
  }, [visible]);

  useEffect(() => {
    setSelectedId(null);
    setRange('all');
    setNoteQuery(null);
    seenIds.current = null;
  }, [file.id]);

  useEffect(() => {
    if (!snapshots || snapshots.length === 0) return;
    if (selectedId != null && snapshots.some((s) => s.id === selectedId)) return;
    const firstOther = snapshots.find((s) => s.contentHash !== file.currentHash);
    setSelectedId((firstOther ?? snapshots[0]).id);
  }, [snapshots, selectedId, file.currentHash]);

  const selected = snapshots?.find((s) => s.id === selectedId) ?? null;
  const selectedIsCurrent = !!selected && selected.id === current?.id;
  const { data: diff, isFetching: diffLoading } = useDiff(selected && !isImage ? selected.id : undefined, true);
  const diffStats = diff && !diff.is_binary && !diff.too_large
    ? { added: diff.lines.filter((l) => l.kind === 'insert').length, removed: diff.lines.filter((l) => l.kind === 'delete').length }
    : null;

  const placePill = useRef<(animate: boolean) => void>(() => {});
  placePill.current = (animate: boolean) => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;
    const el = selectedId != null ? list.querySelector<HTMLElement>(`[data-version="${selectedId}"]`) : null;
    if (!el) { gsap.killTweensOf(pill); gsap.set(pill, { autoAlpha: 0 }); return; }
    const listBox = list.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const to = { y: box.top - listBox.top + list.scrollTop, height: box.height };
    const wasHidden = gsap.getProperty(pill, 'autoAlpha') === 0;
    if (wasHidden || !animate) {
      gsap.set(pill, to);
      if (wasHidden) gsap.to(pill, { autoAlpha: 1, duration: dur(0.2) });
    } else {
      gsap.to(pill, { ...to, autoAlpha: 1, duration: dur(0.45), ease: 'zftm', overwrite: 'auto' });
    }
  };

  useLayoutEffect(() => {
    placePill.current(true);
    const el = selectedId != null ? listRef.current?.querySelector<HTMLElement>(`[data-version="${selectedId}"]`) : null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, groups, wide]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !snapshots) return;
    if (seenIds.current) {
      const fresh = snapshots.filter((s) => !seenIds.current!.has(s.id));
      fresh.forEach((s) => {
        const el = list.querySelector(`[data-version="${s.id}"]`);
        if (el) gsap.fromTo(el, { autoAlpha: 0, y: -8, height: 0 }, {
          autoAlpha: 1, y: 0, height: 'auto', duration: dur(0.55), ease: 'zftm', clearProps: 'height,transform',
          onUpdate: () => placePill.current(false),
          onComplete: () => placePill.current(false),
        });
      });
    } else {
      const rows = list.querySelectorAll('[data-version], [data-day]');
      gsap.fromTo(rows, { autoAlpha: 0, x: -6 }, { autoAlpha: 1, x: 0, duration: dur(0.45), stagger: Math.min(0.025, 0.5 / Math.max(1, rows.length)), ease: 'zftm', clearProps: 'transform' });
    }
    seenIds.current = new Set(snapshots.map((s) => s.id));
  }, [snapshots]);

  useLayoutEffect(() => {
    const state = flipState.current;
    if (!state || !current) return;
    flipState.current = null;
    const badge = listRef.current?.querySelector('[data-flip-id="current-badge"]');
    if (!badge) return;
    Flip.from(state, { targets: badge, duration: dur(0.8), ease: 'zftm', absolute: true, scale: true });
    gsap.fromTo(listRef.current!.querySelector(`[data-version="${current.id}"] [data-rail-dot]`),
      { scale: 2.2 }, { scale: 1, duration: dur(0.9), ease: 'zftm' });
  }, [current?.id]);

  function restore(keepCurrent: boolean) {
    if (!selected) return;
    const badge = listRef.current?.querySelector('[data-flip-id="current-badge"]');
    rewind.mutate(
      { snapshotId: selected.id, autoSaveCurrent: keepCurrent },
      {
        onSuccess: () => {
          if (badge) flipState.current = Flip.getState(badge);
          setRestoreOpen(false);
          toast('success', `Restored ${name} to ${format(new Date(selected.createdAt), 'MMM d, HH:mm')}.`);
        },
        onError: (e) => toast('error', `Couldn't restore ${name}: ${String(e)}`),
      },
    );
  }

  function onListKey(e: React.KeyboardEvent) {
    if (!visible.length) return;
    const i = visible.findIndex((s) => s.id === selectedId);
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedId(visible[Math.min(i + 1, visible.length - 1)].id); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedId(visible[Math.max(i - 1, 0)].id); }
    if (e.key === 'Enter' && selected && !selectedIsCurrent) setRestoreOpen(true);
  }

  function versionMenu(e: React.MouseEvent, s: Snapshot) {
    setSelectedId(s.id);
    openMenu(e, [
      { label: 'Restore this version', icon: <RotateCcw size={14} />, disabled: s.id === current?.id, onClick: () => { setSelectedId(s.id); setRestoreOpen(true); } },
      { label: 'Open the full comparison', icon: <Maximize2 size={14} />, disabled: isImage, onClick: () => { setSelectedId(s.id); setFullDiff(true); } },
      { label: 'Copy date and time', icon: <Copy size={14} />, separator: true, onClick: () => void navigator.clipboard.writeText(new Date(s.createdAt).toLocaleString()) },
    ]);
  }

  const hasNotes = snapshots?.some((s) => s.note) ?? false;

  const header = (
    <div className="shrink-0 px-5 pt-4 pb-3 flex items-start gap-3">
      <div className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0">
        <FileIcon path={file.relPath} binary={file.isBinary} size={18} className="text-foreground/75" />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <h2 className="text-lg font-semibold truncate selectable" title={file.relPath}>{name}</h2>
        <div className="flex items-center gap-2 mt-0.5 min-w-0">
          <CopyPath path={joinPath(folderPath, file.relPath)} display={dir ? `${dir}/` : 'Top level of the folder'} mono={!!dir} className="text-xs" />
          {file.noAutoSnapshot && (
            <span className="shrink-0 inline-flex items-center gap-1 h-[18px] px-1.5 rounded-[calc(5px*var(--rs))] text-2xs text-muted-foreground bg-foreground/[0.06]">
              <Pause size={9} />Automatic versions paused
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0 -mr-1">
        <IconButton
          label="Save a version now"
          disabled={manualSnap.isPending}
          onClick={() => manualSnap.mutate(file.id, {
            onSuccess: () => toast('success', `Saved a version of ${name}.`),
            onError: (e) => toast('error', String(e)),
          })}
        >
          <Camera size={16} />
        </IconButton>
        <IconButton
          label={file.noAutoSnapshot ? 'Resume automatic versions' : 'Pause automatic versions'}
          active={file.noAutoSnapshot}
          onClick={() => setOverride.mutate({ id: file.id, noAutoSnapshot: !file.noAutoSnapshot })}
        >
          {file.noAutoSnapshot ? <Play size={16} /> : <Pause size={16} />}
        </IconButton>
        <span className="w-8 h-8 grid place-items-center">
          <NoteEditor
            initialNote={file.note}
            label={`Note on ${name}`}
            placeholder="What is this file, what to watch out for…"
            onSave={(note) => setFileNote.mutate({ id: file.id, note })}
          />
        </span>
        <IconButton
          label={copied ? 'Copied' : 'Copy full path'}
          onClick={() => { void navigator.clipboard.writeText(joinPath(folderPath, file.relPath)); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
        >
          {copied ? <Check size={16} className="text-positive" /> : <Copy size={16} />}
        </IconButton>
      </div>
    </div>
  );

  const fileNote = file.note ? (
    <div className="mx-5 mb-3 px-3 py-2 rounded-lg bg-foreground/[0.04] shadow-[inset_0_0_0_1px_hsl(var(--line))] text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap selectable">
      {file.note}
    </div>
  ) : null;

  const listToolbar = (
    <div className="shrink-0 flex items-center gap-2 px-3 pb-2">
      {noteQuery == null ? (
        <>
          <Segmented<Range>
            size="sm"
            value={range}
            onChange={setRange}
            ariaLabel="Time range"
            options={[{ value: 'all', label: 'All' }, { value: 'today', label: 'Today' }, { value: 'week', label: '7 days' }]}
          />
          <div className="flex-1" />
          {hasNotes && (
            <IconButton size="sm" label="Find versions by note" onClick={() => setNoteQuery('')}>
              <Search size={14} />
            </IconButton>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center gap-1.5 animate-fade-in">
          <input
            autoFocus
            value={noteQuery}
            onChange={(e) => setNoteQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNoteQuery(null); } }}
            placeholder="Find versions by note"
            className="field !h-7 text-xs"
          />
          <IconButton size="sm" label="Stop searching" onClick={() => setNoteQuery(null)}>
            <X size={14} />
          </IconButton>
        </div>
      )}
    </div>
  );

  const list = (
    <div
      ref={listRef}
      tabIndex={0}
      onKeyDown={onListKey}
      role="listbox"
      aria-label={`Versions of ${name}`}
      className="relative flex-1 min-h-0 overflow-y-auto px-2 pb-4 outline-none scroll-fade-y"
    >
      <div ref={pillRef} aria-hidden className="absolute left-2 right-2 top-0 rounded-[calc(9px*var(--rs))] invisible pointer-events-none bg-primary/[0.12] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)]" />
      {isLoading && [0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 h-11 px-3">
          <div className="skeleton w-2.5 h-2.5 rounded-full" />
          <div className="skeleton h-3 w-14" />
          <div className="flex-1" />
          <div className="skeleton h-3 w-10" />
        </div>
      ))}
      {!isLoading && snapshots?.length === 0 && (
        <div className="px-4 py-10 text-center">
          <History size={20} className="mx-auto text-faint mb-2" />
          <p className="text-sm text-muted-foreground">No versions yet.</p>
          <p className="text-xs text-faint mt-1">The next time this file is saved, its first version appears here.</p>
        </div>
      )}
      {!isLoading && snapshots && snapshots.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground px-4 py-8 text-center">
          {noteQuery ? 'No version has a note like that.' : range === 'today' ? 'No versions from today.' : 'No versions from the last 7 days.'}
        </p>
      )}
      {groups.map((g, gi) => (
        <div key={g.label} className="relative">
          <p data-day className={`relative z-10 px-3 pb-1.5 text-2xs font-medium text-faint ${gi === 0 ? 'pt-1' : 'pt-4'}`}>{g.label}</p>
          {g.items.map((s, idx) => {
            const st = statsById.get(s.id);
            const src = SOURCE[s.source] ?? { label: s.source, Icon: null };
            const isCurrent = s.id === current?.id;
            const isSel = s.id === selectedId;
            const lastInGroup = idx === g.items.length - 1;
            return (
              <div
                key={s.id}
                data-version={s.id}
                role="option"
                aria-selected={isSel}
                onClick={() => setSelectedId(s.id)}
                onDoubleClick={() => !isCurrent && setRestoreOpen(true)}
                onContextMenu={(e) => versionMenu(e, s)}
                className="relative z-10 flex gap-3 px-3 py-2 rounded-[calc(9px*var(--rs))] cursor-default hover:bg-foreground/[0.035]"
              >
                <div className="relative w-2.5 shrink-0 flex justify-center">
                  {!lastInGroup && <span className="absolute top-[18px] -bottom-[14px] w-px bg-[hsl(var(--line-strong))]" />}
                  <span
                    data-rail-dot
                    className={`relative mt-[5px] w-2.5 h-2.5 rounded-full
                                ${isCurrent ? 'bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.2)]' : isSel ? 'bg-foreground/70' : 'bg-surface shadow-[inset_0_0_0_1.5px_hsl(var(--foreground)/0.35)]'}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 h-5">
                    <time className={`text-sm tabular-nums ${isSel ? 'text-foreground font-medium' : 'text-foreground/85'}`} title={format(new Date(s.createdAt), 'PPpp')}>
                      {format(new Date(s.createdAt), 'HH:mm')}
                    </time>
                    {gi === 0 && g.label === 'Today' && <span className="text-2xs text-faint truncate">{ago(s.createdAt)}</span>}
                    <div className="flex-1" />
                    {src.Icon && <src.Icon size={12} className="text-faint shrink-0" data-tip={src.label} aria-label={src.label} />}
                    {isCurrent && (
                      <span data-flip-id="current-badge" className="shrink-0 h-5 px-1.5 rounded-[calc(5px*var(--rs))] grid place-items-center text-2xs font-semibold bg-primary text-primary-foreground">
                        Current
                      </span>
                    )}
                    <span className="text-2xs tabular-nums shrink-0 min-w-[56px] text-right">
                      {st && st.added != null && st.removed != null ? (
                        st.added === 0 && st.removed === 0 ? <span className="text-faint">no change</span> : (
                          <>
                            <span className="text-positive">+{st.added}</span>
                            <span className="text-negative ml-1.5">−{st.removed}</span>
                          </>
                        )
                      ) : (
                        <span className="text-faint">{s.deltaBytes === 0 ? fmtSize(s.sizeBytes) : `${s.deltaBytes > 0 ? '+' : ''}${fmtSize(s.deltaBytes)}`}</span>
                      )}
                    </span>
                  </div>
                  {s.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-snug">{s.note}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  const previewHeader = selected && (
    <div className="shrink-0 flex items-center gap-2 h-11 px-1">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {selectedIsCurrent ? 'This is the file as it is now' : `Version from ${format(new Date(selected.createdAt), 'MMM d, HH:mm:ss')}`}
        </p>
      </div>
      <NoteEditor
        variant="button"
        initialNote={selected.note}
        label="Note on this version"
        placeholder="Why this version matters…"
        onSave={(note) => setSnapNote.mutate({ id: selected.id, note })}
      />
      {!isImage && diff && !diff.is_binary && !diff.too_large && (
        <IconButton size="sm" label={whole ? 'Show only the changes' : 'Always show the whole file'} active={whole} onClick={() => setWhole(!whole)}>
          <WholeFileIcon size={14} />
        </IconButton>
      )}
      {!isImage && diff && !diff.is_binary && !diff.too_large && (
        <IconButton size="sm" label="Open the full comparison" onClick={() => setFullDiff(true)}>
          <Maximize2 size={14} />
        </IconButton>
      )}
    </div>
  );

  const preview = (
    <div className="flex-1 min-h-0 flex flex-col px-4 pb-4">
      {previewHeader}
      <div className="flex-1 min-h-0" key={`${file.id}-${selected?.id ?? 'none'}`}>
        {!selected ? (
          <div className="h-full rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))]" />
        ) : isImage ? (
          <ImagePreview snapshot={selected} current={current} name={name} />
        ) : diff ? (
          <div className="h-full animate-fade-in">
            <DiffViewer diff={diff} fill whole={whole} sizeBefore={file.isBinary ? current?.sizeBytes : undefined} sizeAfter={file.isBinary ? selected.sizeBytes : undefined} />
          </div>
        ) : (
          <div className="h-full rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] p-4 space-y-2">
            {diffLoading && [70, 45, 82, 60, 38].map((w, i) => <div key={i} className="skeleton h-3" style={{ width: `${w}%` }} />)}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3 pt-3">
        <p className="flex-1 min-w-0 text-xs text-muted-foreground truncate">
          {selected && !selectedIsCurrent && !isImage && diffStats && (diffStats.added + diffStats.removed > 0)
            ? <>Brings back <span className="text-positive tabular-nums">{diffStats.added}</span> and removes <span className="text-negative tabular-nums">{diffStats.removed}</span> lines.</>
            : selected && !selectedIsCurrent ? 'Replaces the file on disk with this version.' : ''}
        </p>
        <Button
          variant="primary"
          icon={<RotateCcw size={14} />}
          disabled={!selected || selectedIsCurrent}
          onClick={() => setRestoreOpen(true)}
        >
          Restore this version
        </Button>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className="flex-1 min-w-0 flex flex-col overflow-hidden">
      {header}
      {fileNote}
      <div className={`flex-1 min-h-0 flex ${wide ? 'flex-row' : 'flex-col'} border-t border-[hsl(var(--line))]`}>
        <div className={`flex flex-col min-h-0 pt-3 ${wide ? 'w-[320px] shrink-0 border-r border-[hsl(var(--line))]' : 'h-[44%] min-h-[200px] shrink-0 border-b border-[hsl(var(--line))]'}`}>
          {listToolbar}
          {list}
        </div>
        <div className="flex-1 min-w-0 min-h-0 flex flex-col pt-2">
          {preview}
        </div>
      </div>

      <RestoreSheet
        open={restoreOpen}
        file={file}
        snapshot={selected}
        stats={diffStats}
        pending={rewind.isPending}
        onCancel={() => setRestoreOpen(false)}
        onConfirm={restore}
      />

      <Sheet open={fullDiff && !!diff} onClose={() => setFullDiff(false)} width={1180} label="Full comparison" className="h-[86vh]">
        <SheetHeader
          icon={<Pencil size={17} />}
          title={name}
          description={selected ? `Version from ${format(new Date(selected.createdAt), "MMMM d 'at' HH:mm:ss")} compared with the file now` : null}
          onClose={() => setFullDiff(false)}
        />
        <div className="flex-1 min-h-0 px-6 pb-6 pt-3">
          {diff && <DiffViewer diff={diff} fill context={6} findShortcut={false} whole={whole} />}
        </div>
      </Sheet>
      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  );
}
