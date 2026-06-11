import { useMemo, useState } from 'react';
import { ChevronRight, FileText, Folder as FolderIcon, FolderOpen, Pin } from 'lucide-react';
import type { FileEntry } from '@/lib/types';
import { TristateCheckbox, type CheckState } from './TristateCheckbox';

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
      let child = node.children.find((c) => c.name === part);
      if (!child) { child = { name: part, path: childPath, children: [] }; node.children.push(child); }
      node = child;
    }
    node.children.push({ name: parts[parts.length - 1], path: file.relPath, children: [], file });
  }
  function sortNode(n: TreeNode) {
    n.children.sort((a, b) => {
      const aD = a.children.length > 0, bD = b.children.length > 0;
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
  if (!e || e.total === 0) return 'unchecked';
  if (e.sel === 0) return 'unchecked';
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

function NodeRow({ node, depth, selected, expanded, dirIdx, selectedFile, fileSnapshotOverrides, onToggleFile, onToggleDir, onToggleExpand, onSelectFile }: NodeRowProps) {
  const isDir = !node.file;
  const isExpanded = expanded.has(node.path);
  const isActiveFile = !isDir && selectedFile === node.path;
  const isPinned = !isDir && fileSnapshotOverrides.has(node.path);
  const isSelected = !isDir && selected.has(node.path);
  const checkState: CheckState = isDir ? dirState(node.path, dirIdx) : isSelected ? 'checked' : 'unchecked';

  return (
    <>
      <div
        className={`group flex items-center gap-2 py-[5px] rounded-lg cursor-pointer select-none transition-all duration-100
                    ${isActiveFile
                      ? 'bg-primary/10 border border-primary/20'
                      : isSelected && !isDir
                        ? 'bg-primary/5 border border-transparent hover:bg-primary/8'
                        : 'border border-transparent hover:bg-white/4'
                    }`}
        style={{ paddingLeft: `${10 + depth * 18}px`, paddingRight: '8px' }}
        onClick={() => isDir ? onToggleExpand(node.path) : onSelectFile(node.path)}
      >

        <TristateCheckbox
          state={checkState}
          onToggle={() => isDir ? onToggleDir(node.path) : onToggleFile(node.path)}
          size={13}
        />


        {isDir ? (
          <>
            <ChevronRight size={11} className={`text-muted-foreground/40 shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
            {isExpanded
              ? <FolderOpen size={13} className="text-primary/70 shrink-0" />
              : <FolderIcon size={13} className="text-muted-foreground/40 shrink-0" />
            }
          </>
        ) : (
          <FileText size={12} className={`shrink-0 ml-[15px] transition-colors ${isActiveFile ? 'text-primary/70' : isSelected ? 'text-primary/40' : 'text-muted-foreground/30'}`} />
        )}


        <span className={`text-[12px] truncate flex-1 min-w-0 transition-colors
                          ${isActiveFile ? 'text-primary font-medium' : isSelected && !isDir ? 'text-foreground/90' : 'text-foreground/65'}`}>
          {node.name}
        </span>


        {node.file && (
          <div className="flex items-center gap-2 shrink-0">
            {isPinned && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-400/15 border border-amber-400/25">
                <Pin size={8} className="text-amber-400 fill-amber-400/60" />
                <span className="text-[9px] text-amber-400/80 font-medium">pinned</span>
              </div>
            )}
            <span className={`text-[10px] font-mono transition-opacity ${isActiveFile || isSelected ? 'opacity-60' : 'opacity-0 group-hover:opacity-40'} text-muted-foreground`}>
              {node.file.snapshotCount > 0 ? `${node.file.snapshotCount}v` : ''}
            </span>
          </div>
        )}
      </div>

      {isDir && isExpanded && node.children.map((child) => (
        <NodeRow key={child.path} node={child} depth={depth + 1}
          selected={selected} expanded={expanded} dirIdx={dirIdx}
          selectedFile={selectedFile} fileSnapshotOverrides={fileSnapshotOverrides}
          onToggleFile={onToggleFile} onToggleDir={onToggleDir}
          onToggleExpand={onToggleExpand} onSelectFile={onSelectFile}
        />
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

  useMemo(() => {
    if (!filter) return;
    const next = new Set(expanded);
    for (const f of files) {
      if (!f.relPath.toLowerCase().includes(filter.toLowerCase())) continue;
      const parts = f.relPath.split('/');
      for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join('/'));
    }
    setExpanded(next);

  }, [filter]);

  if (tree.children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-xs text-muted-foreground/30">
        <FolderIcon size={24} className="opacity-20" />
        {filter ? 'No files match.' : 'No files in this folder.'}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
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
