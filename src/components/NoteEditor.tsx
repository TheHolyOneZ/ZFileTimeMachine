import { useState, useRef, useEffect } from 'react';
import { StickyNote } from 'lucide-react';
import { Popover } from './ui/Popover';
import { Button } from './ui/Button';
import { IS_MAC } from '@/lib/platform';

interface Props {
  initialNote: string | null;
  onSave: (note: string | null) => void;
  placeholder?: string;
  label?: string;
  variant?: 'icon' | 'button';
}

export function NoteEditor({ initialNote, onSave, placeholder = 'Write a note…', label = 'Note', variant = 'icon' }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const hasNote = !!initialNote?.trim();

  useEffect(() => {
    if (open) setDraft(initialNote ?? '');
  }, [open, initialNote]);

  function save() {
    const trimmed = draft.trim();
    if (trimmed !== (initialNote ?? '').trim()) onSave(trimmed || null);
    setOpen(false);
  }

  return (
    <>
      {variant === 'button' ? (
        <Button
          ref={btnRef}
          size="sm"
          variant={hasNote ? 'secondary' : 'ghost'}
          icon={<StickyNote size={13} fill={hasNote ? 'currentColor' : 'none'} fillOpacity={0.18} />}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          {hasNote ? 'Edit note' : 'Add note'}
        </Button>
      ) : (
        <button
          ref={btnRef}
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          aria-label={hasNote ? 'Edit note' : 'Add note'}
          data-tip={hasNote ? 'Edit note' : 'Add note'}
          className={`press w-6 h-6 rounded-[calc(6px*var(--rs))] grid place-items-center shrink-0
                      ${hasNote ? 'text-foreground/80 hover:bg-foreground/[0.07]' : 'text-faint hover:text-foreground hover:bg-foreground/[0.07]'}`}
        >
          <StickyNote size={13} fill={hasNote ? 'currentColor' : 'none'} fillOpacity={0.18} />
        </button>
      )}

      <Popover open={open} onClose={save} onEscape={() => setOpen(false)} anchorRef={btnRef} width={300} estimatedHeight={210}>
        <div className="p-3">
          <div className="flex items-center justify-between mb-2 px-0.5">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <span className="text-2xs text-faint">{IS_MAC ? '⌘' : 'Ctrl'} ↵ to save</span>
          </div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
            }}
            placeholder={placeholder}
            rows={4}
            className="field !h-auto py-2 text-sm leading-relaxed resize-none"
          />
          <div className="flex items-center gap-2 mt-2.5">
            {hasNote && (
              <Button size="sm" variant="quiet-danger" onClick={() => { onSave(null); setOpen(false); }}>
                Remove
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => { setDraft(initialNote ?? ''); setOpen(false); }}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save}>Save</Button>
          </div>
        </div>
      </Popover>
    </>
  );
}
