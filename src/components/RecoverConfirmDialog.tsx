import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

interface Props {
  open: boolean;
  fileCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

export function RecoverConfirmDialog({ open, fileCount, onConfirm, onCancel }: Props) {
  const [typed, setTyped] = useState('');
  const ready = typed.trim().toUpperCase() === 'RESTORE';
  const files = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;

  useEffect(() => { if (open) setTyped(''); }, [open]);

  return (
    <Sheet open={open} onClose={onCancel} width={440} label="Restore in place" role="alertdialog">
      <div className="px-6 pt-6">
        <div className="w-11 h-11 rounded-[calc(12px*var(--rs))] bg-destructive/12 text-destructive grid place-items-center mb-4">
          <TriangleAlert size={20} />
        </div>
        <h2 className="text-md font-semibold">Replace {files} in place?</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          Each file on disk is overwritten with the version you picked. Before that, its current content is saved as a new version,
          so you can go back from the file's history.
        </p>
        <label htmlFor="restore-confirm" className="block text-xs text-muted-foreground mt-5 mb-2">
          Type <span className="font-mono font-semibold text-foreground">RESTORE</span> to confirm
        </label>
        <input
          id="restore-confirm"
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ready) onConfirm(); }}
          placeholder="RESTORE"
          spellCheck={false}
          className="field font-mono tracking-wide"
        />
      </div>
      <div className="flex justify-end gap-2 px-6 py-5">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} disabled={!ready}>Replace {files}</Button>
      </div>
    </Sheet>
  );
}
