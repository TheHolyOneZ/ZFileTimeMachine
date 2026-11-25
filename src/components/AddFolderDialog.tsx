import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Sheet, SheetHeader, SheetFooter } from './ui/Sheet';
import { Button } from './ui/Button';
import { FolderContentPicker } from './FolderContentPicker';
import { CopyPath } from './ui/CopyPath';
import { DEFAULT_GLOBS } from '@/lib/folderDefaults';

interface Props {
  path: string | null;
  onConfirm: (ignoreGlobs: string[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function AddFolderDialog({ path, onConfirm, onCancel, isLoading }: Props) {
  const [lastPath, setLastPath] = useState(path);
  const [globs, setGlobs] = useState<string[]>(DEFAULT_GLOBS);

  useEffect(() => {
    if (path) {
      setLastPath(path);
      setGlobs(DEFAULT_GLOBS);
    }
  }, [path]);

  const shown = path ?? lastPath ?? '';
  const folderName = shown.split(/[\\/]/).filter(Boolean).pop() ?? shown;

  return (
    <Sheet open={path != null} onClose={onCancel} width={680} label={`Watch ${folderName}`} dismissible={!isLoading}>
      <SheetHeader
        icon={<FolderPlus size={18} />}
        title={<>Watch <span className="text-foreground">{folderName}</span></>}
        description={<CopyPath path={shown} className="text-xs" />}
        onClose={isLoading ? undefined : onCancel}
      />
      <div className="px-6 pt-3 pb-1 overflow-auto">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          Everything ticked gets a first version now, and a new one each time it changes.
        </p>
        {shown && <FolderContentPicker root={shown} globs={globs} onChange={setGlobs} height={300} />}
      </div>
      <SheetFooter className="justify-between">
        <span className="text-xs text-faint">You can change this any time in the folder's settings.</span>
        <div className="flex gap-2">
          <Button onClick={onCancel} disabled={isLoading}>Cancel</Button>
          <Button variant="primary" loading={isLoading} onClick={() => onConfirm(globs)} data-autofocus>
            Start watching
          </Button>
        </div>
      </SheetFooter>
    </Sheet>
  );
}
