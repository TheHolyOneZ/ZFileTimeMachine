import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, HardDrive, Loader2, Activity, Zap, PauseCircle } from 'lucide-react';
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

function SkeletonStatTiles() {
  return (
    <div className="grid grid-cols-4 gap-3 mb-6 animate-pulse">
      <div className="rounded-xl border border-border/30 bg-card/50 h-[86px]" />
      <div className="rounded-xl border border-border/30 bg-card/50 h-[86px]" />
      <div className="col-span-2 rounded-xl border border-border/30 bg-card/50 h-[86px]" />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex items-stretch rounded-xl border border-border/40 bg-card/50 animate-pulse overflow-hidden">
      <div className="w-[3px] bg-secondary/60 shrink-0 rounded-l-xl" />
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
          const name = path.split('/').filter(Boolean).pop() ?? path;
          toast('success', `Now watching "${name}".`);
          setPendingPath(null);
        },
      },
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 relative">


      {isDragging && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-2 border-primary/40 border-dashed
                        flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="w-20 h-20 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center mx-auto mb-4">
              <FolderPlus size={36} className="text-primary" />
            </div>
            <p className="text-lg font-semibold text-primary/90">Drop to start watching</p>
            <p className="text-sm text-primary/50 mt-1">Default ignore patterns applied — adjust in Folder Settings</p>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto animate-fade-in">


        <div className="relative flex items-center justify-between gap-4 mb-6">
          <div className="absolute -top-8 left-0 w-72 h-32 bg-primary/6 rounded-full blur-3xl pointer-events-none" />

          <div className="relative">
            <div className="flex items-center gap-2.5 mb-0.5">
              <h1 className="text-2xl font-bold tracking-tight">Watched Folders</h1>
              {hasAny && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 font-medium">
                  {totalCount}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground/60">
              {isLoading ? 'Loading…' : hasAny ? 'Version history running in the background.' : 'No folders tracked yet — drop one here or click Add Folder.'}
            </p>
          </div>

          <button
            onClick={handleAdd}
            disabled={addFolder.isPending}
            className="relative shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm rounded-xl
                       bg-primary text-primary-foreground font-medium
                       hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                       shadow-[0_0_20px_hsl(217_91%_60%/0.28)]
                       hover:shadow-[0_0_28px_hsl(217_91%_60%/0.40)]
                       transition-all"
          >
            {addFolder.isPending ? <Loader2 size={15} className="animate-spin-slow" /> : <FolderPlus size={15} />}
            {addFolder.isPending ? 'Adding…' : 'Add Folder'}
          </button>
        </div>


        {isLoading && (
          <div>
            <SkeletonStatTiles />
            <div className="space-y-2.5">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          </div>
        )}


        {!isLoading && !hasAny && (
          <div className="flex flex-col items-center justify-center py-16 gap-5 animate-fade-in">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/15 rounded-3xl blur-2xl scale-150 animate-pulse" />
              <div className="relative w-24 h-24 rounded-3xl bg-secondary/60 border border-border/60 flex items-center justify-center">
                <HardDrive size={38} className="text-muted-foreground/30" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center shadow-[0_0_12px_hsl(217_91%_60%/0.3)]">
                <FolderPlus size={16} className="text-primary" />
              </div>
            </div>

            <div className="text-center max-w-xs">
              <p className="font-semibold text-foreground/80 mb-1.5">No folders watched yet</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Add a folder to start capturing automatic file snapshots.
                Every save is versioned — rewind any file to any moment.
              </p>
            </div>

            <button
              onClick={handleAdd}
              disabled={addFolder.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium
                         bg-primary/12 border border-primary/25 text-primary
                         hover:bg-primary/20 hover:border-primary/40 transition-all"
            >
              {addFolder.isPending ? <Loader2 size={14} className="animate-spin-slow" /> : <FolderPlus size={14} />}
              {addFolder.isPending ? 'Adding…' : 'Pick a folder'}
            </button>

            <div className="border-2 border-dashed border-border/25 rounded-xl px-8 py-3 text-xs text-muted-foreground/30">
              or drag &amp; drop a folder anywhere on this window
            </div>
          </div>
        )}


        {!isLoading && hasAny && (
          <>

            <div className="grid grid-cols-4 gap-3 mb-5">


              <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4 flex flex-col justify-between">
                <div className="absolute top-0 inset-x-0 h-[2px] rounded-t-xl bg-emerald-500/50" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">Active</span>
                  <Zap size={12} className="text-emerald-400/50" />
                </div>
                <span className="text-4xl font-bold text-emerald-400/90 leading-none tabular-nums">
                  {activeCount}
                </span>
                <span className="text-[11px] text-muted-foreground/35 mt-2">
                  {activeCount === 1 ? 'folder watching' : 'folders watching'}
                </span>
              </div>


              <div className="relative overflow-hidden rounded-xl border border-border/40 bg-card p-4 flex flex-col justify-between">
                <div className={`absolute top-0 inset-x-0 h-[2px] rounded-t-xl transition-colors ${pausedCount > 0 ? 'bg-amber-400/50' : 'bg-border/30'}`} />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-widest">Paused</span>
                  <PauseCircle size={12} className={pausedCount > 0 ? 'text-amber-400/60' : 'text-muted-foreground/20'} />
                </div>
                <span className={`text-4xl font-bold leading-none tabular-nums ${pausedCount > 0 ? 'text-amber-400/90' : 'text-foreground/20'}`}>
                  {pausedCount}
                </span>
                <span className="text-[11px] text-muted-foreground/35 mt-2">
                  {pausedCount === 1 ? 'folder paused' : 'folders paused'}
                </span>
              </div>


              <div className="col-span-2 relative overflow-hidden rounded-xl border border-emerald-500/15 bg-emerald-500/[0.025] p-4 flex items-center gap-4">
                <div className="absolute top-0 inset-x-0 h-[2px] rounded-t-xl bg-emerald-500/25" />


                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_theme(colors.emerald.500)]" />
                  </div>
                  <div className="absolute inset-0 rounded-full border border-emerald-500/20 animate-ping opacity-40" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-400/90 leading-none mb-1.5">
                    Snapshot Engine Running
                  </p>
                  <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                    {totalCount} folder{totalCount !== 1 ? 's' : ''} protected
                    &nbsp;·&nbsp; changes captured automatically
                  </p>
                </div>

                <Activity size={48} className="shrink-0 text-emerald-500/6 -mr-1" />
              </div>
            </div>


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
