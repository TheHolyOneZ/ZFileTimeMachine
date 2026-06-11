import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import {
  ArrowLeft, Search, X, FolderDown, RotateCcw, Loader2,
  CheckCircle2, XCircle, ChevronDown, Eye, FolderOpen,
  AlertCircle, Pin, PinOff, Clock, AlertTriangle, FileText,
  History, Layers, Info,
} from 'lucide-react';
import type { SnapshotPreference } from '@/lib/types';
import { useQuery } from '@tanstack/react-query';
import { listen } from '@tauri-apps/api/event';
import { listFiles, listSnapshots, bulkRecover, pickFolder } from '@/lib/tauri';
import type {
  BulkRecoverArgs, BulkRecoverResult, RecoverProgressPayload,
  FileEntry, Snapshot, SnapshotPoint, ConflictPolicy,
} from '@/lib/types';
import { useFolders } from '@/hooks/useFolders';
import { RecoverTree } from '@/components/RecoverTree';
import { RecoverConfirmDialog } from '@/components/RecoverConfirmDialog';
import { DateTimePicker } from '@/components/DateTimePicker';
import { useToast } from '@/context/ToastContext';

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/', 'target/', '.git/', 'dist/', 'build/',
  '.next/', '.venv/', '__pycache__/', '.DS_Store',
].join('\n');

function fmt(ts: number | null, style: 'short' | 'medium' = 'short') {
  if (!ts) return '–';
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: style, timeStyle: style,
  });
}
function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

const SOURCE_LABEL: Record<string, string> = {
  change: 'OnChange', interval: 'Interval', manual: 'Manual', 'pre-rewind': 'Pre-rewind',
};
const SOURCE_COLOR: Record<string, string> = {
  change:       'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  interval:     'text-sky-400    bg-sky-400/10     border-sky-400/25',
  manual:       'text-violet-400 bg-violet-400/10  border-violet-400/25',
  'pre-rewind': 'text-amber-400  bg-amber-400/10   border-amber-400/25',
};


type SrcFilter = 'all' | 'change' | 'manual' | 'pre-rewind';

