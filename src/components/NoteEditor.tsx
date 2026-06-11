import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Pencil, Check, X } from 'lucide-react';
import { computePopupPos, type PopupPos } from '@/lib/popup';

interface Props {
  initialNote: string | null;
  onSave: (note: string | null) => void;
  placeholder?: string;
}

export function NoteEditor({ initialNote, onSave, placeholder = 'Add a note…' }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pos, setPos] = useState<PopupPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const hasNote = !!(initialNote?.trim());

  function openPopup(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (!btnRef.current) return;
    setPos(computePopupPos(btnRef.current.getBoundingClientRect(), 300, 220));
    setDraft(initialNote ?? '');
    setEditing(!hasNote);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setEditing(false);
  }

  function save() {
    const trimmed = draft.trim();
    onSave(trimmed || null);
    close();
  }

  useEffect(() => {
    if (!open) setDraft(initialNote ?? '');
  }, [initialNote, open]);

  useEffect(() => {
    if (!open) return;
    function onPD(e: PointerEvent) {
      if (!popupRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('pointerdown', onPD);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPD); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={openPopup}
        className={`p-1 rounded transition-colors shrink-0 ${
          hasNote
            ? 'text-amber-400/80 hover:text-amber-300'
            : 'text-muted-foreground/25 hover:text-muted-foreground/60'
        }`}
        title={hasNote ? 'View / edit note' : 'Add note'}
      >
        <MessageSquare size={12} fill={hasNote ? 'currentColor' : 'none'} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popupRef}
          style={{
            position: 'fixed',
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            width: 300,
            maxHeight: pos.maxHeight,
            zIndex: 9999,
          }}
          className="bg-card border border-border/70 rounded-xl shadow-2xl animate-scale-in overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >

          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary/30">
            <span className="text-[11px] font-semibold text-muted-foreground/80 flex items-center gap-1.5">
              <MessageSquare size={10} className="text-amber-400/70" />
              {editing ? (hasNote ? 'Edit note' : 'New note') : 'Note'}
            </span>
            <div className="flex items-center gap-0.5">
              {!editing && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditing(true); }}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground/40 hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil size={10} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); close(); }}
                className="p-1 rounded hover:bg-secondary text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          </div>


          <div className="p-3">
            {editing ? (
              <>
                <textarea
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
                    if (e.key === 'Escape') close();
                  }}
                  placeholder={placeholder}
                  className="w-full bg-secondary/40 border border-border/40 rounded-lg px-2.5 py-2 text-xs
                             focus:outline-none focus:ring-1 focus:ring-amber-500/40 resize-none
                             placeholder:text-muted-foreground/30 text-foreground/90 transition-colors
                             focus:border-amber-500/40"
                  rows={4}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); save(); }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30
                               text-amber-400 text-xs border border-amber-500/20 transition-colors"
                  >
                    <Check size={10} />Save
                  </button>
                  {hasNote && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSave(null); close(); }}
                      className="px-2 py-1 rounded-md text-xs text-muted-foreground/50 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground/30">Ctrl+↵</span>
                </div>
              </>
            ) : (
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap min-h-[2rem]">
                {initialNote}
              </p>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
