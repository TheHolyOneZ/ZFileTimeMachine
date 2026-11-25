import type { ReactNode } from 'react';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel = 'Cancel', destructive, loading, icon, onConfirm, onCancel }: Props) {
  return (
    <Sheet open={open} onClose={onCancel} width={400} label={title} role="alertdialog" dismissible={!loading}>
      <div className="px-6 pt-6 pb-5">
        {icon && (
          <div className={`w-11 h-11 rounded-[calc(12px*var(--rs))] grid place-items-center mb-4
                           ${destructive ? 'bg-destructive/12 text-destructive' : 'bg-foreground/[0.06] text-foreground/80'}`}>
            {icon}
          </div>
        )}
        <h2 className="text-md font-semibold text-foreground leading-snug">{title}</h2>
        {children && <div className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{children}</div>}
      </div>
      <div className="flex justify-end gap-2 px-6 pb-5">
        <Button onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} data-autofocus>
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
