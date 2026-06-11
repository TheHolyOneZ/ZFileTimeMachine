import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, Folder, Settings2 } from 'lucide-react';
import { useFolders } from '@/hooks/useFolders';
import type { Folder as FolderType } from '@/lib/types';

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  description?: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: folders } = useFolders();

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!open) return null;

  const commands: Command[] = [
    {
      id: 'settings',
      label: 'Open Settings',
      icon: <Settings2 size={14} />,
      action: () => { navigate('/settings'); onClose(); },
    },
    {
      id: 'home',
      label: 'Go to Folders',
      icon: <Folder size={14} />,
      action: () => { navigate('/'); onClose(); },
    },

    ...(folders ?? []).map((f: FolderType) => ({
      id: `folder-${f.id}`,
      label: f.displayName,
      description: f.path,
      icon: <Folder size={14} />,
      action: () => { navigate(`/folder/${f.id}`); onClose(); },
    })),
  ];

  const filtered = query
    ? commands.filter((c) =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.description?.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIndex]?.action();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg bg-card/98 backdrop-blur-sm border border-border/60 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden"
        onKeyDown={handleKeyDown}
      >

        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
          <Search size={15} className="text-muted-foreground/60 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            placeholder="Search commands…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/40"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-muted-foreground/40 hover:text-foreground">
              <X size={14} />
            </button>
          )}
          <kbd className="text-[10px] text-muted-foreground/40 border border-border/40 rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-8">No commands found</p>
          )}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              onClick={cmd.action}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors group ${
                i === activeIndex ? 'bg-secondary/80' : 'hover:bg-secondary/60'
              }`}
            >
              <span className="text-muted-foreground/60 group-hover:text-foreground shrink-0">{cmd.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground">{cmd.label}</p>
                {cmd.description && (
                  <p className="text-xs text-muted-foreground/40 truncate font-mono">{cmd.description}</p>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border/40 bg-secondary/20 flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/40">
            <kbd className="border border-border/40 rounded px-1">↑↓</kbd> navigate
            <kbd className="border border-border/40 rounded px-1 ml-2">↵</kbd> select
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
