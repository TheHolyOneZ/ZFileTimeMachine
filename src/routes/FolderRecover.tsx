import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft, Search, X, FolderDown, RotateCcw, CheckCircle2, XCircle, ChevronDown, Eye, FolderOpen,
  Pin, PinOff, TriangleAlert, Camera, Clock, Undo2, Sparkles, MousePointerClick, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { listFiles, listSnapshots, bulkRecover, pickFolder, formatPath } from '@/lib/tauri';
import type {
  BulkRecoverArgs, BulkRecoverResult, RecoverProgressPayload,
  FileEntry, Snapshot, SnapshotPoint, ConflictPolicy, SnapshotPreference,
} from '@/lib/types';
import { useFolders } from '@/hooks/useFolders';
import { RecoverTree } from '@/components/RecoverTree';
import { RecoverConfirmDialog } from '@/components/RecoverConfirmDialog';
import { DateTimePicker } from '@/components/DateTimePicker';
import { useToast } from '@/context/ToastContext';
import { Segmented } from '@/components/ui/Segmented';
import { Switch } from '@/components/ui/Switch';
import { Button, IconButton } from '@/components/ui/Button';
import { Sheet, SheetHeader } from '@/components/ui/Sheet';
import { FileIcon } from '@/components/ui/FileIcon';
import { CopyPath } from '@/components/ui/CopyPath';
import { Spinner } from '@/components/ui/Spinner';
import { gsap, dur } from '@/lib/motion';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/', 'target/', '.git/', 'dist/', 'build/',
  '.next/', '.venv/', '__pycache__/', '.DS_Store',
].join('\n');

function fmt(ts: number | null) {
  if (!ts) return '';
  const d = new Date(ts);
  return format(d, d.getFullYear() === new Date().getFullYear() ? "MMM d, HH:mm" : 'MMM d yyyy, HH:mm');
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n !== 1 ? 's' : ''}`;
}

const SOURCE: Record<string, { label: string; Icon: typeof Camera | null }> = {
  change: { label: 'Saved', Icon: null },
  manual: { label: 'Saved by hand', Icon: Camera },
  interval: { label: 'Saved on schedule', Icon: Clock },
  'pre-rewind': { label: 'Kept before a restore', Icon: Undo2 },
  initial: { label: 'First version', Icon: Sparkles },
};

type SrcFilter = 'all' | 'change' | 'manual' | 'pre-rewind';
type Tolerance = 'none' | '1h' | '6h' | '1d';
const TOLERANCE_MS: Record<Tolerance, number | null> = { none: null, '1h': 3_600_000, '6h': 21_600_000, '1d': 86_400_000 };

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-section>
      <div className="flex items-baseline justify-between mb-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Notice({ tone = 'neutral', icon, children }: { tone?: 'neutral' | 'caution'; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-3 rounded-lg text-xs leading-relaxed
                     ${tone === 'caution' ? 'bg-caution/[0.08] shadow-[inset_0_0_0_1px_hsl(var(--caution)/0.22)] text-foreground/85' : 'bg-foreground/[0.035] shadow-[inset_0_0_0_1px_hsl(var(--line))] text-muted-foreground'}`}>
      <span className={`shrink-0 mt-px ${tone === 'caution' ? 'text-caution' : 'text-faint'}`}>{icon ?? <Info size={13} />}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function CoverageRow({ tone, children }: { tone: 'pos' | 'caution' | 'neg'; children: React.ReactNode }) {
  const Icon = tone === 'pos' ? CheckCircle2 : tone === 'caution' ? TriangleAlert : XCircle;
  const cls = tone === 'pos' ? 'text-positive' : tone === 'caution' ? 'text-caution' : 'text-negative';
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
      <Icon size={12} className={`${cls} shrink-0 mt-[3px]`} />
      <span>{children}</span>
    </div>
  );
}

