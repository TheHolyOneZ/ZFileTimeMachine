import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { onScanProgress } from '@/lib/events';
import type { ScanProgressPayload } from '@/lib/types';

interface Props {
  folderId: number;
}


export function ScanProgress({ folderId }: Props) {
  const [progress, setProgress] = useState<ScanProgressPayload | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    onScanProgress((p) => {
      if (p.folder_id !== folderId) return;
      setProgress(p);

      if (p.total > 0 && p.scanned >= p.total) {
        setTimeout(() => setProgress(null), 1500);
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [folderId]);

  if (!progress || (progress.total > 0 && progress.scanned >= progress.total && !progress)) {
    return null;
  }

  const pct = progress.total > 0 ? Math.round((progress.scanned / progress.total) * 100) : 0;

  return (
    <div className="px-6 py-3 border-b border-border bg-card/50">
      <div className="flex items-center gap-3">
        <Loader2 size={14} className="text-primary animate-spin shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Scanning…</span>
            <span className="text-muted-foreground tabular-nums">
              {progress.scanned.toLocaleString()} / {progress.total.toLocaleString()}
            </span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
          {pct}%
        </span>
      </div>
    </div>
  );
}
