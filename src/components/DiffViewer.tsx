import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Binary, Maximize2, Search, X, ChevronUp, ChevronDown, AlertCircle, Diff } from 'lucide-react';
import type { DiffResult } from '@/lib/types';

interface Props {
  diff: DiffResult;
  maxLines?: number;
  sizeBefore?: number;
  sizeAfter?: number;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(2)}MB`;
}

export function DiffViewer({ diff, maxLines = 400, sizeBefore, sizeAfter }: Props) {
  const [findOpen, setFindOpen]   = useState(false);
  const [query, setQuery]         = useState('');
  const [useRegex, setUseRegex]   = useState(false);
  const [matchIdx, setMatchIdx]   = useState(0);
  const [regexError, setRegexError] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const rowRefs   = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape') { setFindOpen(false); setQuery(''); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (findOpen) setTimeout(() => inputRef.current?.focus(), 30);
  }, [findOpen]);

  const re = useMemo(() => {
    if (!query) { setRegexError(false); return null; }
    try {
      const r = new RegExp(useRegex ? query : escapeRegex(query), 'gi');
      setRegexError(false);
      return r;
    } catch {
      setRegexError(true);
      return null;
    }
  }, [query, useRegex]);

  const matchingLines = useMemo(() => {
    if (!re) return [];
    return diff.lines
      .slice(0, maxLines)
      .map((l, i) => (re.test(l.content) ? i : -1))
      .filter((i) => i !== -1);
  }, [re, diff.lines, maxLines]);

  const clampedIdx = matchingLines.length > 0 ? matchIdx % matchingLines.length : 0;

  const scrollToMatch = useCallback((idx: number) => {
    const lineIdx = matchingLines[idx];
    if (lineIdx == null) return;
    rowRefs.current.get(lineIdx)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [matchingLines]);

  function nextMatch() {
    const next = (clampedIdx + 1) % matchingLines.length;
    setMatchIdx(next);
    scrollToMatch(next);
  }
  function prevMatch() {
    const prev = (clampedIdx - 1 + matchingLines.length) % matchingLines.length;
    setMatchIdx(prev);
    scrollToMatch(prev);
  }

  useEffect(() => { setMatchIdx(0); scrollToMatch(0); }, [query, useRegex, scrollToMatch]);

  function highlight(content: string) {
    if (!re || !query) return <>{content}</>;
    re.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      parts.push(
        <mark key={m.index} className="bg-yellow-400/40 text-yellow-200 rounded-sm">{m[0]}</mark>,
      );
      last = m.index + m[0].length;
      if (m[0].length === 0) { re.lastIndex++; break; }
    }
    if (last < content.length) parts.push(content.slice(last));
    return <>{parts}</>;
  }

  if (diff.is_binary) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground/60">
        <Binary size={13} className="shrink-0" />
        <span>Binary file</span>
        {sizeBefore != null && sizeAfter != null && (
          <span className="font-mono">
            {fmtSize(sizeBefore)} → {fmtSize(sizeAfter)}
            <span className={sizeAfter > sizeBefore ? 'text-emerald-400' : sizeAfter < sizeBefore ? 'text-red-400' : ''}>
              {' '}({sizeAfter > sizeBefore ? '+' : ''}{fmtSize(sizeAfter - sizeBefore)})
            </span>
          </span>
        )}
      </div>
    );
  }
  if (diff.too_large) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground italic p-3 rounded-xl
                      bg-secondary/30 border border-border/50">
        <Maximize2 size={13} />File too large to diff inline
      </div>
    );
  }
  if (diff.lines.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic p-3 rounded-xl bg-secondary/30 border border-border/50">
        No changes between this snapshot and current
      </p>
    );
  }

  const added   = diff.lines.filter((l) => l.kind === 'insert').length;
  const removed = diff.lines.filter((l) => l.kind === 'delete').length;
  const lines   = diff.lines.slice(0, maxLines);

  return (
    <div className="rounded-xl border border-border/60 overflow-hidden bg-popover backdrop-blur-sm
                    shadow-[0_4px_24px_rgba(0,0,0,0.3),0_0_0_1px_rgba(255,255,255,0.03)]">


      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border/50 bg-secondary/30">
        <Diff size={12} className="text-muted-foreground/50 shrink-0" />
        {added   > 0 && <span className="text-emerald-400 font-mono text-xs font-semibold">+{added}</span>}
        {removed > 0 && <span className="text-red-400 font-mono text-xs font-semibold">−{removed}</span>}
        {added === 0 && removed === 0 && (
          <span className="text-muted-foreground/70 font-mono text-xs">±0</span>
        )}

        <div className="flex-1" />


        {!findOpen ? (
          <button
            onClick={() => setFindOpen(true)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-foreground
                       transition-colors px-1.5 py-0.5 rounded hover:bg-secondary"
            title="Find (Ctrl+F)"
          >
            <Search size={11} />Find
          </button>
        ) : (
          <div className="flex items-center gap-1.5 animate-fade-in">
            <div className={`flex items-center gap-1.5 bg-secondary/60 border rounded-lg px-2 py-1 ${
              regexError ? 'border-red-500/50' : 'border-border/60'
            }`}>
              {regexError && <AlertCircle size={11} className="text-red-400 shrink-0" />}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.shiftKey ? prevMatch() : nextMatch();
                }}
                placeholder="Find in diff…"
                className="bg-transparent text-xs w-40 focus:outline-none placeholder:text-muted-foreground/60"
              />
              <button
                onClick={() => setUseRegex((v) => !v)}
                className={`text-[10px] font-mono px-1 py-px rounded transition-colors ${
                  useRegex ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:text-foreground'
                }`}
                title="Toggle regex"
              >.*</button>
            </div>
            {matchingLines.length > 0 && (
              <span className="text-[10px] text-muted-foreground/50 tabular-nums whitespace-nowrap">
                {clampedIdx + 1}/{matchingLines.length}
              </span>
            )}
            {query && matchingLines.length === 0 && !regexError && (
              <span className="text-[10px] text-muted-foreground/70">no matches</span>
            )}
            <button onClick={prevMatch} disabled={matchingLines.length === 0}
              className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronUp size={13} />
            </button>
            <button onClick={nextMatch} disabled={matchingLines.length === 0}
              className="p-0.5 text-muted-foreground/50 hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronDown size={13} />
            </button>
            <button onClick={() => { setFindOpen(false); setQuery(''); }}
              className="p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors">
              <X size={12} />
            </button>
          </div>
        )}
      </div>


      <div className="max-h-72 overflow-y-auto overflow-x-hidden">
        <div className="overflow-x-auto pb-2">
          <table className="font-mono text-xs border-collapse min-w-full">
            <tbody>
              {lines.map((line, i) => {
                const isMatch  = re && matchingLines.includes(i);
                const isActive = isMatch && matchingLines[clampedIdx] === i;
                const isIns = line.kind === 'insert';
                const isDel = line.kind === 'delete';
                const bg =
                  isActive  ? 'bg-yellow-500/20'
                  : isIns   ? 'bg-emerald-950/40'
                  : isDel   ? 'bg-red-950/40'
                  : '';
                const fg = isIns ? 'text-emerald-300' : isDel ? 'text-red-300' : 'text-muted-foreground';
                const prefix = isIns ? '+' : isDel ? '−' : ' ';
                const lineNum = line.new_lineno ?? line.old_lineno ?? '';
                return (
                  <tr
                    key={i}
                    ref={(el) => { if (el) rowRefs.current.set(i, el); else rowRefs.current.delete(i); }}
                    className={`leading-5 ${bg} ${isMatch && !isActive ? 'outline outline-1 outline-yellow-500/20' : ''}`}
                  >
                    <td className="pl-3 pr-3 select-none text-muted-foreground/50 w-10 text-right tabular-nums">
                      {lineNum}
                    </td>
                    <td className={`px-1 select-none w-4 font-bold opacity-55 ${fg}`}>{prefix}</td>
                    <td className={`pr-6 whitespace-pre ${fg}`}>{highlight(line.content)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {diff.lines.length > maxLines && (
        <p className="text-xs text-muted-foreground/70 px-4 py-1.5 border-t border-border/50 bg-secondary/20">
          +{diff.lines.length - maxLines} more lines
        </p>
      )}
    </div>
  );
}
