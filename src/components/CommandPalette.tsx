import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { Search, LayoutGrid, Settings, Plus, Sun, Moon, Keyboard, PanelLeft, History, Info, CornerDownLeft } from 'lucide-react';
import { useFolders } from '@/hooks/useFolders';
import { useAddFolderFlow } from '@/context/AddFolderContext';
import { FolderIcon } from './FolderIcon';
import { folderTint } from '@/lib/folderAppearance';
import { setTheme, storedTheme } from '@/lib/platform';
import { formatPath, listFiles } from '@/lib/tauri';
import { FileIcon } from './ui/FileIcon';
import { Sheet } from './ui/Sheet';
import { gsap, dur } from '@/lib/motion';

interface Command {
  id: string;
  label: string;
  group: 'Folders' | 'Files' | 'Actions' | 'Go to';
  mono?: boolean;
  icon: React.ReactNode;
  description?: string;
  keywords?: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
  onToggleSidebar: () => void;
}

export function CommandPalette({ open, onClose, onShowShortcuts, onToggleSidebar }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hiRef = useRef<HTMLSpanElement>(null);
  const navigate = useNavigate();
  const { data: folders } = useFolders();
  const { startAddFolder } = useAddFolderFlow();

  useEffect(() => {
    if (open) { setQuery(''); setActiveIndex(0); }
  }, [open]);

  const q = query.trim().toLowerCase();
  const fileQueries = useQueries({
    queries: (folders ?? []).map((f) => ({ queryKey: ['files', f.id], queryFn: () => listFiles(f.id), enabled: open && q.length >= 2, staleTime: 10_000 })),
  });

  const fileHits = useMemo<Command[]>(() => {
    if (q.length < 2 || !folders) return [];
    const hits: { score: number; cmd: Command }[] = [];
    folders.forEach((f, i) => {
      for (const file of fileQueries[i]?.data ?? []) {
        const path = file.relPath.toLowerCase();
        const name = path.slice(path.lastIndexOf('/') + 1);
        const at = name.indexOf(q);
        if (at === -1 && !path.includes(q)) continue;
        hits.push({
          score: at === 0 ? 0 : at > 0 ? 1 : 2,
          cmd: {
            id: `file-${f.id}-${file.id}`, group: 'Files', mono: true,
            label: file.relPath.slice(file.relPath.lastIndexOf('/') + 1),
            description: `${f.displayName}${file.relPath.includes('/') ? ` / ${file.relPath.slice(0, file.relPath.lastIndexOf('/'))}` : ''}`,
            icon: <FileIcon path={file.relPath} binary={file.isBinary} size={15} />,
            action: () => { navigate(`/folder/${f.id}?file=${encodeURIComponent(file.relPath)}`); onClose(); },
          },
        });
      }
    });
    hits.sort((a, b) => a.score - b.score || a.cmd.label.localeCompare(b.cmd.label));
    return hits.slice(0, 8).map((h) => h.cmd);
  }, [q, folders, fileQueries, navigate, onClose]);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => { navigate(path); onClose(); };
    const theme = storedTheme();
    return [
      ...(folders ?? []).flatMap((f) => [
        {
          id: `folder-${f.id}`, group: 'Folders' as const, label: f.displayName, description: formatPath(f.path),
          icon: <FolderIcon name={f.config.icon} size={15} {...folderTint(f.config.color)} />,
          action: go(`/folder/${f.id}`),
        },
      ]),
      ...(folders ?? []).map((f) => ({
        id: `recover-${f.id}`, group: 'Actions' as const, label: `Recover files from ${f.displayName}`,
        icon: <History size={15} />, keywords: 'restore export', action: go(`/folder/${f.id}/recover`),
      })),
      { id: 'add', group: 'Actions', label: 'Add a folder to watch', icon: <Plus size={15} />, keywords: 'new watch', action: () => { onClose(); startAddFolder(); } },
      {
        id: 'theme', group: 'Actions', label: theme === 'dark' ? 'Switch to light appearance' : 'Switch to dark appearance',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />, keywords: 'theme dark light mode',
        action: () => { onClose(); setTimeout(() => setTheme(theme === 'dark' ? 'light' : 'dark'), 180); },
      },
      { id: 'sidebar', group: 'Actions', label: 'Show or hide the sidebar', icon: <PanelLeft size={15} />, keywords: 'collapse expand', action: () => { onToggleSidebar(); onClose(); } },
      { id: 'shortcuts', group: 'Actions', label: 'Keyboard shortcuts', icon: <Keyboard size={15} />, keywords: 'keys help', action: () => { onClose(); onShowShortcuts(); } },
      { id: 'overview', group: 'Go to', label: 'Overview', icon: <LayoutGrid size={15} />, keywords: 'home folders', action: go('/') },
      { id: 'settings', group: 'Go to', label: 'Settings', icon: <Settings size={15} />, keywords: 'preferences options', action: go('/settings') },
      { id: 'about', group: 'Go to', label: 'About', icon: <Info size={15} />, keywords: 'version', action: go('/about') },
    ];
  }, [folders, navigate, onClose, startAddFolder, onShowShortcuts, onToggleSidebar, open]);

  const filtered = useMemo(() => {
    if (!q) return commands;
    const matched = commands.filter((c) => `${c.label} ${c.description ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q));
    const folderCount = matched.filter((c) => c.group === 'Folders').length;
    return [...matched.slice(0, folderCount), ...fileHits, ...matched.slice(folderCount)];
  }, [commands, q, fileHits]);

  useEffect(() => {
    if (activeIndex >= filtered.length) setActiveIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, activeIndex]);

  useLayoutEffect(() => {
    const list = listRef.current;
    const hi = hiRef.current;
    if (!list || !hi) return;
    const el = list.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!el) { gsap.killTweensOf(hi); gsap.set(hi, { autoAlpha: 0 }); return; }
    el.scrollIntoView({ block: 'nearest' });
    gsap.to(hi, { y: el.offsetTop, height: el.offsetHeight, autoAlpha: 1, duration: dur(0.28), ease: 'zftm', overwrite: 'auto' });
  }, [activeIndex, filtered, open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); filtered[activeIndex]?.action(); }
  }

  let lastGroup = '';
  return (
    <Sheet open={open} onClose={onClose} width={580} align="top" label="Search">
      <div onKeyDown={onKeyDown} className="flex flex-col min-h-0">
        <div className="flex items-center gap-3 px-5 h-14 shrink-0 border-b border-[hsl(var(--line))]">
          <Search size={17} className="text-muted-foreground shrink-0" />
          <input
            data-autofocus
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search files, folders and actions"
            className="flex-1 bg-transparent text-md outline-none placeholder:text-faint"
            aria-label="Search files, folders and actions"
          />
          <kbd className="text-2xs text-faint px-1.5 h-5 grid place-items-center rounded-[calc(5px*var(--rs))] bg-foreground/[0.06]">Esc</kbd>
        </div>

        <div ref={listRef} className="relative max-h-[360px] overflow-y-auto p-2">
          <span ref={hiRef} aria-hidden className="absolute left-2 right-2 top-0 rounded-[calc(9px*var(--rs))] bg-foreground/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--line))] invisible" />
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Nothing matches “{query}”</p>
          )}
          {filtered.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null;
            lastGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {header && <p className="px-3 pt-2.5 pb-1 text-2xs font-medium text-faint">{header}</p>}
                <button
                  data-index={i}
                  onClick={cmd.action}
                  onMouseMove={() => i !== activeIndex && setActiveIndex(i)}
                  className="relative w-full flex items-center gap-3 px-3 h-10 rounded-[calc(9px*var(--rs))] text-left"
                >
                  <span className={`shrink-0 grid place-items-center w-5 ${i === activeIndex ? 'text-foreground' : 'text-muted-foreground'}`}>{cmd.icon}</span>
                  <span className="flex-1 min-w-0 flex items-baseline gap-2.5">
                    <span className="text-sm text-foreground truncate">{cmd.label}</span>
                    {cmd.description && <span className={`text-xs text-faint truncate ${cmd.mono ? '' : 'font-mono'}`}>{cmd.description}</span>}
                  </span>
                  {i === activeIndex && <CornerDownLeft size={13} className="text-faint shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
