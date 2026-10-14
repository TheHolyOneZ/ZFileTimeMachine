import { createPortal } from 'react-dom';
import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { RotateCcw, AlertTriangle, Loader2, X, Diff } from 'lucide-react';
import type { Snapshot, DiffResult } from '@/lib/types';
import { DiffViewer } from './DiffViewer';

interface Props {
  snapshot: Snapshot;
  diff: DiffResult | undefined;
  onConfirm: (autoSave: boolean) => void;
  onCancel: () => void;
  isPending: boolean;
}

function fmtDelta(n: number): string {
  if (n === 0) return '±0';
  const sign = n > 0 ? '+' : '';
  const abs = Math.abs(n);
  if (abs < 1024) return `${sign}${n}B`;
  if (abs < 1024 * 1024) return `${sign}${(n / 1024).toFixed(1)}KB`;
  return `${sign}${(n / 1024 / 1024).toFixed(1)}MB`;
}

const SOURCE_STYLES: Record<string, string> = {
  change:       'bg-blue-500/15 text-blue-400 border-blue-500/20',
  interval:     'bg-purple-500/15 text-purple-400 border-purple-500/20',
  manual:       'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'pre-rewind': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
};

export function RewindDialog({ snapshot, diff, onConfirm, onCancel, isPending }: Props) {
  const [autoSave, setAutoSave] = useState(true);

  const ago  = formatDistanceToNow(new Date(snapshot.createdAt), { addSuffix: true });
  const full = format(new Date(snapshot.createdAt), 'MMM d, yyyy · HH:mm:ss');
  const timeOnly = format(new Date(snapshot.createdAt), 'HH:mm:ss');
  const src = SOURCE_STYLES[snapshot.source] ?? 'bg-secondary text-muted-foreground border-border';

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && !isPending && onCancel()}
    >
      <div className="bg-popover border border-border/60 rounded-xl w-full max-w-2xl max-h-[88vh]
                      flex flex-col animate-scale-in overflow-hidden
                      shadow-overlay">


        <div className="flex items-center gap-3 px-5 py-3.5 bg-secondary/30 border-b border-border/50 shrink-0">
          <Diff size={14} className="text-muted-foreground/60 shrink-0" />
          <span className="text-sm font-semibold font-mono text-foreground/80" title={full}>{timeOnly}</span>
          <span className="text-xs text-muted-foreground/50">{ago}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${src}`}>
            {snapshot.source}
          </span>
          <span className={`text-xs font-mono ${
            snapshot.deltaBytes > 0 ? 'text-emerald-400' : snapshot.deltaBytes < 0 ? 'text-red-400' : 'text-muted-foreground/50'
          }`}>
            {fmtDelta(snapshot.deltaBytes)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <RotateCcw size={13} className="text-primary/70" />
            <span className="text-sm font-semibold text-foreground">Rewind file</span>
          </div>
          <button
            onClick={onCancel}
            disabled={isPending}
            className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary
                       disabled:opacity-30 transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>


        <div className="flex-1 overflow-auto p-5 space-y-4 bg-background/20">

          <div className="flex gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3.5">
            <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80 leading-relaxed">
              This will replace the current file with this snapshot version.
              The change cannot be undone unless auto-save is enabled below.
            </p>
          </div>


          {diff && <DiffViewer diff={diff} />}


          <label className="flex items-center gap-3 cursor-pointer group select-none
                            p-3.5 rounded-xl border border-border/40 hover:border-border/70
                            bg-secondary/20 hover:bg-secondary/30 transition-all">
            <div className="relative shrink-0">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-[18px] rounded-full border border-border bg-secondary
                              peer-checked:bg-primary peer-checked:border-primary transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-foreground/60
                              peer-checked:translate-x-3.5 peer-checked:bg-white
                              transition-transform shadow-sm" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Auto-save current state first</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Creates a <span className="text-orange-400/80 font-mono">pre-rewind</span> snapshot so you can undo this action
              </p>
            </div>
          </label>
        </div>


        <div className="flex gap-2.5 justify-end px-5 py-4 border-t border-border/50 bg-secondary/20 shrink-0">
          <button
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg border border-border/60 hover:bg-secondary
                       text-foreground/70 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(autoSave)}
            disabled={isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground shadow-button
                       hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={13} className="animate-spin-slow" /> : <RotateCcw size={13} />}
            {isPending ? 'Rewinding…' : 'Rewind to this version'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