function FileSnapshotPanel({ file, pinnedId, onPin, onUnpin, onClose }: {
  file: FileEntry;
  pinnedId: number | undefined;
  onPin: (id: number) => void;
  onUnpin: () => void;
  onClose: () => void;
}) {
  const [src, setSrc] = useState<SrcFilter>('all');
  const { data: snaps = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ['snapshots', file.id],
    queryFn: () => listSnapshots(file.id),
  });
  const list = useMemo(
    () => src === 'all' ? snaps : snaps.filter((s) => s.source === src),
    [snaps, src],
  );
  const pinned = snaps.find((s) => s.id === pinnedId);

  return (
    <div className="flex flex-col h-full">

      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/6 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <FileText size={13} className="text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-foreground/90 truncate font-mono">
            {file.relPath.split('/').pop()}
          </p>
          <p className="text-[10px] text-muted-foreground/40 font-mono truncate">
            {file.relPath}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/6 text-muted-foreground/40 hover:text-foreground transition-all"
        >
          <X size={13} />
        </button>
      </div>


      {pinned && (
        <div className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-400/8 border border-amber-400/20">
          <Pin size={10} className="text-amber-400 shrink-0 fill-amber-400/40" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-amber-300/90 font-medium truncate">Pinned snapshot</p>
            <p className="text-[10px] text-amber-400/50 font-mono">{fmt(pinned.createdAt, 'medium')}</p>
          </div>
          <button onClick={onUnpin} className="p-1 rounded-lg hover:bg-amber-400/15 text-amber-400/50 hover:text-amber-400 transition-all" title="Remove pin">
            <PinOff size={11} />
          </button>
        </div>
      )}


      <div className="flex items-center gap-1 px-3 pt-3 pb-0 shrink-0">
        {(['all', 'change', 'manual', 'pre-rewind'] as SrcFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setSrc(f)}
            className={`px-2 py-1 rounded-lg text-[10px] font-medium border transition-all
                        ${src === f
                          ? 'bg-primary/15 border-primary/30 text-primary'
                          : 'border-transparent text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/5'
                        }`}
          >
            {f === 'all' ? `All ${snaps.length}` : SOURCE_LABEL[f]}
          </button>
        ))}
      </div>


      <div className="flex-1 min-h-0 overflow-auto px-3 py-2 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 gap-2 text-xs text-muted-foreground/30">
            <Loader2 size={13} className="animate-spin" /> Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground/25">
            No snapshots match.
          </div>
        ) : list.map((snap, idx) => {
          const active = snap.id === pinnedId;
          const isLatest = idx === 0 && src === 'all';
          return (
            <div
              key={snap.id}
              onClick={() => active ? onUnpin() : onPin(snap.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all group
                          ${active
                            ? 'bg-amber-400/8 border-amber-400/25 shadow-[inset_0_1px_0_rgba(251,191,36,0.08)]'
                            : 'bg-white/2 border-white/5 hover:bg-white/5 hover:border-white/10'
                          }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[11px] font-mono ${active ? 'text-amber-300/90' : 'text-foreground/70'}`}>
                    {fmt(snap.createdAt, 'medium')}
                  </span>
                  {isLatest && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
                      latest
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${SOURCE_COLOR[snap.source] ?? 'text-muted-foreground/40 bg-white/5 border-white/10'}`}>
                    {SOURCE_LABEL[snap.source] ?? snap.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 font-mono">{fmtBytes(snap.sizeBytes)}</span>
                  {snap.deltaBytes !== snap.sizeBytes && (
                    <span className="text-[10px] text-muted-foreground/25 font-mono">Δ{fmtBytes(snap.deltaBytes)}</span>
                  )}
                </div>
              </div>
              <Pin size={11} className={`shrink-0 transition-all ${active ? 'text-amber-400 fill-amber-400/50' : 'text-white/10 group-hover:text-white/30'}`} />
            </div>
          );
        })}
      </div>

      <div className="px-3 pb-3 pt-1 shrink-0 border-t border-white/5 mt-1">
        <p className="text-[10px] text-muted-foreground/25 leading-relaxed">
          Pinned files recover to this exact snapshot, ignoring the global snapshot point.
        </p>
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

  const visible = useMemo(
    () => filter ? files.filter((f) => f.relPath.toLowerCase().includes(filter.toLowerCase())) : files,
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
    () => selectedFile ? files.find((f) => f.relPath === selectedFile) ?? null : null,
    [files, selectedFile],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
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
        toast('error', `Recovery stopped: destination full. ${res.succeeded}/${res.total} files written.`);
      } else if (res.failed.length === 0) {
        const destMsg = mode === 'export' && dest ? ` → ${dest}` : '';
        toast('success', `Recovered ${res.succeeded} file${res.succeeded !== 1 ? 's' : ''} successfully.${destMsg}`, {
          action: mode === 'export' && dest ? { label: 'Open folder', onClick: () => void openDest() } : undefined,
        });
      } else {
        toast('info', `Recovered ${res.succeeded}/${res.total}. ${res.failed.length} failed — see below.`);
      }
    } catch (e) { toast('error', String(e)); }
    finally { setRunning(false); unlisten(); unlistenRef.current = null; }
  }

  async function openDest() {
    try { await invoke('open_path', { path: dest }); } catch (e) { toast('error', `Could not open folder: ${String(e)}`); }
  }

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.processed / progress.total) * 100) : 0;
  const pinnedCount = overrides.size;
  const showFilePanel = selectedFile !== null && selFileEntry !== null;

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-background">


      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/6 shrink-0 bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-sm">
        <button
          onClick={() => navigate(`/folder/${folderId}`)}
          className="p-1.5 rounded-lg bg-white/4 hover:bg-white/8 text-muted-foreground/60 hover:text-foreground transition-all border border-white/5"
        >
          <ArrowLeft size={14} />
        </button>

        <div className="w-8 h-8 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0 shadow-[0_0_12px_hsl(217_91%_60%/0.15)]">
          <History size={15} className="text-primary/80" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground/90">Recover</h1>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-sm text-muted-foreground/60 truncate">{folder?.displayName ?? '…'}</span>
          </div>
          <p className="text-[11px] text-muted-foreground/35 font-mono truncate mt-0.5">{folder?.path ?? ''}</p>
        </div>

        {pinnedCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-400/10 border border-amber-400/20 shadow-[0_0_8px_rgba(251,191,36,0.1)]">
            <Pin size={10} className="text-amber-400 fill-amber-400/60" />
            <span className="text-[11px] text-amber-400/90 font-medium">{pinnedCount} pinned</span>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-primary/8 border border-primary/15">
            <Layers size={11} className="text-primary/60" />
            <span className="text-[11px] text-primary/70 font-medium">{selected.size} selected</span>
          </div>
        )}
      </div>


      <div className="flex-1 relative overflow-hidden">
      <div className="absolute inset-0 flex overflow-hidden">


        <div className="flex flex-col w-[54%] min-w-0 border-r border-white/6 overflow-hidden">


          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/4 shrink-0 bg-white/1">
            <div className="flex items-center gap-1.5 flex-1 bg-white/4 rounded-xl px-3 py-1.5 border border-white/6 focus-within:border-primary/30 focus-within:bg-primary/5 transition-all">
              <Search size={11} className="text-muted-foreground/35 shrink-0" />
              <input
                type="text"
                placeholder="Filter files…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none"
              />
              {filter && (
                <button onClick={() => setFilter('')} className="text-muted-foreground/30 hover:text-muted-foreground transition-colors">
                  <X size={11} />
                </button>
              )}
            </div>
            <button
              onClick={selectAll}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-primary/8 border border-primary/15 text-primary/70 hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all"
            >
              All
            </button>
            <button
              onClick={clearSel}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/4 border border-white/8 text-muted-foreground/50 hover:bg-white/8 hover:text-foreground transition-all"
            >
              None
            </button>
          </div>


          <div className="flex-1 overflow-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 gap-2 text-xs text-muted-foreground/30">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
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


          <div className="px-3 py-2 border-t border-white/4 shrink-0">
            <p className="text-[10px] text-muted-foreground/25">
              Click a filename to view its snapshot history and pin a specific version.
            </p>
          </div>
        </div>


        <div className="flex flex-col w-[46%] overflow-hidden bg-card/20">
          {showFilePanel ? (
            <FileSnapshotPanel
              file={selFileEntry}
              pinnedId={overrides.get(selectedFile!)}
              onPin={(sid) => setOverrides((p) => new Map(p).set(selectedFile!, sid))}
              onUnpin={() => setOverrides((p) => { const n = new Map(p); n.delete(selectedFile!); return n; })}
              onClose={() => setSelectedFile(null)}
            />
          ) : (
            <div className="flex-1 overflow-auto">

              {isOnChange && snapKind === 'latest' && (
                <div className="mx-4 mt-4 flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-amber-400/6 border border-amber-400/18">
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300/75 leading-relaxed">
                    <strong className="font-semibold text-amber-300/90">OnChange mode active.</strong>{' '}
                    "Latest" = your last save, which may be the broken version.
                    Click any file to browse its history and pin a safe snapshot.
                  </p>
                </div>
              )}

              <div className="p-4 space-y-5">


                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-2.5">
                    Recovery mode
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { k: 'export',  icon: FolderDown, label: 'Export',  sub: 'Copy to another folder', accent: 'primary' },
                      { k: 'restore', icon: RotateCcw,  label: 'Restore', sub: 'Overwrite in place',     accent: 'red' },
                    ] as const).map(({ k, icon: Icon, label, sub, accent }) => (
                      <button
                        key={k}
                        onClick={() => setMode(k)}
                        className={`flex flex-col gap-1.5 items-start px-3.5 py-3 rounded-xl border text-left transition-all
                                    ${mode === k
                                      ? accent === 'red'
                                        ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.08)]'
                                        : 'bg-primary/10 border-primary/30 shadow-[0_0_12px_hsl(217_91%_60%/0.1)]'
                                      : 'bg-white/2 border-white/6 hover:bg-white/5 hover:border-white/12'
                                    }`}
                      >
                        <Icon size={15} className={mode === k
                          ? accent === 'red' ? 'text-red-400' : 'text-primary'
                          : 'text-muted-foreground/40'}
                        />
                        <div>
                          <p className={`text-xs font-semibold ${mode === k ? (accent === 'red' ? 'text-red-400' : 'text-primary') : 'text-foreground/70'}`}>
                            {label}
                          </p>
                          <p className={`text-[10px] ${mode === k ? (accent === 'red' ? 'text-red-400/50' : 'text-primary/50') : 'text-muted-foreground/35'}`}>
                            {sub}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>


                {mode === 'export' && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest mb-2.5">
                      Destination
                    </p>
                    <div className="flex gap-2">
                      <div
                        className="flex-1 px-3 py-2.5 rounded-xl bg-white/3 border border-white/8 text-[11px] font-mono text-foreground/50 truncate"
                        title={dest}
                      >
                        {dest || <span className="text-muted-foreground/25">No folder selected</span>}
                      </div>
                      <button
                        onClick={() => void (async () => { const p = await pickFolder(); if (p) setDest(p); })()}
                        className="px-3 py-2.5 rounded-xl border border-white/10 bg-white/4 hover:bg-white/8 text-muted-foreground/50 hover:text-foreground transition-all"
                      >
                        <FolderOpen size={13} />
                      </button>
                    </div>
                  </div>
                )}


                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest">
                      Snapshot point
                    </p>
                    {pinnedCount > 0 && (
                      <span className="text-[10px] text-amber-400/60 font-medium">
                        {pinnedCount} file{pinnedCount !== 1 ? 's' : ''} use pinned version
                      </span>
                    )}
                  </div>


                  <div className="flex p-1 rounded-xl bg-white/3 border border-white/6 gap-0.5">
                    {([
                      { k: 'latest',        label: 'Latest' },
                      { k: 'nthFromLatest', label: 'N ago'  },
                      { k: 'asOf',          label: 'As of'  },
                    ] as const).map(({ k, label }) => (
                      <button
                        key={k}
                        onClick={() => setSnapKind(k)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all
                                    ${snapKind === k
                                      ? 'bg-primary/20 text-primary shadow-sm border border-primary/25'
                                      : 'text-muted-foreground/40 hover:text-foreground/70'
                                    }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>


                  {snapKind === 'nthFromLatest' && (
                    <div className="mt-3 space-y-2.5">
                      <div className="flex gap-1.5 flex-wrap">
                        {[1, 2, 5, 10].map((n) => (
                          <button
                            key={n}
                            onClick={() => setNthOffset(n)}
                            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono font-medium transition-all
                                        ${nthOffset === n
                                          ? 'bg-primary/15 border-primary/30 text-primary'
                                          : 'bg-white/3 border-white/8 text-muted-foreground/50 hover:border-white/15 hover:text-foreground/70'
                                        }`}
                          >
                            ←{n}
                          </button>
                        ))}
                        <div className="flex items-center gap-1.5 ml-auto">
                          <span className="text-[10px] text-muted-foreground/35">custom</span>
                          <input
                            type="number" min={1} max={9999}
                            value={nthOffset}
                            onChange={(e) => setNthOffset(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 px-2 py-1.5 rounded-lg bg-secondary/60 border border-border/50 text-[11px] font-mono text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-white/2 border border-white/5">
                        <Info size={10} className="text-muted-foreground/30 shrink-0" />
                        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                          Each file goes back{' '}
                          <strong className="text-foreground/60">
                            {nthOffset} save{nthOffset !== 1 ? 's' : ''}
                          </strong>{' '}
                          from its own latest snapshot.{' '}
                          ←1 = undo the last save, ←5 = 5 saves ago.
                          Files with fewer saves than this number are skipped.
                        </p>
                      </div>

                      {nthCoverage && (
                        <div className={`px-3 py-2.5 rounded-xl border space-y-1.5
                                        ${nthCoverage.covered === nthCoverage.total
                                          ? 'bg-emerald-500/5 border-emerald-500/15'
                                          : 'bg-amber-400/5 border-amber-400/15'
                                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground/50 font-medium">Coverage</span>
                            <span className={`text-[11px] font-semibold font-mono
                                            ${nthCoverage.covered === nthCoverage.total ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {nthCoverage.covered}/{nthCoverage.total} files
                            </span>
                          </div>
                          {nthCoverage.tooFew > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-400/70">
                              <AlertTriangle size={9} className="shrink-0" />
                              <span>
                                {nthCoverage.tooFew} file{nthCoverage.tooFew !== 1 ? 's' : ''} have fewer than {nthOffset + 1} snapshots
                                — <strong>will be skipped</strong>
                              </span>
                            </div>
                          )}
                          {nthCoverage.noSnaps > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-red-400/70">
                              <XCircle size={9} className="shrink-0" />
                              <span>
                                {nthCoverage.noSnaps} file{nthCoverage.noSnaps !== 1 ? 's' : ''} have no snapshots at all
                              </span>
                            </div>
                          )}
                          {nthCoverage.covered === nthCoverage.total && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/70">
                              <CheckCircle2 size={9} className="shrink-0" />
                              All selected files have enough history.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}


                  {snapKind === 'asOf' && (
                    <div className="mt-3 space-y-3">
                      <DateTimePicker
                        value={asOfDate}
                        onChange={setAsOfDate}
                        placeholder="Pick a point in time…"
                      />


                      <div>
                        <p className="text-[10px] text-muted-foreground/40 mb-1.5 flex items-center gap-1">
                          <Clock size={9} /> Snapshot direction
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            {
                              k: 'before' as const,
                              label: 'Before',
                              sub: 'Latest snapshot at or before chosen time',
                              icon: '←',
                            },
                            {
                              k: 'after' as const,
                              label: 'After',
                              sub: 'Earliest snapshot at or after chosen time',
                              icon: '→',
                            },
                            {
                              k: 'nearest' as const,
                              label: 'Nearest',
                              sub: 'Closest snapshot in either direction',
                              icon: '↔',
                            },
                          ]).map(({ k, label, sub, icon }) => (
                            <button
                              key={k}
                              onClick={() => setSnapPreference(k)}
                              title={sub}
                              className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl border text-center transition-all
                                          ${snapPreference === k
                                            ? 'bg-primary/15 border-primary/30 text-primary'
                                            : 'bg-white/2 border-white/6 text-muted-foreground/40 hover:bg-white/5 hover:text-foreground/70'
                                          }`}
                            >
                              <span className="text-[13px] font-mono font-bold leading-none">{icon}</span>
                              <span className="text-[10px] font-semibold">{label}</span>
                            </button>
                          ))}
                        </div>
                        <p className="text-[10px] text-muted-foreground/30 mt-1.5 leading-relaxed">
                          {snapPreference === 'before'
                            ? 'Safe default. Gets the state just before your chosen time — you always recover a known past version.'
                            : snapPreference === 'after'
                              ? 'Gets the version saved right after your chosen time. Useful when you know something happened and want the result.'
                              : 'Gets whichever snapshot is closest in time. Most flexible; may grab a newer version than expected.'}
                        </p>
                      </div>


                      <div>
                        <p className="text-[10px] text-muted-foreground/40 mb-1.5 flex items-center gap-1">
                          <AlertCircle size={9} /> Tolerance window
                          <span className="text-muted-foreground/25 ml-0.5">(optional)</span>
                        </p>
                        <div className="flex gap-1.5 flex-wrap">
                          {([
                            { label: 'None', value: null },
                            { label: '±1h',  value: 3_600_000 },
                            { label: '±6h',  value: 21_600_000 },
                            { label: '±1d',  value: 86_400_000 },
                          ] as const).map(({ label, value }) => (
                            <button
                              key={label}
                              onClick={() => setToleranceMs(value)}
                              className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-medium transition-all
                                          ${toleranceMs === value
                                            ? 'bg-primary/15 border-primary/30 text-primary'
                                            : 'bg-white/2 border-white/6 text-muted-foreground/40 hover:text-foreground/70 hover:bg-white/5'
                                          }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {toleranceMs !== null && (
                          <p className="text-[10px] text-muted-foreground/30 mt-1.5">
                            Files with no snapshot within{' '}
                            <strong className="text-foreground/50">
                              {toleranceMs >= 86_400_000
                                ? `${toleranceMs / 86_400_000}d`
                                : `${toleranceMs / 3_600_000}h`}
                            </strong>{' '}
                            of the chosen time will be skipped.
                          </p>
                        )}
                      </div>


                      {asOfCoverage && (
                        <div className={`px-3 py-2.5 rounded-xl border space-y-1.5
                                        ${asOfCoverage.skipped > 0
                                          ? 'bg-amber-400/4 border-amber-400/15'
                                          : 'bg-emerald-500/4 border-emerald-500/12'
                                        }`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground/50 font-medium">
                              Coverage{!asOfCoverage.exact && <span className="text-muted-foreground/30"> (estimate)</span>}
                            </span>
                            <span className={`text-[11px] font-semibold font-mono
                                            ${asOfCoverage.skipped === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {asOfCoverage.exact
                                ? `${asOfCoverage.covered}/${asOfCoverage.total}`
                                : `~${asOfCoverage.covered}/${asOfCoverage.total}`}
                            </span>
                          </div>

                          {asOfCoverage.exact && snapPreference === 'nearest' && toleranceMs === null && (
                            <div className="flex items-start gap-1.5 text-[10px] text-emerald-400/70">
                              <CheckCircle2 size={9} className="shrink-0 mt-0.5" />
                              <span>
                                <strong>Nearest + no tolerance</strong> — guaranteed: any file with ≥1 snapshot
                                is always covered, no matter how old.
                              </span>
                            </div>
                          )}

                          {asOfCoverage.covered > 0 && !asOfCoverage.exact && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/60">
                              <CheckCircle2 size={9} className="shrink-0" />
                              {asOfCoverage.covered} file{asOfCoverage.covered !== 1 ? 's' : ''} confirmed covered
                            </div>
                          )}

                          {asOfCoverage.uncertain > 0 && !asOfCoverage.exact && (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-400/60">
                              <AlertTriangle size={9} className="shrink-0" />
                              {asOfCoverage.uncertain} file{asOfCoverage.uncertain !== 1 ? 's' : ''} uncertain
                              {snapPreference === 'before'
                                ? ' — have older snapshots, may or may not be before chosen time'
                                : ' — use Preview to verify'}
                            </div>
                          )}

                          {asOfCoverage.skipped > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] text-red-400/70">
                              <XCircle size={9} className="shrink-0" />
                              {asOfCoverage.skipped} file{asOfCoverage.skipped !== 1 ? 's' : ''} will be skipped
                              {snapPreference === 'before' ? ' — no snapshot before chosen time' : ' — no snapshots at all'}
                            </div>
                          )}

                          {(!asOfCoverage.exact || asOfCoverage.skipped > 0) && (
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/25 border-t border-white/4 pt-1.5 mt-0.5">
                              <Eye size={9} />
                              <span>Hit <strong className="text-foreground/35">Preview</strong> for exact per-file results before recovering.</span>
                            </div>
                          )}
                        </div>
                      )}


                      <label className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={inclDeleted}
                          onChange={(e) => setInclDeleted(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="relative w-8 h-[18px] rounded-full border border-border bg-secondary/60
                                        peer-checked:bg-primary peer-checked:border-primary transition-colors shrink-0">
                          <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white/50
                                          peer-checked:translate-x-3.5 peer-checked:bg-white
                                          transition-transform shadow-sm" />
                        </div>
                        <span className="text-[11px] text-muted-foreground/50 group-hover:text-muted-foreground/70 transition-colors">
                          Include files deleted after this time
                        </span>
                      </label>
                    </div>
                  )}
                </div>


                <div>
                  <button
                    onClick={() => setShowIgnore((v) => !v)}
                    className="flex items-center gap-2 w-full text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-widest hover:text-muted-foreground/70 transition-colors"
                  >
                    Ignore patterns
                    <ChevronDown size={11} className={`ml-auto transition-transform ${showIgnore ? 'rotate-180' : ''}`} />
                  </button>
                  {showIgnore && (
                    <div className="mt-2.5">
                      <textarea
                        value={ignorePatterns}
                        onChange={(e) => setIgnorePatterns(e.target.value)}
                        rows={5}
                        placeholder="node_modules/&#10;target/&#10;.git/"
                        className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/50 text-[11px]
                                   font-mono text-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/30
                                   resize-none leading-relaxed focus:border-primary/30 transition-all"
                      />
                      <p className="text-[10px] text-muted-foreground/30 mt-1.5">One per line, gitignore syntax.</p>
                    </div>
                  )}
                </div>


                {result && <ResultPanel result={result} />}


                {running && progress && (
                  <div className="rounded-xl border border-white/8 bg-white/2 p-3.5">
                    <div className="flex items-center justify-between text-[11px] mb-2">
                      <span className="text-muted-foreground/50 font-mono">{progress.processed}/{progress.total}</span>
                      <span className="text-primary/60 font-medium">{progressPct}%</span>
                    </div>
                    <div className="w-full h-1 bg-white/6 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {progress.currentPath && (
                      <p className="text-[10px] font-mono text-muted-foreground/30 mt-2 truncate">{progress.currentPath}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>


      <div className="flex items-center gap-3 px-5 py-3.5 border-t border-white/6 shrink-0 bg-gradient-to-r from-card/60 to-card/30">

        <div className="flex-1 min-w-0">
          {selected.size > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-foreground/80">{selected.size} file{selected.size !== 1 ? 's' : ''}</span>
              {pinnedCount > 0 && (
                <span className="text-[11px] text-amber-400/60 flex items-center gap-1">
                  <Pin size={9} /> {pinnedCount} pinned
                </span>
              )}
              {dateRange && (
                <span className="text-[11px] text-muted-foreground/35 font-mono">
                  {fmt(dateRange.min)} → {fmt(dateRange.max)}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/25">Select files from the tree to recover</p>
          )}
        </div>


        <button
          onClick={() => void runRecover({ ...buildArgs(), dryRun: true })}
          disabled={selected.size === 0 || running}
          className="flex items-center gap-1.5 px-3.5 py-2 text-[12px] rounded-xl border border-white/10
                     bg-white/4 text-foreground/60 hover:bg-white/8 hover:text-foreground hover:border-white/18
                     disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          <Eye size={13} />
          Preview
        </button>


        <button
          onClick={() => {
            if (selected.size === 0) return;
            if (mode === 'export' && !dest) { toast('error', 'Pick an export destination first.'); return; }
            if (mode === 'restore') { setShowConfirm(true); return; }
            void runRecover(buildArgs());
          }}
          disabled={selected.size === 0 || running || (mode === 'export' && !dest)}
          className={`flex items-center gap-2 px-4 py-2 text-[12px] rounded-xl font-semibold transition-all
                      disabled:opacity-25 disabled:cursor-not-allowed
                      ${mode === 'restore'
                        ? 'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_16px_rgba(239,68,68,0.3)] hover:shadow-[0_0_24px_rgba(239,68,68,0.4)]'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_16px_hsl(217_91%_60%/0.35)] hover:shadow-[0_0_24px_hsl(217_91%_60%/0.45)]'
                      }`}
        >
          {running
            ? <Loader2 size={13} className="animate-spin" />
            : mode === 'restore' ? <RotateCcw size={13} /> : <FolderDown size={13} />
          }
          {running ? 'Recovering…' : `Recover${selected.size > 0 ? ` ${selected.size}` : ''} file${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>


      {previewResult && (
        <PreviewModal
          result={previewResult}
          mode={mode}
          onClose={() => setPreviewResult(null)}
          onConfirm={() => {
            setPreviewResult(null);
            if (mode === 'restore') setShowConfirm(true);
            else void runRecover(buildArgs());
          }}
        />
      )}
      {showConfirm && (
        <RecoverConfirmDialog
          fileCount={selected.size}
          totalBytes={0}
          onConfirm={() => { setShowConfirm(false); void runRecover(buildArgs()); }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
      {showConflict && (
        <ConflictDialog
          conflicts={pendingConflicts}
          onOverwrite={() => { setConflictPolicy('overwrite'); setShowConflict(false); void runRecover({ ...buildArgs('overwrite'), dryRun: conflictFromPreviewRef.current || undefined }); }}
          onSkip={() => { setConflictPolicy('skip'); setShowConflict(false); void runRecover({ ...buildArgs('skip'), dryRun: conflictFromPreviewRef.current || undefined }); }}
          onCancel={() => { setShowConflict(false); setRunning(false); }}
        />
      )}
    </div>
  );
}


function ResultPanel({ result }: { result: BulkRecoverResult }) {
  const [open, setOpen] = useState(false);
  const ok = result.failed.length === 0 && !result.abortedReason;

  return (
    <div className={`rounded-xl border p-3.5 text-xs
                    ${ok
                      ? 'bg-emerald-500/6 border-emerald-500/18'
                      : 'bg-red-500/6 border-red-500/18'
                    }`}>
      <div className="flex items-center gap-2 flex-wrap gap-y-1">
        {ok
          ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
          : <XCircle size={14} className="text-red-400 shrink-0" />
        }
        <span className={`font-semibold ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {result.dryRun ? 'Preview: ' : ''}{result.succeeded}/{result.total} written
        </span>
        {result.skipped > 0 && (
          <span className="text-amber-400/60 text-[10px]">{result.skipped} skipped (conflict)</span>
        )}
        {!result.dryRun && (
          <span className="text-muted-foreground/40 ml-auto font-mono">{fmtBytes(result.bytesWritten)}</span>
        )}
        {result.dryRun && (
          <span className="text-muted-foreground/35 ml-auto text-[10px]">dry run</span>
        )}
      </div>

      {result.abortedReason === 'disk_full' && (
        <div className="flex items-center gap-1.5 mt-2 text-red-400/70">
          <AlertCircle size={11} />
          <span>Stopped: destination disk full</span>
        </div>
      )}

      {result.failed.length > 0 && (
        <div className="mt-2.5">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            {result.failed.length} failed
          </button>
          {open && (
            <div className="mt-2 space-y-1 max-h-36 overflow-auto">
              {result.failed.map((f) => (
                <div key={f.relPath} className="font-mono text-[10px] text-red-400/60 leading-relaxed">
                  <span className="text-foreground/40">{f.relPath}:</span> {f.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function PreviewModal({ result, mode, onClose, onConfirm }: {
  result: BulkRecoverResult;
  mode: 'export' | 'restore';
  onClose: () => void;
  onConfirm: () => void;
}) {
  const covered = result.preview?.filter((p) => !p.skipReason) ?? [];
  const skipped = result.preview?.filter((p) => !!p.skipReason) ?? result.failed.map((f) => ({ relPath: f.relPath, skipReason: f.error, snapshotAt: null, snapshotSource: null, sizeBytes: null }));
  const [tab, setTab] = useState<'covered' | 'skipped'>('covered');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-card border border-white/10 rounded-2xl shadow-2xl animate-fade-in flex flex-col max-h-[82vh]">


        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <Eye size={15} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground/90">Recovery Preview</h2>
            <p className="text-[11px] text-muted-foreground/50 font-mono mt-0.5">
              {result.succeeded} file{result.succeeded !== 1 ? 's' : ''} · {fmtBytes(result.bytesWritten)}
              {skipped.length > 0 && (
                <span className="text-amber-400/60"> · {skipped.length} would be skipped</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/6 text-muted-foreground/40 hover:text-foreground transition-all">
            <X size={13} />
          </button>
        </div>


        <div className="flex px-4 pt-3 gap-1 shrink-0">
          <button
            onClick={() => setTab('covered')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
                        ${tab === 'covered' ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20' : 'text-muted-foreground/40 hover:text-foreground/60'}`}
          >
            <CheckCircle2 size={11} />
            Would recover ({covered.length})
          </button>
          {skipped.length > 0 && (
            <button
              onClick={() => setTab('skipped')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all
                          ${tab === 'skipped' ? 'bg-red-500/10 text-red-400 border border-red-500/18' : 'text-muted-foreground/40 hover:text-foreground/60'}`}
            >
              <XCircle size={11} />
              Would skip ({skipped.length})
            </button>
          )}
        </div>


        <div className="flex-1 overflow-auto px-4 py-3 space-y-1">
          {tab === 'covered' && covered.length === 0 && (
            <div className="flex items-center justify-center h-24 text-xs text-muted-foreground/25">
              No files would be recovered with these settings.
            </div>
          )}
          {tab === 'covered' && covered.map((item) => (
            <div key={item.relPath} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-500/4 border border-emerald-500/8 group">
              <FileText size={11} className="text-emerald-400/40 shrink-0" />
              <span className="text-[11px] font-mono text-foreground/70 flex-1 min-w-0 truncate" title={item.relPath}>
                {item.relPath}
              </span>
              <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                {item.snapshotSource && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${SOURCE_COLOR[item.snapshotSource] ?? 'text-muted-foreground/40 bg-white/5 border-white/10'}`}>
                    {SOURCE_LABEL[item.snapshotSource] ?? item.snapshotSource}
                  </span>
                )}
                {item.snapshotAt && (
                  <span className="text-[10px] font-mono text-muted-foreground/40">{fmt(item.snapshotAt)}</span>
                )}
                {item.sizeBytes != null && (
                  <span className="text-[10px] font-mono text-muted-foreground/30">{fmtBytes(item.sizeBytes)}</span>
                )}
              </div>

              {item.snapshotAt && (
                <span className="text-[10px] font-mono text-muted-foreground/35 shrink-0 group-hover:hidden">
                  {fmt(item.snapshotAt)}
                </span>
              )}
            </div>
          ))}
          {tab === 'skipped' && skipped.map((item) => (
            <div key={item.relPath} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-red-500/4 border border-red-500/8">
              <XCircle size={11} className="text-red-400/40 shrink-0" />
              <span className="text-[11px] font-mono text-foreground/50 flex-1 min-w-0 truncate" title={item.relPath}>
                {item.relPath}
              </span>
              <span className="text-[10px] text-red-400/50 shrink-0 max-w-[160px] truncate" title={item.skipReason ?? ''}>
                {item.skipReason}
              </span>
            </div>
          ))}
        </div>


        <div className="flex items-center gap-2 px-5 py-4 border-t border-white/6 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-white/8 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex-1" />
          {result.succeeded === 0 ? (
            <p className="text-[11px] text-amber-400/60 flex items-center gap-1.5">
              <AlertTriangle size={11} />
              No files would be recovered — adjust settings and try again.
            </p>
          ) : (
            <button
              onClick={onConfirm}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold transition-all
                          ${mode === 'restore'
                            ? 'bg-red-500 text-white hover:bg-red-600 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
                            : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_12px_hsl(217_91%_60%/0.3)]'
                          }`}
            >
              {mode === 'restore' ? <RotateCcw size={13} /> : <FolderDown size={13} />}
              {mode === 'restore' ? 'Looks good — restore' : `Looks good — recover ${result.succeeded} file${result.succeeded !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


function ConflictDialog({ conflicts, onOverwrite, onSkip, onCancel }: {
  conflicts: string[];
  onOverwrite: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-white/10 rounded-2xl shadow-2xl p-6 animate-fade-in">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
            <AlertCircle size={16} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">Destination conflicts</h2>
            <p className="text-xs text-muted-foreground/60">
              {conflicts.length} file{conflicts.length !== 1 ? 's' : ''} already exist at the destination.
            </p>
          </div>
        </div>
        <div className="max-h-28 overflow-auto bg-white/2 rounded-xl border border-white/6 p-2.5 mb-4 space-y-0.5">
          {conflicts.map((p) => <p key={p} className="text-[10px] font-mono text-foreground/40">{p}</p>)}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-white/8 text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button onClick={onSkip} className="flex-1 py-2 rounded-xl border border-white/10 bg-white/4 text-xs text-foreground/70 hover:bg-white/8 transition-colors">Skip existing</button>
          <button onClick={onOverwrite} className="flex-1 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-400 hover:bg-amber-500/22 transition-colors">Overwrite all</button>
        </div>
      </div>
    </div>
  );
}
