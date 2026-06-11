import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Props {
  fileCount: number;
  totalBytes: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function RecoverConfirmDialog({ fileCount, totalBytes, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const ready = typed === 'RESTORE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl p-6 animate-fade-in">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={14} />
        </button>

        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-red-500/12 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">Restore in place</h2>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              This will overwrite <strong className="text-foreground/80">{fileCount} file{fileCount !== 1 ? 's' : ''}</strong>{' '}
              ({formatBytes(totalBytes)}) with their snapshot versions.
              A <code className="text-xs bg-secondary/60 px-1 py-0.5 rounded">pre-rewind</code> snapshot will be
              created for each file before overwriting.
            </p>
          </div>
        </div>

        <div className="bg-red-500/6 border border-red-500/15 rounded-xl p-3.5 mb-5">
          <p className="text-xs text-red-400/80 leading-relaxed">
            Current file contents will be permanently replaced. The pre-rewind snapshots
            can be used to undo this action from the file timeline.
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs text-muted-foreground mb-2">
            Type <span className="font-mono font-bold text-foreground/80">RESTORE</span> to confirm
          </label>
          <input
            autoFocus
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && ready) onConfirm(); }}
            placeholder="RESTORE"
            className="w-full px-3 py-2 rounded-lg bg-secondary/40 border border-border/60
                       text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring
                       placeholder:text-muted-foreground/30"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm border border-border/50 bg-secondary/30
                       text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!ready}
            className="px-4 py-2 rounded-lg text-sm font-medium
                       bg-red-500 text-white hover:bg-red-600
                       disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            Restore {fileCount} file{fileCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
