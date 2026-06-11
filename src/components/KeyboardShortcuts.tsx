import { createPortal } from 'react-dom';
import { X, Keyboard } from 'lucide-react';

const SHORTCUTS = [
  { key: '?', desc: 'Show keyboard shortcuts' },
  { key: 'Esc', desc: 'Close any open popup or dialog' },
  { key: 'Enter', desc: 'Open/activate focused item' },
  { key: 'Right-click', desc: 'Open context menu on folder, file, or snapshot' },
  { key: 'Ctrl+F / ⌘F', desc: 'Focus search bar' },
];

interface Props { onClose: () => void }

export function KeyboardShortcuts({ onClose }: Props) {
  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-card/98 border border-border/60 rounded-xl w-full max-w-sm overflow-hidden
                      shadow-[0_24px_80px_rgba(0,0,0,0.7),0_0_0_1px_rgba(255,255,255,0.04)] animate-scale-in">
        <div className="flex items-center justify-between px-4 py-3 bg-secondary/30 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Keyboard size={13} className="text-primary/70" />
            <span className="text-sm font-semibold">Keyboard shortcuts</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors">
            <X size={13} />
          </button>
        </div>
        <div className="p-4 space-y-1">
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <kbd className="shrink-0 px-2 py-0.5 text-[11px] font-mono bg-secondary/60 border border-border/60 rounded-md text-foreground/70 min-w-[2rem] text-center">
                {key}
              </kbd>
              <span className="text-xs text-muted-foreground/70">{desc}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 border-t border-border/40 bg-secondary/10">
          <p className="text-[10px] text-muted-foreground/40">Press <kbd className="px-1 font-mono bg-secondary/60 border border-border/60 rounded text-[10px]">?</kbd> or <kbd className="px-1 font-mono bg-secondary/60 border border-border/60 rounded text-[10px]">Esc</kbd> to close</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
