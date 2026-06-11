import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { RotateCcw, Diff, GitCommit, X, Maximize2 } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { NoteEditor } from './NoteEditor';
import { DiffViewer } from './DiffViewer';
import type { Snapshot, DiffResult } from '@/lib/types';
import { useDiff, useRewind, useSetSnapshotNote } from '@/hooks/useTimeline';
import { RewindDialog } from './RewindDialog';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';

interface Props {
  snapshots: Snapshot[];
  fileName: string;
  noteFilter?: string;
}

function fmtDelta(n: number): string {
  if (n === 0) return '±0';
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${n}B`;
  if (abs < 1024 * 1024) return `${sign}${(n / 1024).toFixed(1)}KB`;
  return `${sign}${(n / 1024 / 1024).toFixed(1)}MB`;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

const SOURCE_STYLES: Record<string, string> = {
  change:       'bg-blue-500/15 text-blue-400 border-blue-500/20',
  interval:     'bg-purple-500/15 text-purple-400 border-purple-500/20',
  manual:       'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'pre-rewind': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
};

function SourceBadge({ source }: { source: string }) {
  const cls = SOURCE_STYLES[source] ?? 'bg-secondary text-muted-foreground border-border';
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {source}
    </span>
  );
}


interface DiffModalProps {
  snap: Snapshot;
  diff: DiffResult;
  onClose: () => void;
}

function DiffModal({ snap, diff, onClose }: DiffModalProps) {
  const ago  = formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true });
  const full = format(new Date(snap.createdAt), 'MMM d, yyyy · HH:mm:ss');

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const added   = diff.lines.filter((l) => l.kind === 'insert').length;
  const removed = diff.lines.filter((l) => l.kind === 'delete').length;

  return createPortal(
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-card/98 border border-border/60 rounded-xl w-full max-w-4xl max-h-[88vh]
                   flex flex-col animate-scale-in overflow-hidden
                   shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)]"
      >

        <div className="flex items-center gap-3 px-5 py-3 bg-secondary/30 border-b border-border/50 shrink-0">
          <Diff size={14} className="text-muted-foreground/60 shrink-0" />
          <span className="text-sm font-semibold font-mono text-foreground/80" title={full}>
            {format(new Date(snap.createdAt), 'HH:mm:ss')}
          </span>
          <span className="text-xs text-muted-foreground/50">{ago}</span>
          <SourceBadge source={snap.source} />
          <span className={`text-xs font-mono ${
            snap.deltaBytes > 0 ? 'text-emerald-400' : snap.deltaBytes < 0 ? 'text-red-400' : 'text-muted-foreground/50'
          }`}>
            {fmtDelta(snap.deltaBytes)}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {added   > 0 && <span className="text-emerald-400 font-mono text-xs">+{added}</span>}
            {removed > 0 && <span className="text-red-400 font-mono text-xs">−{removed}</span>}
            <span className="text-[10px] text-muted-foreground/40 border-l border-border/40 pl-2.5">
              vs current · {diff.lines.length} lines
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground/60 hover:text-foreground transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>


        <div className="flex-1 overflow-auto p-4 bg-background/30">
          <DiffViewer diff={diff} maxLines={99_999} sizeAfter={snap.sizeBytes} />
        </div>
      </div>
    </div>,
    document.body,
  );
}


interface RowProps {
  snap: Snapshot;
  isCurrent: boolean;
  isLast: boolean;
  onRewindClick: (snap: Snapshot) => void;
  dimmed?: boolean;
}

function SnapshotRow({ snap, isCurrent, isLast, onRewindClick, dimmed = false }: RowProps) {
  const [showPopup, setShowPopup]   = useState(false);
  const [fetchDiff, setFetchDiff]   = useState(false);
  const [fullDiffOpen, setFullDiff] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: diff } = useDiff(fetchDiff ? snap.id : undefined, true);
  const setNote = useSetSnapshotNote();
  const { menu, open: openCtx, close } = useContextMenu();

  const ago      = formatDistanceToNow(new Date(snap.createdAt), { addSuffix: true });
  const full     = format(new Date(snap.createdAt), 'MMM d, HH:mm:ss');
  const timeOnly = format(new Date(snap.createdAt), 'HH:mm:ss');

  function startShow() {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setFetchDiff(true);
    if (!showPopup) showTimer.current = setTimeout(() => setShowPopup(true), 120);
  }

  function startHide() {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    hideTimer.current = setTimeout(() => setShowPopup(false), 320);
  }

  useEffect(() => () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const hasDiff = diff && !diff.is_binary && !diff.too_large && diff.lines.length > 0;
  const added   = hasDiff ? diff!.lines.filter((l) => l.kind === 'insert').length : 0;
  const removed = hasDiff ? diff!.lines.filter((l) => l.kind === 'delete').length : 0;
  const PREVIEW_LINES = 60;

  return (
    <>
      <div
        className={`relative flex gap-3 transition-opacity duration-200 ${dimmed ? 'opacity-30' : 'opacity-100'}`}
        onMouseEnter={startShow}
        onMouseLeave={startHide}
        onContextMenu={(e) => openCtx(e, [
          { label: 'Rewind to this version', icon: <RotateCcw size={12} />, onClick: () => onRewindClick(snap) },
          { label: hasDiff ? 'Open full diff' : 'View diff', icon: <Diff size={12} />,
            onClick: () => { setFetchDiff(true); setFullDiff(true); },
            separator: true,
          },
        ])}
      >

        <div className="flex flex-col items-center shrink-0 pt-2.5">
          <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all duration-150 shrink-0 z-10 ${
            isCurrent
              ? 'bg-primary border-primary shadow-[0_0_8px_hsl(217_91%_60%/0.5)]'
              : 'bg-card border-muted-foreground/40'
          }`} />
          {!isLast && <div className="w-px flex-1 mt-0.5 bg-border/60 min-h-[1rem]" />}
        </div>


        <div className={`group flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm mb-0.5 transition-all duration-150
          ${isCurrent
            ? 'bg-primary/8 border border-primary/20'
            : 'hover:bg-secondary/40 border border-transparent hover:border-border/50'
          }`}
        >
          <span className="text-muted-foreground/70 text-xs font-mono w-18 shrink-0" title={full}>{timeOnly}</span>
          <span className="text-muted-foreground/50 text-xs w-24 shrink-0 truncate">{ago}</span>
          <span className={`text-xs font-mono w-14 shrink-0 ${
            snap.deltaBytes > 0 ? 'text-emerald-400' : snap.deltaBytes < 0 ? 'text-red-400' : 'text-muted-foreground/50'
          }`}>{fmtDelta(snap.deltaBytes)}</span>
          <span className="text-xs text-muted-foreground/50 w-14 shrink-0">{fmtSize(snap.sizeBytes)}</span>
          <SourceBadge source={snap.source} />

          <span onClick={(e) => e.stopPropagation()}>
            <NoteEditor
              initialNote={snap.note}
              onSave={(note) => setNote.mutate({ id: snap.id, note })}
              placeholder="Note about this snapshot…"
            />
          </span>

          {snap.note && (
            <span className="text-[10px] text-amber-400/60 max-w-[120px] truncate font-mono hidden group-hover:inline">
              {snap.note}
            </span>
          )}

          {isCurrent ? (
            <span className="ml-auto text-[10px] text-primary font-semibold tracking-wide uppercase shrink-0">current</span>
          ) : (
            <button
              onClick={() => onRewindClick(snap)}
              className="ml-auto opacity-0 group-hover:opacity-100 flex items-center gap-1.5 text-xs
                         px-2.5 py-1 rounded-md bg-primary/15 hover:bg-primary/30 text-primary
                         border border-primary/20 hover:border-primary/40 shrink-0 transition-all"
            >
              <RotateCcw size={10} />Rewind
            </button>
          )}
        </div>


        {showPopup && hasDiff && (
          <div
            className="absolute left-10 top-full z-20 mt-2 animate-scale-in"
            style={{ width: 680 }}
            onMouseEnter={startShow}
            onMouseLeave={startHide}
          >
            <div className="rounded-xl border border-border/60 overflow-hidden
                           shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)]
                           bg-card/98 backdrop-blur-sm">

              <div className="flex items-center gap-3 px-4 py-2.5 bg-secondary/30 border-b border-border/50">
                <Diff size={13} className="text-muted-foreground/60 shrink-0" />
                <span className="text-xs font-semibold font-mono text-foreground/80" title={full}>{timeOnly}</span>
                <span className="text-muted-foreground/40 text-xs">{ago}</span>
                <SourceBadge source={snap.source} />
                <span className={`text-xs font-mono ml-auto ${
                  snap.deltaBytes > 0 ? 'text-emerald-400' : snap.deltaBytes < 0 ? 'text-red-400' : 'text-muted-foreground/50'
                }`}>{fmtDelta(snap.deltaBytes)}</span>
                <div className="flex items-center gap-2 shrink-0 border-l border-border/40 pl-3">
                  {added   > 0 && <span className="text-emerald-400 font-mono text-xs">+{added}</span>}
                  {removed > 0 && <span className="text-red-400 font-mono text-xs">−{removed}</span>}
                  <span className="text-[10px] text-muted-foreground/40">vs current</span>
                </div>
              </div>


              <div className="max-h-64 overflow-y-auto overflow-x-auto">
                <table className="font-mono text-[11px] border-collapse w-full">
                  <tbody>
                    {diff!.lines.slice(0, PREVIEW_LINES).map((line, i) => {
                      const isIns = line.kind === 'insert';
                      const isDel = line.kind === 'delete';
                      const bg = isIns ? 'bg-emerald-950/40' : isDel ? 'bg-red-950/40' : '';
                      const fg = isIns ? 'text-emerald-300' : isDel ? 'text-red-300' : 'text-muted-foreground/55';
                      const prefix = isIns ? '+' : isDel ? '−' : ' ';

                      const lineNum = line.new_lineno ?? line.old_lineno ?? '';
                      return (
                        <tr key={i} className={`leading-5 ${bg}`}>
                          <td className="pl-3 pr-3 select-none text-muted-foreground/25 w-10 text-right tabular-nums shrink-0">
                            {lineNum}
                          </td>
                          <td className={`px-1 select-none w-4 font-bold opacity-60 ${fg}`}>{prefix}</td>
                          <td className={`pr-6 whitespace-pre ${fg}`}>{line.content}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>


              {diff!.lines.length > PREVIEW_LINES && (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/50 bg-secondary/20">
                  <span className="text-[10px] text-muted-foreground/40">
                    showing {PREVIEW_LINES} of {diff!.lines.length} lines
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowPopup(false); setFullDiff(true); }}
                    className="flex items-center gap-1.5 text-[11px] text-primary/70 hover:text-primary
                               transition-colors px-2 py-0.5 rounded hover:bg-primary/10"
                  >
                    <Maximize2 size={10} />Full diff
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>


      {fullDiffOpen && diff && (
        <DiffModal snap={snap} diff={diff} onClose={() => setFullDiff(false)} />
      )}
      {menu && <ContextMenu {...menu} onClose={close} />}
    </>
  );
}


type TimePreset = '1h' | '1d' | '1w' | 'all';

export function Timeline({ snapshots, fileName, noteFilter = '' }: Props) {
  const [rewindTarget, setRewindTarget] = useState<Snapshot | null>(null);
  const [timeFilter, setTimeFilter] = useState<TimePreset>('all');
  const { data: rewindDiff } = useDiff(rewindTarget?.id, true);
  const rewind = useRewind();

  const filteredSnapshots = useMemo(() => {
    if (timeFilter === 'all') return snapshots;
    const cutoffs: Record<TimePreset, number> = {
      '1h': Date.now() - 60 * 60 * 1000,
      '1d': Date.now() - 24 * 60 * 60 * 1000,
      '1w': Date.now() - 7 * 24 * 60 * 60 * 1000,
      'all': 0,
    };
    return snapshots.filter((s) => s.createdAt >= cutoffs[timeFilter]);
  }, [snapshots, timeFilter]);

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-4 text-muted-foreground/50">
        <GitCommit size={13} />
        <p className="text-xs">
          No snapshots yet for <span className="font-mono text-foreground/60">{fileName}</span>.
        </p>
      </div>
    );
  }

  const active = noteFilter.trim().toLowerCase();
  const matchSet = active
    ? new Set(filteredSnapshots.filter((s) => s.note?.toLowerCase().includes(active)).map((s) => s.id))
    : null;
  const matchCount = matchSet?.size ?? 0;

  return (
    <div className="px-3 py-2">

      <div className="flex items-center gap-1 pl-6 mb-2">
        {(['1h', '1d', '1w', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTimeFilter(t)}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              timeFilter === t
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground/50 hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
        {timeFilter !== 'all' && (
          <span className="text-[10px] text-muted-foreground/40 ml-1">
            {filteredSnapshots.length} of {snapshots.length}
          </span>
        )}
      </div>

      {filteredSnapshots.length === 0 && timeFilter !== 'all' && (
        <div className="flex items-center gap-2 px-6 py-3 text-muted-foreground/40">
          <p className="text-xs">No snapshots in the last {timeFilter}</p>
        </div>
      )}


      <div className="flex items-center gap-3 pl-6 pr-3 mb-1.5">
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider w-18 shrink-0">Time</span>
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider w-24 shrink-0">When</span>
        <div className="flex items-center gap-0.5 w-14 shrink-0">
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Change</span>
          <InfoTooltip
            placement="bottom"
            title="Size change (delta)"
            body={<><strong className="text-foreground/80">Green (+)</strong> = file grew vs previous snapshot.<br /><strong className="text-foreground/80">Red (−)</strong> = file shrank.</>}
            iconSize={11}
          />
        </div>
        <div className="flex items-center gap-0.5 w-14 shrink-0">
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Size</span>
          <InfoTooltip
            placement="bottom"
            title="File size"
            body="The full size of the file at this exact point in time."
            iconSize={11}
          />
        </div>
        <div className="flex items-center gap-0.5 flex-1">
          <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">Source</span>
          <InfoTooltip
            placement="bottom"
            title="Snapshot source"
            body={
              <div className="space-y-1.5">
                <p><code className="font-mono bg-secondary px-1 rounded text-blue-400">change</code> — triggered by a file save</p>
                <p><code className="font-mono bg-secondary px-1 rounded text-purple-400">interval</code> — triggered on a schedule</p>
                <p><code className="font-mono bg-secondary px-1 rounded text-yellow-400">manual</code> — you triggered it manually</p>
                <p><code className="font-mono bg-secondary px-1 rounded text-orange-400">pre-rewind</code> — auto-saved before a rewind</p>
              </div>
            }
            iconSize={11}
          />
        </div>
      </div>

      {active && (
        <div className="pl-6 pr-3 mb-2">
          <span className="text-[10px] text-amber-400/60">
            {matchCount === 0
              ? 'No snapshots have notes matching this search'
              : `${matchCount} of ${snapshots.length} snapshot${snapshots.length !== 1 ? 's' : ''} match`}
          </span>
        </div>
      )}

      {filteredSnapshots.map((snap, idx) => (
        <SnapshotRow
          key={snap.id}
          snap={snap}
          isCurrent={idx === 0}
          isLast={idx === filteredSnapshots.length - 1}
          onRewindClick={setRewindTarget}
          dimmed={matchSet != null && !matchSet.has(snap.id)}
        />
      ))}

      {rewindTarget && (
        <RewindDialog
          snapshot={rewindTarget}
          diff={rewindDiff}
          isPending={rewind.isPending}
          onCancel={() => setRewindTarget(null)}
          onConfirm={(autoSave) => {
            rewind.mutate(
              { snapshotId: rewindTarget.id, autoSaveCurrent: autoSave },
              { onSuccess: () => setRewindTarget(null) },
            );
          }}
        />
      )}
    </div>
  );
}
