import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Pause, Play, Camera, Copy, StickyNote } from 'lucide-react';
import type { FileEntry } from '@/lib/types';
import { FileIcon, DirIcon } from './ui/FileIcon';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';
import { useManualSnapshot, useSetFileOverride, useSetPathOverride } from '@/hooks/useTimeline';
import { useToast } from '@/context/ToastContext';
import { gsap, dur } from '@/lib/motion';

const ROW_H = 30;
const INDENT = 14;

interface DirNode { name: string; path: string; dirs: Map<string, DirNode>; files: FileEntry[]; total: number; paused: number }

function buildTree(files: FileEntry[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: new Map(), files: [], total: 0, paused: 0 };
  for (const f of files) {
    const parts = f.relPath.split('/');
    let node = root;
    node.total++; if (f.noAutoSnapshot) node.paused++;
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/');
      let next = node.dirs.get(parts[i]);
      if (!next) {
        next = { name: parts[i], path, dirs: new Map(), files: [], total: 0, paused: 0 };
        node.dirs.set(parts[i], next);
      }
      next.total++; if (f.noAutoSnapshot) next.paused++;
      node = next;
    }
    node.files.push(f);
  }
  return root;
}

type Row =
  | { kind: 'dir'; node: DirNode; depth: number; open: boolean }
  | { kind: 'file'; file: FileEntry; depth: number; dir?: string };

function flatten(node: DirNode, expanded: Set<string>, depth: number, out: Row[]) {
  const dirs = [...node.dirs.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  for (const d of dirs) {
    const open = expanded.has(d.path);
    out.push({ kind: 'dir', node: d, depth, open });
    if (open) flatten(d, expanded, depth + 1, out);
  }
  const files = [...node.files].sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }));
  for (const f of files) out.push({ kind: 'file', file: f, depth });
}

