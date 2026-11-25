import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Plus, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { listDirectory } from '@/lib/tauri';
import { COMMON_PATTERNS } from '@/lib/folderDefaults';
import { hasExcludedInside, splitRules, joinRules, stateOf, turnOff, turnOn, type RowState } from '@/lib/pickRules';
import { TristateCheckbox, type CheckState } from './TristateCheckbox';
import { FileIcon, DirIcon } from './ui/FileIcon';
import { Spinner } from './ui/Spinner';
import type { DirEntryInfo } from '@/lib/types';

const ROW_H = 30;
const INDENT = 18;

function fmtSize(n: number | null) {
  if (n == null) return '';
  if (n < 1000) return `${n} B`;
  if (n < 1000 * 1000) return `${(n / 1000).toFixed(1)} kB`;
  if (n < 1000 * 1000 * 1000) return `${(n / 1000 / 1000).toFixed(1)} MB`;
  return `${(n / 1000 / 1000 / 1000).toFixed(2)} GB`;
}

interface Props {
  root: string;
  globs: string[];
  onChange: (globs: string[]) => void;
  height?: number;
  showPatterns?: boolean;
}

type Row = { kind: 'entry'; entry: DirEntryInfo; depth: number } | { kind: 'status'; dir: string; depth: number; text: string; loading?: boolean };

