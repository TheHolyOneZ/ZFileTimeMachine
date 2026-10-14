import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, HardDrive, Loader2 } from 'lucide-react';
import { useFolders, useAddFolder } from '@/hooks/useFolders';
import { FolderCard } from '@/components/FolderCard';
import { AddFolderDialog } from '@/components/AddFolderDialog';
import { pickFolder } from '@/lib/tauri';
import { useToast } from '@/context/ToastContext';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { FolderConfig } from '@/lib/types';

const DEFAULT_DRAG_DROP_GLOBS = ['node_modules/', 'target/', '.git/', '*.tmp', '*.log'];

const DEFAULT_CONFIG: FolderConfig = {
  trigger: { type: 'OnChange' },
  retention: { type: 'KeepLast', count: 10 },
  ignore_globs: DEFAULT_DRAG_DROP_GLOBS,
  binary_max_mb: 50,
  binary_keep_last: 3,
};

function SkeletonCard() {
  return (
    <div className="flex items-stretch rounded-xl border border-border/40 bg-card/50 animate-pulse overflow-hidden">
      <div className="flex items-center gap-4 px-4 py-4 flex-1">
        <div className="w-11 h-11 rounded-xl bg-secondary/80 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-3.5 bg-secondary rounded-full w-1/3" />
            <div className="h-4 bg-secondary/50 rounded-full w-14" />
          </div>
          <div className="h-2.5 bg-secondary/40 rounded-full w-2/3" />
          <div className="flex items-center gap-3">
            <div className="h-2 bg-secondary/30 rounded-full w-12" />
            <div className="h-2 bg-secondary/30 rounded-full w-10" />
            <div className="h-2 bg-secondary/30 rounded-full w-16" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Folders() {
  const { data: folders, isLoading } = useFolders();
  const addFolder = useAddFolder();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const recentDrops = useRef(new Set<string>());

  const activeCount = folders?.filter(f => !f.paused).length ?? 0;
  const pausedCount = folders?.filter(f =>  f.paused).length ?? 0;
  const totalCount  = folders?.length ?? 0;
  const hasAny      = totalCount > 0;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      if (event.payload.type === 'enter') {
        setIsDragging(true);
      } else if (event.payload.type === 'leave') {
        setIsDragging(false);
      } else if (event.payload.type === 'drop') {
        setIsDragging(false);
        for (const path of event.payload.paths) {

          if (recentDrops.current.has(path)) continue;
          recentDrops.current.add(path);
          setTimeout(() => recentDrops.current.delete(path), 3000);

          const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
          addFolder.mutate(
            { path, config: { ...DEFAULT_CONFIG, ignore_globs: DEFAULT_DRAG_DROP_GLOBS } },
            {
              onError: (e) => toast('error', String(e)),
              onSuccess: (folder) =>
                toast('success', `Now watching "${name}" — common build dirs excluded.`, {
                  action: { label: 'Settings', onClick: () => navigate(`/folder/${folder.id}/settings`) },
                }),
            },
          );
        }
      }
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  async function handleAdd() {
    try {
      const path = await pickFolder();
      if (!path) return;
      setPendingPath(path);
    } catch (e) {
      toast('error', `Could not open folder picker: ${String(e)}`);
    }
  }

  function handleDialogConfirm(ignoreGlobs: string[]) {
    if (!pendingPath) return;
    const path = pendingPath;
    addFolder.mutate(
      { path, config: { ...DEFAULT_CONFIG, ignore_globs: ignoreGlobs } },
      {
        onError: (e) => { toast('error', String(e)); },
        onSuccess: () => {
          const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
          toast('success', `Now watching "${name}".`);
          setPendingPath(null);
        },
      },
    );
  }

  return (
    <div className="flex-1 overflow-auto px-8 py-10 relative">


      {isDragging && (
        <div className="fixed inset-0 z-50 bg-background/85 border-2 border-primary/50 border-dashed
                        flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <FolderPlus size={32} className="text-primary mx-auto mb-3" />
            <p className="text-lg font-semibold text-foreground">Drop to start watching</p>
            <p className="text-sm text-muted-foreground mt-1">Common build folders are ignored. You can change this in folder settings.</p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto animate-fade-in">


        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-[28px] leading-tight font-semibold tracking-tight">Watched folders</h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              {isLoading ? 'Loading…' : hasAny ? (
                <>
                  <span className={`w-1.5 h-1.5 rounded-full ${activeCount > 0 ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <span>
                    {activeCount} watching
                    {pausedCount > 0 && <> · <span className="text-amber-400">{pausedCount} paused</span></>}
                  </span>
                </>
              ) : 'Nothing tracked yet.'}
            </p>
          </div>

          {hasAny && (
            <button
              onClick={handleAdd}
              disabled={addFolder.isPending}
              className="shrink-0 flex items-center gap-2 px-3.5 py-2 text-sm rounded-lg
                         bg-primary text-primary-foreground shadow-button font-medium
                         hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {addFolder.isPending ? <Loader2 size={15} className="animate-spin-slow" /> : <FolderPlus size={15} />}
              {addFolder.isPending ? 'Adding…' : 'Add folder'}
            </button>
          )}
        </div>


        {isLoading && (
          <div>
            <div className="space-y-2.5">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}


        {!isLoading && !hasAny && (
          <div className="flex flex-col items-center text-center py-16 px-6 rounded-xl border border-dashed border-border animate-fade-in">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mb-4">
              <HardDrive size={22} className="text-muted-foreground" />
            </div>
            <p className="font-medium text-foreground">Pick a folder to start keeping history</p>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
              Every time a file in it is saved, a snapshot is stored locally.
              You can rewind any file to any earlier version.
            </p>
            <button
              onClick={handleAdd}
              disabled={addFolder.isPending}
              className="mt-5 flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                         bg-primary text-primary-foreground shadow-button hover:bg-primary/90 disabled:opacity-50"
            >
              {addFolder.isPending ? <Loader2 size={15} className="animate-spin-slow" /> : <FolderPlus size={15} />}
              {addFolder.isPending ? 'Adding…' : 'Add folder'}
            </button>
            <p className="text-xs text-muted-foreground/70 mt-3">or drop a folder anywhere on this window</p>
          </div>
        )}


        {!isLoading && hasAny && (
          <>

            <div className="space-y-2.5">
              {folders!.map((f, i) => (
                <div
                  key={f.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <FolderCard folder={f} />
                </div>
              ))}
            </div>
          </>
        )}

        {addFolder.error && (
          <p className="mt-4 text-sm text-destructive animate-fade-in">{String(addFolder.error)}</p>
        )}
      </div>


      {pendingPath && (
        <AddFolderDialog
          path={pendingPath}
          isLoading={addFolder.isPending}
          onConfirm={handleDialogConfirm}
          onCancel={() => setPendingPath(null)}
        />
      )}
    </div>
  );
}
