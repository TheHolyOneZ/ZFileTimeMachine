import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { onScanProgress } from '@/lib/events';
import type { ScanProgressPayload } from '@/lib/types';
import { Spinner } from './ui/Spinner';
import { gsap, dur } from '@/lib/motion';

export function ScanProgress({ folderId }: { folderId: number }) {
  const [progress, setProgress] = useState<ScanProgressPayload | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onScanProgress((p) => {
      if (p.folder_id !== folderId) return;
      setProgress(p);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (p.total > 0 && p.scanned >= p.total) hideTimer.current = setTimeout(() => setProgress(null), 1400);
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => {
      cancelled = true;
      unlisten?.();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [folderId]);

  const pct = progress && progress.total > 0 ? Math.min(100, (progress.scanned / progress.total) * 100) : 0;

  useLayoutEffect(() => {
    if (barRef.current) gsap.to(barRef.current, { scaleX: pct / 100, duration: dur(0.4), ease: 'zftm' });
  }, [pct]);

  if (!progress) return null;
  const done = progress.total > 0 && progress.scanned >= progress.total;

  return (
    <div className="shrink-0 flex items-center gap-3 px-6 pb-3 animate-fade-in" role="status">
      {done ? <span className="w-3.5 h-3.5 rounded-full bg-positive/20 grid place-items-center"><span className="w-1.5 h-1.5 rounded-full bg-positive" /></span> : <Spinner size={14} className="text-primary" />}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {done ? 'First versions saved' : 'Saving first versions'}
      </span>
      <div className="flex-1 h-1 rounded-full bg-foreground/[0.07] overflow-hidden">
        <div ref={barRef} className="h-full w-full origin-left rounded-full bg-primary" style={{ transform: 'scaleX(0)' }} />
      </div>
      <span className="text-xs text-faint tabular-nums whitespace-nowrap">
        {progress.scanned.toLocaleString()} of {progress.total.toLocaleString()}
      </span>
    </div>
  );
}