function ancestors(relPath: string): string[] {
  const parts = relPath.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

interface Props {
  folderId: number;
  files: FileEntry[];
  filter: string;
  selectedId: number | null;
  onSelect: (file: FileEntry) => void;
}

export function FileTree({ folderId, files, filter, selectedId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillShown = useRef(false);
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (files.length <= 40) for (const f of files) ancestors(f.relPath).forEach((a) => initial.add(a));
    return initial;
  });
  const { menu, open: openMenu, close } = useContextMenu();
  const snapshot = useManualSnapshot();
  const setFileOverride = useSetFileOverride();
  const setPathOverride = useSetPathOverride();
  const { toast } = useToast();

  const selectedFile = files.find((f) => f.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedFile) return;
    const need = ancestors(selectedFile.relPath).filter((a) => !expanded.has(a));
    if (need.length) setExpanded((s) => { const n = new Set(s); need.forEach((a) => n.add(a)); return n; });
  }, [selectedFile?.relPath]);

  const q = filter.trim().toLowerCase();
  const rows = useMemo<Row[]>(() => {
    if (q) {
      return files
        .filter((f) => f.relPath.toLowerCase().includes(q))
        .sort((a, b) => a.relPath.localeCompare(b.relPath))
        .map((f) => ({ kind: 'file' as const, file: f, depth: 0, dir: f.relPath.includes('/') ? f.relPath.slice(0, f.relPath.lastIndexOf('/')) : undefined }));
    }
    const out: Row[] = [];
    flatten(tree, expanded, 0, out);
    return out;
  }, [tree, expanded, q, files]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 16,
  });

  const selectedIndex = rows.findIndex((r) => r.kind === 'file' && r.file.id === selectedId);

  useLayoutEffect(() => {
    const pill = pillRef.current;
    if (!pill) return;
    if (selectedIndex < 0) {
      if (pillShown.current) gsap.to(pill, { autoAlpha: 0, duration: dur(0.15), overwrite: true });
      pillShown.current = false;
      return;
    }
    const y = selectedIndex * ROW_H;
    if (!pillShown.current) {
      gsap.killTweensOf(pill);
      gsap.set(pill, { y });
      gsap.fromTo(pill, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur(0.25) });
      pillShown.current = true;
    } else {
      gsap.to(pill, { y, autoAlpha: 1, duration: dur(0.42), ease: 'zftm', overwrite: 'auto' });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (selectedIndex >= 0) virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex]);

  function toggle(path: string) {
    setExpanded((s) => { const n = new Set(s); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const fileRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.kind === 'file');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const pos = fileRows.findIndex((x) => x.i === selectedIndex);
      const next = e.key === 'ArrowDown' ? Math.min(pos + 1, fileRows.length - 1) : Math.max(pos - 1, 0);
      const target = fileRows[pos < 0 ? 0 : next]?.r;
      if (target && target.kind === 'file') onSelect(target.file);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && selectedFile) {
      const parent = ancestors(selectedFile.relPath).pop();
      if (parent && e.key === 'ArrowLeft') { e.preventDefault(); toggle(parent); }
    }
  }

  function fileMenu(e: React.MouseEvent, f: FileEntry) {
    openMenu(e, [
      { label: 'Save a version now', icon: <Camera size={14} />, onClick: () => snapshot.mutate(f.id, { onSuccess: () => toast('success', `Saved a version of ${f.relPath.split('/').pop()}.`) }) },
      {
        label: f.noAutoSnapshot ? 'Resume automatic versions' : 'Pause automatic versions',
        icon: f.noAutoSnapshot ? <Play size={14} /> : <Pause size={14} />,
        onClick: () => setFileOverride.mutate({ id: f.id, noAutoSnapshot: !f.noAutoSnapshot }),
      },
      { label: 'Copy path', icon: <Copy size={14} />, separator: true, onClick: () => void navigator.clipboard.writeText(f.relPath) },
    ]);
  }

  function dirMenu(e: React.MouseEvent, node: DirNode) {
    const allPaused = node.paused === node.total;
    openMenu(e, [
      {
        label: allPaused ? 'Resume automatic versions here' : 'Pause automatic versions here',
        icon: allPaused ? <Play size={14} /> : <Pause size={14} />,
        onClick: () => setPathOverride.mutate({ folderId, pathPrefix: node.path, noAutoSnapshot: !allPaused }, {
          onSuccess: () => toast('info', allPaused
            ? `Automatic versions are back on for ${node.name}.`
            : `Automatic versions are paused for ${node.name}, including files added later.`),
        }),
      },
      { label: 'Copy path', icon: <Copy size={14} />, separator: true, onClick: () => void navigator.clipboard.writeText(node.path) },
    ]);
  }

  if (rows.length === 0) {
    return (
      <div className="flex-1 grid place-items-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {q ? <>No files match “{filter}”.</> : 'No files yet. They appear once the first scan finishes.'}
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="tree"
      aria-label="Files"
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-6 outline-none scroll-fade-y focus-visible:shadow-[inset_0_0_0_2px_hsl(var(--ring)/0.35)] rounded-b-[inherit]"
    >
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        <div
          ref={pillRef}
          aria-hidden
          className="absolute left-0 right-0 top-0 rounded-[calc(8px*var(--rs))] invisible pointer-events-none bg-primary/[0.13] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)]"
          style={{ height: ROW_H }}
        />
        {virtualizer.getVirtualItems().map((v) => {
          const row = rows[v.index];
          const style = { position: 'absolute' as const, top: 0, left: 0, right: 0, height: ROW_H, transform: `translateY(${v.start}px)` };
          if (row.kind === 'dir') {
            const allPaused = row.node.paused === row.node.total;
            return (
              <button
                key={`d:${row.node.path}`}
                style={{ ...style, paddingLeft: 6 + row.depth * INDENT }}
                role="treeitem"
                aria-expanded={row.open}
                onClick={() => toggle(row.node.path)}
                onContextMenu={(e) => dirMenu(e, row.node)}
                className="group flex items-center gap-1.5 pr-2 rounded-[calc(8px*var(--rs))] text-left text-sm text-foreground/85 hover:bg-foreground/[0.045]"
              >
                <ChevronRight size={13} className={`shrink-0 text-faint transition-transform duration-300 ease-zftm ${row.open ? 'rotate-90' : ''}`} />
                <DirIcon open={row.open} size={15} className="text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate">{row.node.name}</span>
                {allPaused && <Pause size={10} className="text-faint shrink-0" aria-label="Automatic versions paused" />}
                <span className="text-2xs text-faint tabular-nums shrink-0">{row.node.total}</span>
              </button>
            );
          }
          const f = row.file;
          const name = f.relPath.split('/').pop() ?? f.relPath;
          const selected = f.id === selectedId;
          return (
            <button
              key={f.id}
              style={{ ...style, paddingLeft: 6 + row.depth * INDENT + (q ? 0 : 19) }}
              role="treeitem"
              aria-selected={selected}
              onClick={() => onSelect(f)}
              onContextMenu={(e) => fileMenu(e, f)}
              className={`group flex items-center gap-2 pr-2 rounded-[calc(8px*var(--rs))] text-left text-sm
                          ${selected ? 'text-foreground' : 'text-foreground/85 hover:bg-foreground/[0.045]'}`}
            >
              <FileIcon path={f.relPath} binary={f.isBinary} size={15} className={selected ? 'text-primary' : 'text-muted-foreground'} />
              <span className="flex-1 min-w-0 flex items-baseline gap-2">
                <span className="truncate">{name}</span>
                {row.dir && <span className="text-2xs text-faint truncate">{row.dir}</span>}
              </span>
              {f.note && <StickyNote size={11} className="text-faint shrink-0" aria-label="Has a note" />}
              {f.noAutoSnapshot && <Pause size={10} className="text-faint shrink-0" aria-label="Automatic versions paused" />}
              <span className={`text-2xs tabular-nums shrink-0 min-w-[16px] text-right ${selected ? 'text-muted-foreground' : 'text-faint'}`}>{f.snapshotCount}</span>
            </button>
          );
        })}
      </div>
      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  );
}
