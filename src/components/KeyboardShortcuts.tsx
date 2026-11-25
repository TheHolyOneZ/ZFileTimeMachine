import { Keyboard } from 'lucide-react';
import { Sheet, SheetHeader } from './ui/Sheet';
import { IS_MAC } from '@/lib/platform';

const MOD = IS_MAC ? '⌘' : 'Ctrl';

const SHORTCUTS: { keys: string[]; desc: string }[] = [
  { keys: [MOD, 'K'], desc: 'Search files, folders and actions' },
  { keys: [MOD, 'B'], desc: 'Show or hide the sidebar' },
  { keys: ['↑', '↓'], desc: 'Move through files and versions' },
  { keys: ['↵'], desc: 'Restore the selected version' },
  { keys: [MOD, 'F'], desc: 'Find in a comparison' },
  { keys: [MOD, '↵'], desc: 'Save a note' },
  { keys: [MOD, 'S'], desc: 'Save changed settings' },
  { keys: [MOD, 'A'], desc: 'Select every file when recovering' },
  { keys: ['Esc'], desc: 'Close a dialog or menu' },
  { keys: ['Right-click'], desc: 'More actions for a folder, file or version' },
  { keys: ['?'], desc: 'Show this list' },
];

export function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} width={420} label="Keyboard shortcuts">
      <SheetHeader icon={<Keyboard size={18} />} title="Keyboard shortcuts" onClose={onClose} />
      <div className="px-6 pt-2 pb-6">
        {SHORTCUTS.map(({ keys, desc }) => (
          <div key={desc} className="flex items-center justify-between gap-4 py-2 border-b border-[hsl(var(--line))] last:border-0">
            <span className="text-sm text-muted-foreground">{desc}</span>
            <span className="flex gap-1 shrink-0">
              {keys.map((k) => (
                <kbd key={k} className="min-w-[24px] h-6 px-1.5 grid place-items-center rounded-[calc(6px*var(--rs))] text-xs font-sans text-foreground/85
                                        bg-foreground/[0.06] shadow-[inset_0_-1px_0_hsl(var(--line-strong)),inset_0_0_0_1px_hsl(var(--line))]">
                  {k}
                </kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