function FileSnapshotPanel({ file, pinnedId, onPin, onUnpin, onClose }: {
  file: FileEntry;
  pinnedId: number | undefined;
  onPin: (id: number) => void;
  onUnpin: () => void;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<SrcFilter>('all');
  const listRef = useRef<HTMLDivElement>(null);
  const { data: snaps = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ['snapshots', file.id],
    queryFn: () => listSnapshots(file.id),
  });
  const list = useMemo(() => (src === 'all' ? snaps : snaps.filter((s) => s.source === src)), [snaps, src]);
  const pinned = snaps.find((s) => s.id === pinnedId);
  const name = file.relPath.split('/').pop();

  useLayoutEffect(() => {
    if (!listRef.current || isLoading) return;
    gsap.fromTo(listRef.current.children, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: dur(0.35), stagger: 0.015, ease: 'zftm', clearProps: 'transform' });
  }, [file.id, src, isLoading]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
        <div className="w-9 h-9 rounded-[calc(10px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0">
          <FileIcon path={file.relPath} binary={file.isBinary} size={16} className="text-foreground/75" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-md font-semibold truncate">{name}</p>
          <p className="text-xs text-faint font-mono truncate">{file.relPath}</p>
        </div>
        <IconButton label="Back to the options" onClick={onClose}><X size={15} /></IconButton>
      </div>

      <div className="px-5 pb-3 shrink-0">
        {pinned ? (
          <div className="flex items-center gap-3 px-3.5 h-11 rounded-lg bg-primary/[0.09] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]">
            <Pin size={13} className="text-primary shrink-0" />
            <p className="flex-1 min-w-0 text-sm truncate">
              Uses the version from <span className="font-medium tabular-nums">{fmt(pinned.createdAt)}</span>
            </p>
            <button onClick={onUnpin} className="press inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07]">
              <PinOff size={12} />Unpin
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pick a version to pin. This file then recovers to exactly that version, whatever you choose on the right.
          </p>
        )}
      </div>

      <div className="px-5 pb-2 shrink-0">
        <Segmented<SrcFilter>
          size="sm"
          value={src}
          onChange={setSrc}
          ariaLabel="Show versions"
          options={[
            { value: 'all', label: 'All', count: snaps.length },
            { value: 'change', label: 'Saved' },
            { value: 'manual', label: 'By hand' },
            { value: 'pre-rewind', label: 'Before restores' },
          ]}
        />
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 scroll-fade-y">
        {isLoading ? (
          <div className="grid place-items-center h-24"><Spinner size={16} className="text-faint" /></div>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No versions of that kind.</p>
        ) : list.map((snap, idx) => {
          const active = snap.id === pinnedId;
          const isLatest = idx === 0 && src === 'all';
          const source = SOURCE[snap.source] ?? { label: snap.source, Icon: null };
          return (
            <button
              key={snap.id}
              onClick={() => (active ? onUnpin() : onPin(snap.id))}
              aria-pressed={active}
              className={`group w-full flex items-center gap-3 px-3 h-11 rounded-[calc(9px*var(--rs))] text-left
                          ${active ? 'bg-primary/[0.12] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]' : 'hover:bg-foreground/[0.045]'}`}
            >
              <span className={`text-sm tabular-nums ${active ? 'font-medium' : 'text-foreground/85'}`}>{fmt(snap.createdAt)}</span>
              {isLatest && <span className="h-5 px-1.5 rounded-[calc(5px*var(--rs))] grid place-items-center text-2xs font-medium bg-foreground/[0.07] text-muted-foreground">Newest</span>}
              {source.Icon && <source.Icon size={12} className="text-faint" data-tip={source.label} aria-label={source.label} />}
              <span className="flex-1" />
              <span className="text-2xs text-faint tabular-nums">{fmtBytes(snap.sizeBytes)}</span>
              <Pin size={13} className={`shrink-0 transition-opacity ${active ? 'text-primary' : 'text-faint opacity-0 group-hover:opacity-100'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FolderRecover() {
  const { id } = useParams<{ id: string }>();
  const folderId = id ? parseInt(id, 10) : null;
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: folders } = useFolders();
  const folder = folders?.find((f) => f.id === folderId);
  const isOnChange = folder?.config.trigger.type === 'OnChange';

  const { data: files = [], isLoading } = useQuery<FileEntry[]>({
    queryKey: ['files', folderId],
    queryFn: () => listFiles(folderId!),
    enabled: folderId != null,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const optionsRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => (filter ? files.filter((f) => f.relPath.toLowerCase().includes(filter.toLowerCase())) : files),
    [files, filter],
  );

  function toggleFile(p: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  }
  function toggleDir(prefix: string) {
    const leaves = visible.filter((f) => f.relPath.startsWith(prefix + '/') || f.relPath === prefix);
    const all = leaves.every((f) => selected.has(f.relPath));
    setSelected((prev) => {
      const n = new Set(prev);
      if (all) leaves.forEach((f) => n.delete(f.relPath));
      else leaves.forEach((f) => n.add(f.relPath));
      return n;
    });
  }
  function selectAll() { setSelected(new Set(visible.map((f) => f.relPath))); }
  function clearSel() { setSelected(new Set()); }

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const selFileEntry = useMemo(
    () => (selectedFile ? files.find((f) => f.relPath === selectedFile) ?? null : null),
    [files, selectedFile],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (document.querySelector('[role="dialog"],[role="alertdialog"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); selectAll(); return; }
      if (e.key === 'Escape') { if (selectedFile) setSelectedFile(null); else clearSel(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible, selectedFile]);

  const [mode, setMode] = useState<'export' | 'restore'>('export');
  const [dest, setDest] = useState('');
  const [snapKind, setSnapKind] = useState<'latest' | 'asOf' | 'nthFromLatest'>('latest');
  const [asOfDate, setAsOfDate] = useState('');
  const [nthOffset, setNthOffset] = useState(1);
  const [snapPreference, setSnapPreference] = useState<SnapshotPreference>('before');
  const [toleranceMs, setToleranceMs] = useState<number | null>(null);
  const [ignorePatterns, setIgnorePatterns] = useState(DEFAULT_IGNORE_PATTERNS);
  const [showIgnore, setShowIgnore] = useState(false);
  const [inclDeleted, setInclDeleted] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RecoverProgressPayload | null>(null);
  const [result, setResult] = useState<BulkRecoverResult | null>(null);
  const [previewResult, setPreviewResult] = useState<BulkRecoverResult | null>(null);
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [pendingConflicts, setPendingConflicts] = useState<string[]>([]);
  const unlistenRef = useRef<(() => void) | null>(null);

  const conflictFromPreviewRef = useRef(false);
  useEffect(() => () => { unlistenRef.current?.(); }, []);

  const selFiles = useMemo(() => files.filter((f) => selected.has(f.relPath)), [files, selected]);
  const dateRange = useMemo(() => {
    const dates = selFiles.map((f) => f.lastSnapshotAt).filter(Boolean) as number[];
    return dates.length ? { min: Math.min(...dates), max: Math.max(...dates) } : null;
  }, [selFiles]);

  const nthCoverage = useMemo(() => {
    if (snapKind !== 'nthFromLatest' || selFiles.length === 0) return null;
    const need = nthOffset + 1;
    const covered  = selFiles.filter((f) => f.snapshotCount >= need).length;
    const tooFew   = selFiles.filter((f) => f.snapshotCount > 0 && f.snapshotCount < need).length;
    const noSnaps  = selFiles.filter((f) => f.snapshotCount === 0).length;
    return { covered, tooFew, noSnaps, total: selFiles.length };
  }, [snapKind, selFiles, nthOffset]);

  const asOfCoverage = useMemo(() => {
    if (snapKind !== 'asOf' || selFiles.length === 0 || !asOfDate) return null;
    const ts  = new Date(asOfDate).getTime();
    const total = selFiles.length;

    const noSnaps = selFiles.filter((f) => f.snapshotCount === 0).length;

    if (snapPreference === 'nearest' && toleranceMs === null) {

      return { covered: total - noSnaps, uncertain: 0, skipped: noSnaps, total, exact: true };
    }

    if (snapPreference === 'before') {

      const sure   = selFiles.filter((f) => f.lastSnapshotAt !== null && f.lastSnapshotAt <= ts).length;

      const maybe  = selFiles.filter((f) => f.lastSnapshotAt !== null && f.lastSnapshotAt > ts && f.snapshotCount > 1).length;

      const defNone = selFiles.filter((f) => f.snapshotCount === 0 || (f.lastSnapshotAt !== null && f.lastSnapshotAt > ts && f.snapshotCount === 1)).length;
      return { covered: sure, uncertain: maybe, skipped: defNone, total, exact: false };
    }

    if (snapPreference === 'after') {

      const sure   = selFiles.filter((f) => f.lastSnapshotAt !== null && f.lastSnapshotAt >= ts).length;

      const defNone = selFiles.filter((f) => f.snapshotCount === 0 || (f.lastSnapshotAt !== null && f.lastSnapshotAt < ts)).length;
      const maybe   = total - sure - defNone;
      return { covered: sure, uncertain: Math.max(0, maybe), skipped: defNone, total, exact: false };
    }

    return { covered: total - noSnaps, uncertain: total - noSnaps, skipped: noSnaps, total, exact: false };
  }, [snapKind, selFiles, asOfDate, snapPreference, toleranceMs]);

  function buildArgs(policy?: ConflictPolicy): BulkRecoverArgs {
    const snapshotPoint: SnapshotPoint =
      snapKind === 'asOf' && asOfDate
        ? { kind: 'asOf', timestamp_ms: new Date(asOfDate).getTime(), preference: snapPreference, toleranceMs: toleranceMs ?? undefined }
      : snapKind === 'nthFromLatest'
        ? { kind: 'nthFromLatest', offset: nthOffset }
      : { kind: 'latest' };
    const patterns = ignorePatterns.split('\n').map((s) => s.trim()).filter(Boolean);
    return {
      folderId: folderId!,
      mode,
      destination: mode === 'export' ? dest : undefined,
      selectedPaths: Array.from(selected),
      snapshotPoint,
      ignorePatterns: patterns.length ? patterns : undefined,
      includeDeleted: inclDeleted || undefined,
      conflictPolicy: policy ?? conflictPolicy ?? undefined,
      perFileSnapshots: overrides.size ? Object.fromEntries(overrides) : undefined,
    };
  }

  async function runRecover(args: BulkRecoverArgs) {
    unlistenRef.current?.();
    setRunning(true); setResult(null); setProgress(null);
    const unlisten = await listen<RecoverProgressPayload>('recover:progress', (e) => setProgress(e.payload));
    unlistenRef.current = unlisten;
    try {
      const res = await bulkRecover(args);
      if (res.requiresConflictResolution) {
        conflictFromPreviewRef.current = args.dryRun ?? false;
        setPendingConflicts(res.conflicts); setShowConflict(true); return;
      }

      if (res.dryRun) {

        setPreviewResult(res);
        return;
      }

      setResult(res);
      if (res.abortedReason === 'disk_full') {
        toast('error', `Recovery stopped because the destination is full. ${res.succeeded} of ${plural(res.total, 'file')} written.`);
      } else if (res.failed.length === 0) {
        toast('success', `Recovered ${plural(res.succeeded, 'file')}.`, {
          action: mode === 'export' && dest ? { label: 'Open folder', onClick: () => void openDest() } : undefined,
        });
      } else {
        toast('info', `Recovered ${res.succeeded} of ${plural(res.total, 'file')}. ${res.failed.length} failed, see the details.`);
      }
    } catch (e) { toast('error', String(e)); }
    finally { setRunning(false); unlisten(); unlistenRef.current = null; }
  }

  async function openDest() {
    try { await invoke('open_path', { path: dest }); } catch (e) { toast('error', `Couldn't open the folder: ${String(e)}`); }
  }

  const progressPct = progress && progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
  const pinnedCount = overrides.size;
  const showFilePanel = selectedFile !== null && selFileEntry !== null;
  const toleranceKey = (Object.keys(TOLERANCE_MS) as Tolerance[]).find((k) => TOLERANCE_MS[k] === toleranceMs) ?? 'none';

  useLayoutEffect(() => {
    if (showFilePanel || !optionsRef.current) return;
    gsap.fromTo(optionsRef.current.querySelectorAll('[data-section]'), { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: dur(0.45), stagger: 0.04, ease: 'zftm', clearProps: 'transform' });
  }, [showFilePanel]);

  function startRecover() {
    if (selected.size === 0) return;
    if (mode === 'export' && !dest) { toast('error', 'Pick a folder to copy the files into first.'); return; }
    if (mode === 'restore') { setShowConfirm(true); return; }
    void runRecover(buildArgs());
  }

  return (
    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <header
        data-tauri-drag-region
        className="shrink-0 flex items-center gap-3.5 pl-4 pt-5 pb-4"
        style={{ paddingRight: 'max(1.25rem, var(--controls-space))' }}
      >
        <IconButton label="Back to the folder" onClick={() => navigate(`/folder/${folderId}`)}>
          <ArrowLeft size={17} />
        </IconButton>
        <div data-tauri-drag-region className="flex-1 min-w-0">
          <h1 data-tauri-drag-region className="text-xl font-semibold truncate">Recover files</h1>
          <div className="flex items-center gap-1.5 min-w-0 text-xs text-faint mt-1">
            <span data-tauri-drag-region className="shrink-0">From <span className="text-muted-foreground">{folder?.displayName ?? ''}</span></span>
            <CopyPath path={folder?.path ?? ''} />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex border-t border-[hsl(var(--line))]">
        <div className="w-[44%] min-w-[300px] max-w-[520px] flex flex-col border-r border-[hsl(var(--line))] bg-surface-sunken/40">
          <div className="flex items-center gap-2 p-2.5 shrink-0">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter files"
                aria-label="Filter files"
                className="field !h-8 pl-8 pr-7 text-sm"
              />
              {filter && (
                <button onClick={() => setFilter('')} aria-label="Clear filter" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full text-faint hover:text-foreground hover:bg-foreground/[0.08]">
                  <X size={11} />
                </button>
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={selectAll} data-tip="Select every file shown (Ctrl A)">All</Button>
            <Button size="sm" variant="ghost" onClick={clearSel} disabled={selected.size === 0}>None</Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4 scroll-fade-y">
            {isLoading ? (
              <div className="grid place-items-center h-32"><Spinner size={16} className="text-faint" /></div>
            ) : (
              <RecoverTree
                files={files}
                selected={selected}
                onToggleFile={toggleFile}
                onToggleDir={toggleDir}
                filter={filter}
                selectedFile={selectedFile}
                onSelectFile={setSelectedFile}
                fileSnapshotOverrides={overrides}
              />
            )}
          </div>
          <p className="shrink-0 px-4 py-2.5 text-2xs text-faint border-t border-[hsl(var(--line))] flex items-center gap-1.5">
            <MousePointerClick size={11} />Click a file name to pin one of its versions.
          </p>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {showFilePanel ? (
            <FileSnapshotPanel
              key={selFileEntry.id}
              file={selFileEntry}
              pinnedId={overrides.get(selectedFile!)}
              onPin={(sid) => setOverrides((p) => new Map(p).set(selectedFile!, sid))}
              onUnpin={() => setOverrides((p) => { const n = new Map(p); n.delete(selectedFile!); return n; })}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div ref={optionsRef} className="flex-1 min-h-0 overflow-y-auto scroll-fade-y">
              <div className="max-w-[560px] px-6 py-5 space-y-7">
                <Section title="Where the files go">
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { k: 'export', Icon: FolderDown, label: 'Copy to a folder', sub: 'Your current files stay untouched' },
                      { k: 'restore', Icon: RotateCcw, label: 'Replace in place', sub: 'Overwrites the files on disk' },
                    ] as const).map(({ k, Icon, label, sub }) => {
                      const on = mode === k;
                      const danger = k === 'restore';
                      return (
                        <button
                          key={k}
                          onClick={() => setMode(k)}
                          aria-pressed={on}
                          className={`press flex flex-col items-start gap-2 p-3.5 rounded-xl text-left transition-[background-color,box-shadow] duration-200
                                      ${on
                                        ? danger ? 'bg-destructive/[0.08] shadow-[inset_0_0_0_1.5px_hsl(var(--destructive)/0.5)]' : 'bg-primary/[0.08] shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.55)]'
                                        : 'bg-foreground/[0.03] shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:bg-foreground/[0.055]'}`}
                        >
                          <Icon size={17} className={on ? (danger ? 'text-destructive' : 'text-primary') : 'text-muted-foreground'} />
                          <span>
                            <span className="block text-sm font-medium">{label}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">{sub}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {mode === 'export' && (
                    <div className="mt-3 flex gap-2">
                      <div className="field flex items-center text-sm truncate cursor-default" title={dest}>
                        {dest ? <span className="font-mono text-xs truncate">{formatPath(dest)}</span> : <span className="text-faint">No folder chosen</span>}
                      </div>
                      <Button icon={<FolderOpen size={14} />} onClick={() => void (async () => { const p = await pickFolder(); if (p) setDest(p); })()}>
                        Choose
                      </Button>
                    </div>
                  )}
                </Section>

                <Section
                  title="Which version"
                  aside={pinnedCount > 0 ? <span className="text-xs text-primary inline-flex items-center gap-1"><Pin size={11} />{plural(pinnedCount, 'file')} pinned</span> : undefined}
                >
                  <Segmented<'latest' | 'nthFromLatest' | 'asOf'>
                    value={snapKind}
                    onChange={setSnapKind}
                    ariaLabel="Which version"
                    options={[
                      { value: 'latest', label: 'Newest' },
                      { value: 'nthFromLatest', label: 'Saves back' },
                      { value: 'asOf', label: 'At a time' },
                    ]}
                  />

                  {snapKind === 'latest' && (
                    <div className="mt-3">
                      {isOnChange ? (
                        <Notice tone="caution" icon={<TriangleAlert size={13} />}>
                          The newest version is your most recent save, which may be the broken one. Pick “Saves back” or a time, or pin an earlier version per file.
                        </Notice>
                      ) : (
                        <Notice>Each file comes back as its most recently kept version.</Notice>
                      )}
                    </div>
                  )}

                  {snapKind === 'nthFromLatest' && (
                    <div className="mt-3 space-y-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[1, 2, 5, 10].map((n) => (
                          <button
                            key={n}
                            onClick={() => setNthOffset(n)}
                            aria-pressed={nthOffset === n}
                            className={`press h-8 px-3 rounded-lg text-xs font-medium tabular-nums transition-colors
                                        ${nthOffset === n ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.045] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.08]'}`}
                          >
                            {n} back
                          </button>
                        ))}
                        <label className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
                          Other
                          <input
                            type="number" min={1} max={9999}
                            value={nthOffset}
                            onChange={(e) => setNthOffset(Math.max(1, parseInt(e.target.value) || 1))}
                            className="field !h-8 !w-16 text-center tabular-nums"
                          />
                        </label>
                      </div>
                      <Notice>
                        Each file goes back {plural(nthOffset, 'save')} from its own newest version. 1 undoes the last save. Files with fewer saves are skipped.
                      </Notice>
                      {nthCoverage && (
                        <div className="space-y-1.5 px-1">
                          <p className="text-xs font-medium">
                            <span className={nthCoverage.covered === nthCoverage.total ? 'text-positive' : 'text-caution'}>{nthCoverage.covered}</span>
                            <span className="text-muted-foreground"> of {plural(nthCoverage.total, 'file')} can go back that far</span>
                          </p>
                          {nthCoverage.tooFew > 0 && <CoverageRow tone="caution">{plural(nthCoverage.tooFew, 'file')} with fewer than {nthOffset + 1} versions will be skipped.</CoverageRow>}
                          {nthCoverage.noSnaps > 0 && <CoverageRow tone="neg">{plural(nthCoverage.noSnaps, 'file')} with no versions at all.</CoverageRow>}
                        </div>
                      )}
                    </div>
                  )}

                  {snapKind === 'asOf' && (
                    <div className="mt-3 space-y-4">
                      <DateTimePicker value={asOfDate} onChange={setAsOfDate} placeholder="Pick a point in time" />
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">If there's no version at exactly that time, use the one</p>
                        <Segmented<SnapshotPreference>
                          size="sm"
                          value={snapPreference}
                          onChange={setSnapPreference}
                          ariaLabel="Direction"
                          options={[
                            { value: 'before', label: 'Just before' },
                            { value: 'after', label: 'Just after' },
                            { value: 'nearest', label: 'Closest' },
                          ]}
                        />
                        <p className="text-xs text-faint mt-2 leading-relaxed">
                          {snapPreference === 'before'
                            ? 'The safe choice. You always get a version that existed at that moment.'
                            : snapPreference === 'after'
                              ? 'Useful when you know something happened and want the result of it.'
                              : 'Whichever is closer in time. This may pick a newer version than you expect.'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Only if it's within</p>
                        <Segmented<Tolerance>
                          size="sm"
                          value={toleranceKey}
                          onChange={(k) => setToleranceMs(TOLERANCE_MS[k])}
                          ariaLabel="Tolerance"
                          options={[
                            { value: 'none', label: 'Any time' },
                            { value: '1h', label: '1 hour' },
                            { value: '6h', label: '6 hours' },
                            { value: '1d', label: '1 day' },
                          ]}
                        />
                      </div>

                      {asOfCoverage && (
                        <div className="space-y-1.5 px-1">
                          <p className="text-xs font-medium">
                            <span className={asOfCoverage.skipped === 0 ? 'text-positive' : 'text-caution'}>
                              {asOfCoverage.exact ? asOfCoverage.covered : `About ${asOfCoverage.covered}`}
                            </span>
                            <span className="text-muted-foreground"> of {plural(asOfCoverage.total, 'file')} have a matching version</span>
                          </p>
                          {asOfCoverage.exact && snapPreference === 'nearest' && toleranceMs === null && (
                            <CoverageRow tone="pos">With “Closest” and any time, every file that has at least one version is covered.</CoverageRow>
                          )}
                          {asOfCoverage.uncertain > 0 && !asOfCoverage.exact && (
                            <CoverageRow tone="caution">
                              {plural(asOfCoverage.uncertain, 'file')} {asOfCoverage.uncertain === 1 ? 'is' : 'are'} unsure{snapPreference === 'before' ? ': older versions exist, but maybe not before that time.' : '.'}
                            </CoverageRow>
                          )}
                          {asOfCoverage.skipped > 0 && (
                            <CoverageRow tone="neg">
                              {plural(asOfCoverage.skipped, 'file')} will be skipped{snapPreference === 'before' ? ', with no version before that time.' : ', with no versions at all.'}
                            </CoverageRow>
                          )}
                          {(!asOfCoverage.exact || asOfCoverage.skipped > 0) && (
                            <p className="text-xs text-faint pt-1">Preview shows the exact result for each file.</p>
                          )}
                        </div>
                      )}

                      <label className="flex items-center gap-3 cursor-pointer">
                        <span className="flex-1 text-sm">Include files deleted after this time</span>
                        <Switch checked={inclDeleted} onChange={setInclDeleted} label="Include files deleted after this time" />
                      </label>
                    </div>
                  )}
                </Section>

                <section data-section>
                  <button
                    onClick={() => setShowIgnore((v) => !v)}
                    aria-expanded={showIgnore}
                    className="flex items-center gap-2 w-full text-sm font-semibold"
                  >
                    Skip these paths
                    <span className="text-xs font-normal text-faint">{ignorePatterns.split('\n').filter((l) => l.trim()).length} rules</span>
                    <ChevronDown size={14} className={`ml-auto text-faint transition-transform duration-300 ease-zftm ${showIgnore ? 'rotate-180' : ''}`} />
                  </button>
                  {showIgnore && (
                    <div className="mt-2.5 animate-fade-in">
                      <textarea
                        value={ignorePatterns}
                        onChange={(e) => setIgnorePatterns(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        className="field !h-auto py-2.5 font-mono text-xs leading-relaxed resize-none selectable"
                      />
                      <p className="text-xs text-faint mt-1.5">One per line, written like a .gitignore file.</p>
                    </div>
                  )}
                </section>

                {result && <ResultPanel result={result} />}

                {running && progress && (
                  <div className="rounded-xl bg-card shadow-card p-4" role="status">
                    <div className="flex items-center justify-between text-xs mb-2.5">
                      <span className="text-muted-foreground tabular-nums">{progress.processed.toLocaleString()} of {progress.total.toLocaleString()}</span>
                      <span className="font-medium tabular-nums">{progressPct}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-foreground/[0.07] overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-zftm" style={{ width: `${progressPct}%` }} />
                    </div>
                    {progress.currentPath && <p className="text-2xs font-mono text-faint mt-2 truncate">{progress.currentPath}</p>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 flex items-center gap-3 px-5 h-[60px] border-t border-[hsl(var(--line))]">
        <div className="flex-1 min-w-0 flex items-center gap-3 text-sm">
          {selected.size > 0 ? (
            <>
              <span className="font-medium tabular-nums">{plural(selected.size, 'file')} selected</span>
              {pinnedCount > 0 && <span className="text-xs text-primary inline-flex items-center gap-1"><Pin size={11} />{pinnedCount} pinned</span>}
              {dateRange && <span className="text-xs text-faint truncate tabular-nums">last changed {fmt(dateRange.min)} to {fmt(dateRange.max)}</span>}
            </>
          ) : (
            <span className="text-muted-foreground">Tick the files you want back.</span>
          )}
        </div>
        <Button icon={<Eye size={14} />} onClick={() => void runRecover({ ...buildArgs(), dryRun: true })} disabled={selected.size === 0 || running}>
          Preview
        </Button>
        <Button
          variant={mode === 'restore' ? 'danger' : 'primary'}
          icon={mode === 'restore' ? <RotateCcw size={14} /> : <FolderDown size={14} />}
          loading={running}
          onClick={startRecover}
          disabled={selected.size === 0 || running || (mode === 'export' && !dest)}
        >
          {running ? 'Recovering' : mode === 'restore' ? `Replace ${selected.size > 0 ? plural(selected.size, 'file') : 'files'}` : `Copy ${selected.size > 0 ? plural(selected.size, 'file') : 'files'}`}
        </Button>
      </footer>

      <PreviewSheet
        result={previewResult}
        mode={mode}
        onClose={() => setPreviewResult(null)}
        onConfirm={() => {
          setPreviewResult(null);
          if (mode === 'restore') setShowConfirm(true);
          else void runRecover(buildArgs());
        }}
      />
      <RecoverConfirmDialog
        open={showConfirm}
        fileCount={selected.size}
        onConfirm={() => { setShowConfirm(false); void runRecover(buildArgs()); }}
        onCancel={() => setShowConfirm(false)}
      />
      <ConflictSheet
        open={showConflict}
        conflicts={pendingConflicts}
        onOverwrite={() => { setConflictPolicy('overwrite'); setShowConflict(false); void runRecover({ ...buildArgs('overwrite'), dryRun: conflictFromPreviewRef.current || undefined }); }}
        onSkip={() => { setConflictPolicy('skip'); setShowConflict(false); void runRecover({ ...buildArgs('skip'), dryRun: conflictFromPreviewRef.current || undefined }); }}
        onCancel={() => { setShowConflict(false); setRunning(false); }}
      />
    </div>
  );
}

function ResultPanel({ result }: { result: BulkRecoverResult }) {
  const [open, setOpen] = useState(false);
  const ok = result.failed.length === 0 && !result.abortedReason;
  return (
    <div className="rounded-xl bg-card shadow-card p-4 animate-scale-in">
      <div className="flex items-center gap-2.5">
        <span className={`w-7 h-7 rounded-full grid place-items-center ${ok ? 'bg-positive/12 text-positive' : 'bg-negative/12 text-negative'}`}>
          {ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
        </span>
        <span className="text-sm font-medium flex-1">
          {result.succeeded.toLocaleString()} of {plural(result.total, 'file')} recovered
        </span>
        <span className="text-xs text-faint tabular-nums">{fmtBytes(result.bytesWritten)}</span>
      </div>
      {result.skipped > 0 && <p className="text-xs text-muted-foreground mt-2 ml-[38px]">{plural(result.skipped, 'file')} skipped because they already existed.</p>}
      {result.abortedReason === 'disk_full' && <p className="text-xs text-negative mt-2 ml-[38px]">Stopped early because the destination disk is full.</p>}
      {result.failed.length > 0 && (
        <div className="mt-2 ml-[38px]">
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ChevronDown size={12} className={`transition-transform duration-300 ease-zftm ${open ? 'rotate-180' : ''}`} />
            {plural(result.failed.length, 'file')} failed
          </button>
          {open && (
            <div className="mt-2 space-y-1 max-h-40 overflow-auto selectable">
              {result.failed.map((f) => (
                <p key={f.relPath} className="font-mono text-2xs leading-relaxed">
                  <span className="text-foreground/70">{f.relPath}</span> <span className="text-negative">{f.error}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PreviewSheet({ result, mode, onClose, onConfirm }: {
  result: BulkRecoverResult | null;
  mode: 'export' | 'restore';
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [tab, setTab] = useState<'covered' | 'skipped'>('covered');
  const last = useRef<BulkRecoverResult | null>(null);
  if (result) last.current = result;
  const r = result ?? last.current;
  useEffect(() => { if (result) setTab('covered'); }, [result]);

  const covered = r?.preview?.filter((p) => !p.skipReason) ?? [];
  const skipped = r?.preview?.filter((p) => !!p.skipReason)
    ?? r?.failed.map((f) => ({ relPath: f.relPath, skipReason: f.error, snapshotAt: null, snapshotSource: null, sizeBytes: null })) ?? [];

  return (
    <Sheet open={!!result} onClose={onClose} width={620} label="Preview" className="max-h-[84vh]">
      <SheetHeader
        icon={<Eye size={18} />}
        title="Preview"
        description={r ? `${plural(r.succeeded, 'file')} would be recovered, ${fmtBytes(r.bytesWritten)} in total.${skipped.length ? ` ${plural(skipped.length, 'file')} would be skipped.` : ''}` : null}
        onClose={onClose}
      />
      {skipped.length > 0 && (
        <div className="px-6 pt-2 shrink-0">
          <Segmented<'covered' | 'skipped'>
            size="sm"
            value={tab}
            onChange={setTab}
            ariaLabel="Preview list"
            options={[{ value: 'covered', label: 'Recovered', count: covered.length }, { value: 'skipped', label: 'Skipped', count: skipped.length }]}
          />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 scroll-fade-y">
        {tab === 'covered' && covered.length === 0 && <p className="text-sm text-muted-foreground text-center py-10">No file would be recovered with these settings.</p>}
        {tab === 'covered' && covered.map((item) => (
          <div key={item.relPath} className="flex items-center gap-3 h-10 px-2.5 rounded-[calc(9px*var(--rs))] hover:bg-foreground/[0.04]">
            <FileIcon path={item.relPath} size={14} className="text-muted-foreground" />
            <span className="text-sm font-mono flex-1 min-w-0 truncate" title={item.relPath}>{item.relPath}</span>
            {item.snapshotSource && SOURCE[item.snapshotSource]?.Icon && (() => { const I = SOURCE[item.snapshotSource!].Icon!; return <I size={12} className="text-faint" aria-label={SOURCE[item.snapshotSource!].label} />; })()}
            {item.snapshotAt && <span className="text-xs text-muted-foreground tabular-nums shrink-0">{fmt(item.snapshotAt)}</span>}
            {item.sizeBytes != null && <span className="text-2xs text-faint tabular-nums w-14 text-right shrink-0">{fmtBytes(item.sizeBytes)}</span>}
          </div>
        ))}
        {tab === 'skipped' && skipped.map((item) => (
          <div key={item.relPath} className="flex items-center gap-3 h-10 px-2.5 rounded-[calc(9px*var(--rs))]">
            <XCircle size={13} className="text-negative shrink-0" />
            <span className="text-sm font-mono text-muted-foreground flex-1 min-w-0 truncate" title={item.relPath}>{item.relPath}</span>
            <span className="text-xs text-faint shrink-0 max-w-[200px] truncate" title={item.skipReason ?? ''}>{item.skipReason}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 px-6 py-4 border-t border-[hsl(var(--line))] shrink-0">
        {r && r.succeeded === 0 ? (
          <p className="flex-1 text-xs text-caution flex items-center gap-1.5"><TriangleAlert size={12} />Change the options and try again.</p>
        ) : <div className="flex-1" />}
        <Button onClick={onClose}>Back</Button>
        {r && r.succeeded > 0 && (
          <Button variant={mode === 'restore' ? 'danger' : 'primary'} icon={mode === 'restore' ? <RotateCcw size={14} /> : <FolderDown size={14} />} onClick={onConfirm} data-autofocus>
            {mode === 'restore' ? `Replace ${plural(r.succeeded, 'file')}` : `Copy ${plural(r.succeeded, 'file')}`}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

function ConflictSheet({ open, conflicts, onOverwrite, onSkip, onCancel }: {
  open: boolean;
  conflicts: string[];
  onOverwrite: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet open={open} onClose={onCancel} width={460} label="Files already exist">
      <SheetHeader
        icon={<TriangleAlert size={18} />}
        title="Some files are already there"
        description={`${plural(conflicts.length, 'file')} already ${conflicts.length === 1 ? 'exists' : 'exist'} in the folder you picked.`}
      />
      <div className="mx-6 mt-3 max-h-40 overflow-auto rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] p-2.5 space-y-0.5 selectable">
        {conflicts.map((p) => <p key={p} className="text-xs font-mono text-muted-foreground truncate">{p}</p>)}
      </div>
      <div className="flex justify-end gap-2 px-6 py-5">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={onSkip} data-autofocus>Keep existing</Button>
        <Button variant="danger" onClick={onOverwrite}>Overwrite them</Button>
      </div>
    </Sheet>
  );
}