export function FolderContentPicker({ root, globs, onChange, height = 340, showPatterns = true }: Props) {
  const [children, setChildren] = useState<Map<string, DirEntryInfo[]>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set(['']));
  const [custom, setCustom] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const globKey = globs.join('\n');
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const request = useRef(0);

  const load = useCallback(async (dirs: string[], currentGlobs: string[], refresh: boolean) => {
    if (refresh) request.current++;
    const id = request.current;
    setLoading((s) => new Set([...s, ...dirs]));
    const results = await Promise.all(dirs.map((d) =>
      listDirectory(root, d, currentGlobs).then((r) => ({ d, r, e: null as string | null })).catch((e) => ({ d, r: null, e: String(e) }))));
    setLoading((s) => { const n = new Set(s); dirs.forEach((d) => n.delete(d)); return n; });
    if (id !== request.current) return;
    setChildren((prev) => {
      const next = new Map(prev);
      for (const { d, r } of results) if (r) next.set(d, r);
      return next;
    });
    setErrors((prev) => {
      const next = new Map(prev);
      for (const { d, e } of results) { if (e) next.set(d, e); else next.delete(d); }
      return next;
    });
  }, [root]);

  useEffect(() => {
    setChildren(new Map());
    setExpanded(new Set());
  }, [root]);

  useEffect(() => {
    const t = setTimeout(() => void load(['', ...expandedRef.current], globs, true), 120);
    return () => clearTimeout(t);
  }, [root, globKey, load]);

  function toggleExpand(dir: string) {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(dir)) n.delete(dir);
      else {
        n.add(dir);
        if (!children.has(dir)) void load([dir], globs, false);
      }
      return n;
    });
  }

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const walk = (dir: string, depth: number) => {
      const list = children.get(dir);
      if (!list) {
        if (errors.has(dir)) out.push({ kind: 'status', dir, depth, text: `Couldn't read this folder: ${errors.get(dir)}` });
        else out.push({ kind: 'status', dir, depth, text: 'Loading', loading: true });
        return;
      }
      if (list.length === 0) out.push({ kind: 'status', dir, depth, text: dir ? 'Empty folder' : 'This folder is empty' });
      for (const entry of list) {
        out.push({ kind: 'entry', entry, depth });
        if (entry.isDir && expanded.has(entry.relPath)) walk(entry.relPath, depth + 1);
      }
    };
    walk('', 0);
    return out;
  }, [children, errors, expanded]);

  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 12 });

  const byRel = useMemo(() => {
    const m = new Map<string, DirEntryInfo>();
    children.forEach((list) => list.forEach((e) => m.set(e.relPath, e)));
    return m;
  }, [children]);

  function parentBlocked(entry: DirEntryInfo) {
    const parts = entry.relPath.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = byRel.get(parts.slice(0, i).join('/'));
      if (!parent) continue;
      const st = stateOf(parent, globs);
      if (st === 'off-rule' || st === 'protected') return true;
    }
    return false;
  }

  function checkState(entry: DirEntryInfo, state: RowState): CheckState {
    if (state !== 'on') return 'unchecked';
    if (!entry.isDir) return 'checked';
    if (hasExcludedInside(entry.relPath, globs)) return 'indeterminate';
    const kids = children.get(entry.relPath);
    if (kids?.some((k) => k.ignored && !k.protected)) return 'indeterminate';
    return 'checked';
  }

  function toggle(entry: DirEntryInfo) {
    const state = stateOf(entry, globs);
    if (state === 'protected' || parentBlocked(entry)) return;
    const next = state === 'on' ? turnOff(entry, globs) : turnOn(entry, globs, (d) => children.get(d));
    const nowIgnored = state === 'on';
    const inside = `${entry.relPath}/`;
    setChildren((prev) => new Map([...prev].map(([dir, list]) => [dir, list.map((e) => {
      const affected = e.relPath === entry.relPath || e.relPath.startsWith(inside) || (!nowIgnored && entry.relPath.startsWith(`${e.relPath}/`));
      return affected && !e.protected ? { ...e, ignored: nowIgnored } : e;
    })])));
    request.current++;
    onChange(next);
  }

  const { patterns, excludes, includes } = splitRules(globs);
  const extraPatterns = patterns.filter((p) => !COMMON_PATTERNS.includes(p));

  function togglePattern(p: string) {
    const nextPatterns = patterns.includes(p) ? patterns.filter((x) => x !== p) : [...patterns, p];
    onChange(joinRules(nextPatterns, excludes, includes));
  }

  function addCustom() {
    const v = custom.trim();
    if (!v) return;
    if (v.startsWith('/') || v.startsWith('!')) onChange([...globs, v]);
    else if (!patterns.includes(v)) onChange(joinRules([...patterns, v], excludes, includes));
    setCustom('');
  }

  const rootLoading = loading.has('') && !children.has('');

  return (
    <div className="space-y-3">
      {showPatterns && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Skip everywhere in this folder</p>
          <div className="flex flex-wrap gap-1.5">
            {[...COMMON_PATTERNS, ...extraPatterns].map((p) => {
              const on = patterns.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePattern(p)}
                  aria-pressed={on}
                  className={`press h-6 px-2.5 rounded-full text-2xs font-mono transition-colors duration-200
                              ${on ? 'bg-primary/[0.14] text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.3)]'
                                : 'bg-foreground/[0.04] text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:text-foreground hover:bg-foreground/[0.07]'}`}
                >
                  {p}
                </button>
              );
            })}
            <div className="inline-flex items-center h-6 rounded-full bg-foreground/[0.04] shadow-[inset_0_0_0_1px_hsl(var(--line))] pl-2.5 pr-0.5 focus-within:shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.5)]">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                placeholder="*.psd"
                spellCheck={false}
                aria-label="Add a rule"
                className="bg-transparent outline-none text-2xs font-mono w-20 placeholder:text-faint"
              />
              <button type="button" onClick={addCustom} disabled={!custom.trim()} aria-label="Add rule" className="w-5 h-5 grid place-items-center rounded-full text-muted-foreground hover:text-foreground disabled:opacity-40">
                <Plus size={11} />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg bg-surface-sunken shadow-[inset_0_0_0_1px_hsl(var(--line))] overflow-hidden">
        <div className="flex items-center gap-2 h-9 px-3 border-b border-[hsl(var(--line))] text-xs">
          <span className="text-muted-foreground flex-1 min-w-0 truncate">Untick anything you don't want versions of</span>
          {excludes.length + includes.length > 0 && (
            <button
              type="button"
              onClick={() => onChange(patterns)}
              className="press inline-flex items-center gap-1 h-6 px-2 rounded-[calc(6px*var(--rs))] text-2xs text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]"
            >
              <RotateCcw size={11} />Undo ticks
            </button>
          )}
        </div>
        <div ref={scrollRef} className="overflow-y-auto overflow-x-hidden px-1.5 py-1.5 scroll-fade-y" style={{ height }} role="tree" aria-label="Folder contents">
          {rootLoading ? (
            <div className="h-full grid place-items-center"><Spinner size={16} className="text-faint" /></div>
          ) : (
            <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((v) => {
                const row = rows[v.index];
                const style = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${v.start}px)` };
                if (row.kind === 'status') {
                  return (
                    <div key={`s:${row.dir}`} style={{ ...style, paddingLeft: 34 + row.depth * INDENT }} className="flex items-center gap-2 text-xs text-faint">
                      {row.loading ? <Spinner size={12} /> : errors.has(row.dir) ? <TriangleAlert size={12} className="text-caution" /> : null}
                      <span className="truncate">{row.text}</span>
                    </div>
                  );
                }
                const { entry, depth } = row;
                const state = stateOf(entry, globs);
                const blocked = parentBlocked(entry);
                const off = state !== 'on';
                const open = expanded.has(entry.relPath);
                return (
                  <div
                    key={entry.relPath}
                    style={{ ...style, paddingLeft: 6 + depth * INDENT }}
                    role="treeitem"
                    aria-label={entry.name}
                    aria-expanded={entry.isDir ? open : undefined}
                    className="group flex items-center gap-2 pr-3 rounded-[calc(7px*var(--rs))] hover:bg-foreground/[0.04]"
                    onClick={() => (entry.isDir ? toggleExpand(entry.relPath) : toggle(entry))}
                  >
                    <TristateCheckbox
                      state={checkState(entry, state)}
                      onToggle={() => toggle(entry)}
                      disabled={state === 'protected' || blocked}
                      label={`${off ? 'Include' : 'Skip'} ${entry.name}`}
                    />
                    {entry.isDir ? (
                      <ChevronRight size={13} className={`shrink-0 text-faint transition-transform duration-300 ease-zftm ${open ? 'rotate-90' : ''}`} />
                    ) : <span className="w-[13px] shrink-0" />}
                    {entry.isDir
                      ? <DirIcon open={open} size={15} className={off ? 'text-faint' : 'text-primary/80'} />
                      : <FileIcon path={entry.name} size={15} className={off ? 'text-faint' : 'text-muted-foreground'} />}
                    <span className={`truncate text-sm ${off ? 'text-faint line-through decoration-foreground/20' : 'text-foreground/90'}`}>{entry.name}</span>
                    {entry.isDir && entry.items != null && <span className="text-2xs text-faint tabular-nums shrink-0">{entry.items}</span>}
                    <span className="flex-1" />
                    {state === 'protected' && (
                      <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground shrink-0" data-tip="ZFileTimeMachine's own data is always skipped">
                        <ShieldCheck size={11} />App data
                      </span>
                    )}
                    {state === 'off-rule' && !blocked && <span className="text-2xs text-faint shrink-0">matches a rule</span>}
                    <span className={`text-2xs font-mono tabular-nums shrink-0 w-16 text-right ${off ? 'text-faint/70' : 'text-faint'}`}>
                      {entry.isDir && entry.size == null && !off ? 'large' : fmtSize(entry.size)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
