import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  FlaskConical, Play, Loader2, CheckCircle2, XCircle,
  Settings2, HardDrive, FileText, Filter, Package, History, Timer, FolderTree, Activity,
} from 'lucide-react';
import { runQaSuite } from '@/lib/tauri';
import type { QaTestResult } from '@/lib/types';

interface QaProgress {
  index: number;
  total: number;
  result: QaTestResult;
}

const TEST_ICONS: Record<string, React.ReactNode> = {
  global_settings: <Settings2 size={11} />,
  binary_detect:   <HardDrive size={11} />,
  binary_cap:      <HardDrive size={11} />,
  text_cap:        <FileText size={11} />,
  ignore_rules:    <Filter size={11} />,
  zstd_compress:   <Package size={11} />,
  retention:       <History size={11} />,
  min_interval:    <Timer size={11} />,
  max_depth:       <FolderTree size={11} />,
  debounce:        <Activity size={11} />,
};

function ResultRow({ result, animate }: { result: QaTestResult; animate: boolean }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg bg-secondary/20 border border-border/30
                  ${animate ? 'animate-fade-in' : ''}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${result.passed ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <span className="shrink-0 text-muted-foreground/50">
        {TEST_ICONS[result.id] ?? null}
      </span>
      <span className="text-xs font-medium text-foreground/85 shrink-0">{result.name}</span>
      <span className="text-xs text-muted-foreground/50 truncate flex-1 min-w-0">{result.message}</span>
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-secondary/60 border border-border/30 text-muted-foreground/60 shrink-0">
        {result.duration_ms}ms
      </span>
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

  if (!running && !done) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6 p-10 text-center">
        <FlaskConical size={48} className="text-primary/30" />
        <div className="space-y-1.5 max-w-sm">
          <h2 className="text-sm font-semibold text-foreground">QA Test Suite</h2>
          <p className="text-xs text-muted-foreground/60 leading-relaxed">
            Verifies that all major settings are enforced correctly.
            Tests: binary detection, size caps, ignore rules, compression,
            retention, snapshot intervals, folder depth, and watcher debounce.
          </p>
        </div>
        <button
          onClick={() => void start()}
          className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-primary text-primary-foreground
                     hover:bg-primary/90 shadow-[0_0_16px_rgba(var(--primary-rgb),0.25)]
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all"
        >
          <Play size={14} />
          Run QA Suite
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="flex items-center gap-2.5 mb-1">
        <FlaskConical size={15} className="text-primary/70" />
        <h2 className="text-sm font-semibold text-foreground">QA Test Suite</h2>
      </div>
      <p className="text-xs text-muted-foreground/60 mb-5">
        Verifies that all settings are correctly enforced against real files and snapshots.
      </p>

      {done && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-4 text-xs
            ${allPassed
              ? 'bg-emerald-500/8 border-emerald-500/20'
              : 'bg-red-500/8 border-red-500/20'
            }`}
        >
          {allPassed
            ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            : <XCircle size={14} className="text-red-400 shrink-0" />
          }
          <span className={`font-medium ${allPassed ? 'text-emerald-400' : 'text-red-400'}`}>
            {passed}/{total} tests passed
          </span>
          <span className="text-muted-foreground/50 ml-auto">completed in {totalMs}ms</span>
          <button
            onClick={() => void start()}
            className="px-3 py-1 rounded-lg border border-border/50 bg-secondary/40 hover:bg-secondary
                       text-foreground/70 hover:text-foreground transition-colors text-xs"
          >
            Run Again
          </button>
        </div>
      )}

      <div className="space-y-1.5">
        {results.map((r, i) => (
          <ResultRow key={r.id} result={r} animate={running && i === results.length - 1} />
        ))}
      </div>

      {running && (
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/50">
          <Loader2 size={12} className="animate-spin" />
          {progressInfo
            ? `Running test ${progressInfo.index + 1}/${progressInfo.total}…`
            : 'Starting…'
          }
        </div>
      )}
    </div>
  );
}
