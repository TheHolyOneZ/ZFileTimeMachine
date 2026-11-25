import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Binary, Search, X, ChevronUp, ChevronDown, FileWarning, Equal, ChevronsUpDown } from 'lucide-react';
import type { DiffLine, DiffResult } from '@/lib/types';

interface Props {
  diff: DiffResult;
  maxLines?: number;
  sizeBefore?: number;
  sizeAfter?: number;
  fill?: boolean;
  context?: number;
  findShortcut?: boolean;
  emptyLabel?: string;
  whole?: boolean;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function fmtSize(n: number): string {
  const abs = Math.abs(n);
  if (abs < 1024) return `${n} B`;
  if (abs < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

type Row = { type: 'line'; line: DiffLine; index: number } | { type: 'fold'; start: number; end: number };

function buildRows(lines: DiffLine[], context: number, expanded: Set<number>): Row[] {
  const changed = lines.map((l) => l.kind !== 'equal');
  if (!changed.some(Boolean)) return lines.map((line, index) => ({ type: 'line', line, index }));
  const keep = new Array(lines.length).fill(false);
  changed.forEach((c, i) => {
    if (!c) return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = true;
  });
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    if (keep[i]) { rows.push({ type: 'line', line: lines[i], index: i }); i++; continue; }
    let j = i;
    while (j < lines.length && !keep[j]) j++;
    if (expanded.has(i) || j - i < 4) {
      for (let k = i; k < j; k++) rows.push({ type: 'line', line: lines[k], index: k });
    } else {
      rows.push({ type: 'fold', start: i, end: j });
    }
    i = j;
  }
  return rows;
}

export function DiffViewer({ diff, maxLines = 5000, sizeBefore, sizeAfter, fill, context = 3, findShortcut = true, emptyLabel, whole = false }: Props) {
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [matchIdx, setMatchIdx] = useState(0);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  useEffect(() => { setExpanded(new Set()); setShowAll(false); }, [diff]);

  useEffect(() => {
    if (!findShortcut) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [findShortcut]);

  const { re, regexError } = useMemo(() => {
    if (!query) return { re: null, regexError: false };
    try {
      return { re: new RegExp(useRegex ? query : escapeRegex(query), 'gi'), regexError: false };
    } catch {
      return { re: null, regexError: true };
    }
  }, [query, useRegex]);

  const lines = useMemo(() => diff.lines.slice(0, maxLines), [diff.lines, maxLines]);
  const rows = useMemo(
    () => (showAll || whole || re ? lines.map((line, index) => ({ type: 'line' as const, line, index })) : buildRows(lines, context, expanded)),
    [lines, context, expanded, showAll, whole, re],
  );

  const matchingLines = useMemo(() => {
    if (!re) return [];
    return lines.map((l, i) => { re.lastIndex = 0; return re.test(l.content) ? i : -1; }).filter((i) => i !== -1);
  }, [re, lines]);

  const clampedIdx = matchingLines.length > 0 ? matchIdx % matchingLines.length : 0;

  const scrollToMatch = useCallback((idx: number) => {
    const lineIdx = matchingLines[idx];
    if (lineIdx == null) return;
    rowRefs.current.get(lineIdx)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [matchingLines]);

  useEffect(() => { setMatchIdx(0); scrollToMatch(0); }, [query, useRegex, scrollToMatch]);

  function step(dir: 1 | -1) {
    if (!matchingLines.length) return;
    const next = (clampedIdx + dir + matchingLines.length) % matchingLines.length;
    setMatchIdx(next);
    scrollToMatch(next);
  }

  function highlight(content: string) {
    if (!re || !query) return content;
    re.lastIndex = 0;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      parts.push(<mark key={m.index} className="bg-caution/30 text-foreground rounded-[calc(3px*var(--rs))] px-px">{m[0]}</mark>);
      last = m.index + m[0].length;
      if (m[0].length === 0) { re.lastIndex++; break; }
    }
    if (last < content.length) parts.push(content.slice(last));
    return parts;
  }

  const shell = `rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] ${fill ? 'h-full' : ''}`;

  if (diff.is_binary) {
    return (
      <div className={`${shell} flex flex-col items-center justify-center gap-2 px-6 py-10 text-center`}>
        <Binary size={22} className="text-faint" />
        <p className="text-sm text-muted-foreground">This file isn't text, so there's no line-by-line comparison.</p>
        {sizeBefore != null && sizeAfter != null && (
          <p className="text-xs text-faint tabular-nums">
            {fmtSize(sizeBefore)} now, {fmtSize(sizeAfter)} in this version
          </p>
        )}
      </div>
    );
  }
  if (diff.too_large) {
    return (
      <div className={`${shell} flex flex-col items-center justify-center gap-2 px-6 py-10 text-center`}>
        <FileWarning size={22} className="text-faint" />
        <p className="text-sm text-muted-foreground">This file is too large to compare here (over 512 KB). You can still restore it.</p>
      </div>
    );
  }
  const allEqual = diff.lines.every((l) => l.kind === 'equal');
  if (diff.lines.length === 0 || (allEqual && !whole)) {
    return (
      <div className={`${shell} flex flex-col items-center justify-center gap-2 px-6 py-10 text-center`}>
        <Equal size={22} className="text-faint" />
        <p className="text-sm text-muted-foreground">{emptyLabel ?? 'This version is the same as the file on disk.'}</p>
      </div>
    );
  }

  const added = diff.lines.filter((l) => l.kind === 'insert').length;
  const removed = diff.lines.filter((l) => l.kind === 'delete').length;
  const hasFolds = rows.some((r) => r.type === 'fold');

  return (
    <div className={`${shell} flex flex-col overflow-hidden`}>
      <div className="flex items-center gap-3 h-9 px-3 shrink-0 border-b border-[hsl(var(--line))]">
        {allEqual ? (
          <span className="text-xs text-muted-foreground">{emptyLabel ?? 'Same as the file on disk'}</span>
        ) : (
          <>
            <span className="text-xs font-medium tabular-nums text-positive">+{added}</span>
            <span className="text-xs font-medium tabular-nums text-negative">−{removed}</span>
            <span className="text-2xs text-faint">lines</span>
          </>
        )}
        <div className="flex-1" />
        {hasFolds && !findOpen && (
          <button onClick={() => setShowAll(true)} className="press inline-flex items-center gap-1 h-6 px-2 rounded-[calc(6px*var(--rs))] text-2xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]">
            <ChevronsUpDown size={11} />Show whole file
          </button>
        )}
        {!findOpen ? (
          <button
            onClick={() => setFindOpen(true)}
            className="press inline-flex items-center gap-1 h-6 px-2 rounded-[calc(6px*var(--rs))] text-2xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
            data-tip="Find in this comparison"
          >
            <Search size={11} />Find
          </button>
        ) : (
          <div className="flex items-center gap-1 animate-fade-in">
            <div className={`flex items-center gap-1.5 h-6 rounded-[calc(6px*var(--rs))] pl-2 pr-1 bg-surface shadow-[inset_0_0_0_1px_hsl(var(--line))] ${regexError ? 'shadow-[inset_0_0_0_1px_hsl(var(--negative)/0.6)]' : ''}`}>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') step(e.shiftKey ? -1 : 1);
                  if (e.key === 'Escape') { e.stopPropagation(); setFindOpen(false); setQuery(''); }
                }}
                placeholder="Find"
                className="bg-transparent text-xs w-32 outline-none placeholder:text-faint"
              />
              <button
                onClick={() => setUseRegex((v) => !v)}
                className={`text-2xs font-mono px-1 rounded-[calc(4px*var(--rs))] ${useRegex ? 'bg-primary/20 text-primary' : 'text-faint hover:text-foreground'}`}
                data-tip="Regular expression"
              >.*</button>
            </div>
            <span className="text-2xs text-faint tabular-nums w-10 text-center">
              {query ? (matchingLines.length ? `${clampedIdx + 1}/${matchingLines.length}` : '0') : ''}
            </span>
            <button onClick={() => step(-1)} disabled={!matchingLines.length} className="w-6 h-6 grid place-items-center rounded-[calc(6px*var(--rs))] text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Previous match"><ChevronUp size={13} /></button>
            <button onClick={() => step(1)} disabled={!matchingLines.length} className="w-6 h-6 grid place-items-center rounded-[calc(6px*var(--rs))] text-muted-foreground hover:text-foreground disabled:opacity-30" aria-label="Next match"><ChevronDown size={13} /></button>
            <button onClick={() => { setFindOpen(false); setQuery(''); }} className="w-6 h-6 grid place-items-center rounded-[calc(6px*var(--rs))] text-muted-foreground hover:text-foreground" aria-label="Close find"><X size={12} /></button>
          </div>
        )}
      </div>

      <div className={`overflow-auto selectable ${fill ? 'flex-1 min-h-0' : 'max-h-80'}`}>
        <table className="font-mono text-[12px] leading-[20px] border-collapse min-w-full">
          <tbody>
            {rows.map((row) => {
              if (row.type === 'fold') {
                return (
                  <tr key={`fold-${row.start}`}>
                    <td colSpan={4} className="p-0">
                      <button
                        onClick={() => setExpanded((s) => new Set(s).add(row.start))}
                        className="w-full h-7 flex items-center gap-2 px-3 text-2xs font-sans text-faint hover:text-foreground bg-foreground/[0.025] hover:bg-foreground/[0.05]
                                   border-y border-[hsl(var(--line))]"
                      >
                        <ChevronsUpDown size={11} />
                        {row.end - row.start} unchanged lines
                      </button>
                    </td>
                  </tr>
                );
              }
              const { line, index } = row;
              const isMatch = re != null && matchingLines.includes(index);
              const isActive = isMatch && matchingLines[clampedIdx] === index;
              const isIns = line.kind === 'insert';
              const isDel = line.kind === 'delete';
              const bg = isActive ? 'bg-caution/20' : isIns ? 'bg-positive/[0.09]' : isDel ? 'bg-negative/[0.09]' : '';
              const bar = isIns ? 'shadow-[inset_2px_0_0_hsl(var(--positive))]' : isDel ? 'shadow-[inset_2px_0_0_hsl(var(--negative))]' : '';
              return (
                <tr
                  key={index}
                  ref={(el) => { if (el) rowRefs.current.set(index, el); else rowRefs.current.delete(index); }}
                  className={bg}
                >
                  <td className={`select-none w-11 pl-3 pr-1.5 text-right tabular-nums text-faint/70 ${bar}`}>{line.old_lineno ?? ''}</td>
                  <td className="select-none w-9 pr-2 text-right tabular-nums text-faint/70">{line.new_lineno ?? ''}</td>
                  <td className={`select-none w-4 text-center ${isIns ? 'text-positive' : isDel ? 'text-negative' : 'text-transparent'}`}>{isIns ? '+' : isDel ? '−' : ' '}</td>
                  <td className={`pr-6 whitespace-pre ${isIns || isDel ? 'text-foreground' : 'text-muted-foreground'}`}>{highlight(line.content.replace(/\n$/, ''))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {diff.lines.length > maxLines && (
          <p className="text-2xs text-faint px-4 py-2 font-sans">{(diff.lines.length - maxLines).toLocaleString()} more lines not shown.</p>
        )}
      </div>
    </div>
  );
}
