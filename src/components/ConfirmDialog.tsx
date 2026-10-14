import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, children, confirmLabel, destructive, onConfirm, onCancel }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={onCancel}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm mx-4 bg-card border border-border rounded-xl shadow-overlay p-5 animate-scale-in"
      >
        <h2 id="confirm-title" className="text-[15px] font-semibold text-foreground">{title}</h2>
        {children && <div className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            className="px-3.5 py-1.5 rounded-lg text-sm text-foreground/80 hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium ${
              destructive
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-primary text-primary-foreground shadow-button hover:bg-primary/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
