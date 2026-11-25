import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Pin } from 'lucide-react';
import type { FileEntry } from '@/lib/types';
import { TristateCheckbox, type CheckState } from './TristateCheckbox';
import { FileIcon, DirIcon } from './ui/FileIcon';

interface Props {
  files: FileEntry[];
  selected: Set<string>;
  onToggleFile: (relPath: string) => void;
  onToggleDir: (prefix: string) => void;
  filter: string;
  selectedFile: string | null;
  onSelectFile: (relPath: string) => void;
  fileSnapshotOverrides: Map<string, number>;
}

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  file?: FileEntry;
}

function buildTree(files: FileEntry[], filter: string): TreeNode {
  const visible = filter
    ? files.filter((f) => f.relPath.toLowerCase().includes(filter.toLowerCase()))
    : files;
  const root: TreeNode = { name: '', path: '', children: [] };
  for (const file of visible) {
    const parts = file.relPath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const childPath = parts.slice(0, i + 1).join('/');
      let child = node.children.find((c) => c.name === part && !c.file);
      if (!child) { child = { name: part, path: childPath, children: [] }; node.children.push(child); }
      node = child;
    }
    node.children.push({ name: parts[parts.length - 1], path: file.relPath, children: [], file });
  }
  function sortNode(n: TreeNode) {
    n.children.sort((a, b) => {
      const aD = !a.file, bD = !b.file;
      if (aD !== bD) return aD ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

function buildDirIndex(files: FileEntry[], selected: Set<string>, filter: string) {
  const visible = filter ? files.filter((f) => f.relPath.toLowerCase().includes(filter.toLowerCase())) : files;
  const idx = new Map<string, { total: number; sel: number }>();
  for (const f of visible) {
    const parts = f.relPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('/');
      const e = idx.get(prefix) ?? { total: 0, sel: 0 };
      e.total++;
      if (selected.has(f.relPath)) e.sel++;
      idx.set(prefix, e);
    }
  }
  return idx;
}

function dirState(prefix: string, idx: Map<string, { total: number; sel: number }>): CheckState {
  const e = idx.get(prefix);
  if (!e || e.total === 0 || e.sel === 0) return 'unchecked';
  if (e.sel === e.total) return 'checked';
  return 'indeterminate';
}

interface NodeRowProps {
  node: TreeNode;
  depth: number;
  selected: Set<string>;
  expanded: Set<string>;
  dirIdx: Map<string, { total: number; sel: number }>;
  selectedFile: string | null;
  fileSnapshotOverrides: Map<string, number>;
  onToggleFile: (p: string) => void;
  onToggleDir: (p: string) => void;
  onToggleExpand: (p: string) => void;
  onSelectFile: (p: string) => void;
}

function NodeRow(props: NodeRowProps) {
  const { node, depth, selected, expanded, dirIdx, selectedFile, fileSnapshotOverrides, onToggleFile, onToggleDir, onToggleExpand, onSelectFile } = props;
  const isDir = !node.file;
  const isExpanded = expanded.has(node.path);
  const isActiveFile = !isDir && selectedFile === node.path;
  const isPinned = !isDir && fileSnapshotOverrides.has(node.path);
  const isSelected = !isDir && selected.has(node.path);
  const checkState: CheckState = isDir ? dirState(node.path, dirIdx) : isSelected ? 'checked' : 'unchecked';

  return (
    <>
      <div
        role="treeitem"
        aria-expanded={isDir ? isExpanded : undefined}
        aria-selected={isActiveFile}
        className={`group flex items-center gap-2 h-[30px] rounded-[calc(8px*var(--rs))] cursor-default select-none
                    ${isActiveFile ? 'bg-primary/[0.13] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.22)]' : 'hover:bg-foreground/[0.045]'}`}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: 8 }}
        onClick={() => isDir ? onToggleExpand(node.path) : onSelectFile(node.path)}
      >
        <TristateCheckbox
          state={checkState}
          onToggle={() => isDir ? onToggleDir(node.path) : onToggleFile(node.path)}
          label={`Select ${node.name}`}
        />
        {isDir ? (
          <>
            <ChevronRight size={13} className={`text-faint shrink-0 transition-transform duration-300 ease-zftm ${isExpanded ? 'rotate-90' : ''}`} />
            <DirIcon open={isExpanded} size={15} className="text-muted-foreground" />
          </>
        ) : (
          <FileIcon path={node.path} binary={node.file?.isBinary} size={15} className={`ml-[19px] ${isActiveFile ? 'text-primary' : 'text-muted-foreground'}`} />
        )}
        <span className={`text-sm truncate flex-1 min-w-0 ${isActiveFile ? 'text-foreground font-medium' : isSelected || isDir ? 'text-foreground/90' : 'text-foreground/75'}`}>
          {node.name}
        </span>
        {node.file && (
          <span className="flex items-center gap-2 shrink-0">
            {isPinned && (
              <span className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[calc(5px*var(--rs))] bg-primary/12 text-primary text-2xs font-medium" data-tip="This file uses the version you picked">
                <Pin size={10} />Pinned
              </span>
            )}
            <span className="text-2xs tabular-nums text-faint">{node.file.snapshotCount > 0 ? node.file.snapshotCount : ''}</span>
          </span>
        )}
      </div>
      {isDir && isExpanded && node.children.map((child) => (
        <NodeRow key={child.path} {...props} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export function RecoverTree({ files, selected, onToggleFile, onToggleDir, filter, selectedFile, onSelectFile, fileSnapshotOverrides }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const f of files) { if (f.relPath.includes('/')) s.add(f.relPath.split('/')[0]); }
    return s;
  });

  const tree = useMemo(() => buildTree(files, filter), [files, filter]);
  const dirIdx = useMemo(() => buildDirIndex(files, selected, filter), [files, selected, filter]);

  function toggleExpand(path: string) {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; });
  }

  useEffect(() => {
    if (!filter) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of files) {
        if (!f.relPath.toLowerCase().includes(filter.toLowerCase())) continue;
        const parts = f.relPath.split('/');
        for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
      }
      return next;
    });
  }, [filter, files]);

  if (tree.children.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        {filter ? <>No files match “{filter}”.</> : 'There are no files in this folder yet.'}
      </p>
    );
  }

  return (
    <div role="tree" aria-label="Files to recover" aria-multiselectable>
      {tree.children.map((node) => (
        <NodeRow key={node.path} node={node} depth={0}
          selected={selected} expanded={expanded} dirIdx={dirIdx}
          selectedFile={selectedFile} fileSnapshotOverrides={fileSnapshotOverrides}
          onToggleFile={onToggleFile} onToggleDir={onToggleDir}
          onToggleExpand={toggleExpand} onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}
