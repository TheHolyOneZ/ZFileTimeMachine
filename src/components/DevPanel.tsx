import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  FlaskConical, Play, CheckCircle2, XCircle, RotateCcw,
  Settings2, HardDrive, FileText, Filter, Package, History, Timer, FolderTree, Activity,
} from 'lucide-react';
import { runQaSuite } from '@/lib/tauri';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import type { QaTestResult } from '@/lib/types';

interface QaProgress {
  index: number;
  total: number;
  result: QaTestResult;
}

const TEST_ICONS: Record<string, React.ReactNode> = {
  global_settings: <Settings2 size={13} />,
  binary_detect: <HardDrive size={13} />,
  binary_cap: <HardDrive size={13} />,
  text_cap: <FileText size={13} />,
  ignore_rules: <Filter size={13} />,
  zstd_compress: <Package size={13} />,
  retention: <History size={13} />,
  min_interval: <Timer size={13} />,
  max_depth: <FolderTree size={13} />,
  debounce: <Activity size={13} />,
};

function ResultRow({ result, animate }: { result: QaTestResult; animate: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 h-11 ${animate ? 'animate-fade-in' : ''}`}>
      {result.passed ? <CheckCircle2 size={15} className="text-positive shrink-0" /> : <XCircle size={15} className="text-negative shrink-0" />}
      <span className="text-faint shrink-0">{TEST_ICONS[result.id] ?? null}</span>
      <span className="text-sm shrink-0">{result.name}</span>
      <span className="text-xs text-muted-foreground truncate flex-1 min-w-0" title={result.message}>{result.message}</span>
      <span className="text-2xs text-faint tabular-nums shrink-0">{result.duration_ms} ms</span>
    </div>
  );
}

export function DevPanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<QaTestResult[]>([]);
  const [done, setDone] = useState(false);
  const [progressInfo, setProgressInfo] = useState<{ index: number; total: number } | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      unlistenRef.current?.();
    };
  }, []);

  async function start() {
    unlistenRef.current?.();
    setResults([]);
    setDone(false);
    setProgressInfo(null);
    setRunning(true);

    const unlisten = await listen<QaProgress>('qa:progress', (event) => {
      const { index, total, result } = event.payload;
      setProgressInfo({ index, total });
      setResults((prev) => {
        if (prev.find((r) => r.id === result.id)) return prev;
        return [...prev, result];
      });
      if (index + 1 >= total) {
        setDone(true);
        setRunning(false);
      }
    });
    unlistenRef.current = unlisten;

    try {
      const all = await runQaSuite();
      setResults(all);
      setDone(true);
    } catch {
      setDone(true);
    } finally {
      setRunning(false);
      unlisten();
      unlistenRef.current = null;
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const totalMs = results.reduce((sum, r) => sum + r.duration_ms, 0);
  const allPassed = total > 0 && passed === total;

  return (
    <section data-group className="space-y-4">
      <div className="rounded-xl bg-card shadow-card p-5 flex items-start gap-4">
        <span className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.055] text-muted-foreground grid place-items-center shrink-0"><FlaskConical size={18} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Check that every setting works</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Runs each setting against real files in a temporary folder: binary detection, size limits, skip rules, compression,
            how long versions are kept, spacing between versions, subfolder depth and the wait after a save. Your folders are not touched.
          </p>
        </div>
        <Button
          variant={done ? 'secondary' : 'primary'}
          icon={done ? <RotateCcw size={14} /> : <Play size={14} />}
          loading={running}
          onClick={() => void start()}
        >
          {done ? 'Run again' : 'Run'}
        </Button>
      </div>

      {(running || done) && (
        <div className="rounded-xl bg-card shadow-card overflow-hidden">
          <div className="flex items-center gap-3 px-4 h-12 border-b border-[hsl(var(--line))]">
            {running ? <Spinner size={14} className="text-primary" /> : allPassed ? <CheckCircle2 size={15} className="text-positive" /> : <XCircle size={15} className="text-negative" />}
            <span className="text-sm font-medium flex-1">
              {running
                ? (progressInfo ? `Running ${progressInfo.index + 1} of ${progressInfo.total}` : 'Starting')
                : `${passed} of ${total} passed`}
            </span>
            {done && <span className="text-xs text-faint tabular-nums">{totalMs} ms</span>}
          </div>
          <div className="divide-y divide-[hsl(var(--line))]">
            {results.map((r, i) => <ResultRow key={r.id} result={r} animate={running && i === results.length - 1} />)}
          </div>
        </div>
      )}
    </section>
  );
}
