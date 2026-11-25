import { useLayoutEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { FolderPlus, ArrowRight, RotateCcw, Trash2, History } from 'lucide-react';
import { ago } from '@/lib/time';
import { useFolders } from '@/hooks/useFolders';
import { useAddFolderFlow } from '@/context/AddFolderContext';
import { FolderCard } from '@/components/FolderCard';
import { FolderIcon } from '@/components/FolderIcon';
import { FileIcon } from '@/components/ui/FileIcon';
import { Button } from '@/components/ui/Button';
import SplitText from '@/components/reactbits/SplitText';
import { listActivityLog, listFiles } from '@/lib/tauri';
import { folderTint } from '@/lib/folderAppearance';
import { gsap, dur } from '@/lib/motion';
import type { ActivityEntry, Folder } from '@/lib/types';

const SHOWN_ACTIONS = new Set(['snapshot_created', 'rewind', 'file_deleted']);

function verb(action: string, reason: string | null) {
  if (action === 'rewind') return 'Restored';
  if (action === 'file_deleted') return 'Deleted';
  if (reason === 'manual') return 'Saved by hand';
  if (reason === 'pre-rewind') return 'Kept before a restore';
  if (reason === 'interval') return 'Saved on schedule';
  if (reason === 'initial') return 'First version';
  return 'Saved';
}

function EmptyState() {
  const { startAddFolder, isAdding } = useAddFolderFlow();
  return (
    <div className="flex-1 grid place-items-center px-10 pb-10">
      <div className="max-w-[520px] text-center flex flex-col items-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 -m-8 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="relative w-16 h-16 rounded-[calc(18px*var(--rs))] bg-surface-raised shadow-card grid place-items-center text-primary">
            <History size={28} strokeWidth={1.5} />
          </div>
        </div>
        <SplitText
          text="Every version of your files, kept."
          tag="h1"
          className="text-3xl font-semibold tracking-tight text-foreground"
          splitType="words"
          effect="blur"
          trigger="load"
          delay={70}
          duration={0.9}
        />
        <p className="text-base text-muted-foreground mt-4 leading-relaxed max-w-[440px] animate-fade-in [text-wrap:balance]" style={{ animationDelay: '0.45s' }}>
          Pick a folder. Each time a file in it is saved, ZFileTimeMachine keeps a copy on this computer,
          so you can go back to any earlier version.
        </p>
        <div className="flex flex-col items-center gap-3 mt-8 animate-fade-in" style={{ animationDelay: '0.6s' }}>
          <Button variant="primary" size="lg" icon={<FolderPlus size={16} />} onClick={startAddFolder} loading={isAdding}>
            Choose a folder
          </Button>
          <span className="text-xs text-faint">or drop one anywhere on this window</span>
        </div>
      </div>
    </div>
  );
}

function RecentChanges({ folders, activity }: { folders: Folder[]; activity: (ActivityEntry[] | undefined)[] }) {
  const navigate = useNavigate();
  const listRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const loaded = activity.every((a) => a != null);

  const items = useMemo(() => {
    const all = activity.flatMap((a) => a ?? []).filter((e) => SHOWN_ACTIONS.has(e.action) && e.relPath);
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, 12);
  }, [activity]);

  useLayoutEffect(() => {
    if (!loaded || !listRef.current) return;
    gsap.fromTo(listRef.current.children, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: dur(0.5), stagger: 0.03, ease: 'zftm', delay: 0.15 });
  }, [loaded]);

  return (
    <section>
      <h2 className="text-md font-semibold mb-3">Recent changes</h2>
      <div className="rounded-xl bg-card shadow-card overflow-hidden">
        {!loaded && (
          <div className="p-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 h-11 px-3">
                <div className="skeleton w-4 h-4" />
                <div className="skeleton h-3" style={{ width: `${22 + i * 9}%` }} />
                <div className="flex-1" />
                <div className="skeleton h-3 w-16" />
              </div>
            ))}
          </div>
        )}
        {loaded && items.length === 0 && (
          <p className="text-sm text-muted-foreground px-4 py-8 text-center">Nothing changed yet. Edit a file in a watched folder and it shows up here.</p>
        )}
        <div ref={listRef} className="p-1.5">
          {loaded && items.map((e) => {
            const folder = byId.get(e.folderId);
            if (!folder) return null;
            const name = e.relPath!.split('/').pop()!;
            const dir = e.relPath!.includes('/') ? e.relPath!.slice(0, e.relPath!.lastIndexOf('/')) : '';
            const Glyph = e.action === 'rewind' ? RotateCcw : e.action === 'file_deleted' ? Trash2 : null;
            return (
              <button
                key={`${e.folderId}-${e.id}`}
                onClick={() => navigate(`/folder/${e.folderId}?file=${encodeURIComponent(e.relPath!)}`)}
                className="invisible group w-full flex items-center gap-3 h-11 px-3 rounded-[calc(9px*var(--rs))] text-left hover:bg-foreground/[0.045]"
              >
                <FileIcon path={e.relPath!} size={15} className="text-muted-foreground" />
                <span className="min-w-0 flex-1 flex items-baseline gap-2">
                  <span className="text-sm text-foreground truncate shrink-0 max-w-[45%]">{name}</span>
                  {dir && <span className="text-xs text-faint truncate">{dir}</span>}
                </span>
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0 max-w-[160px]">
                  <FolderIcon name={folder.config.icon} size={12} {...folderTint(folder.config.color)} />
                  <span className="truncate">{folder.displayName}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 w-[150px] justify-end text-xs text-muted-foreground shrink-0">
                  {Glyph && <Glyph size={11} className={e.action === 'file_deleted' ? 'text-negative' : 'text-primary'} />}
                  <span className="truncate">{verb(e.action, e.reason)}</span>
                </span>
                <time className="w-[112px] text-right text-xs text-faint shrink-0 tabular-nums whitespace-nowrap" title={new Date(e.timestamp).toLocaleString()}>
                  {ago(e.timestamp)}
                </time>
                <ArrowRight size={13} className="text-faint opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-300 ease-zftm shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Overview() {
  const { data: folders, isLoading } = useFolders();
  const { startAddFolder, isAdding } = useAddFolderFlow();
  const gridRef = useRef<HTMLDivElement>(null);

  const filesQ = useQueries({
    queries: (folders ?? []).map((f) => ({ queryKey: ['files', f.id], queryFn: () => listFiles(f.id), staleTime: 10_000 })),
  });
  const activityQ = useQueries({
    queries: (folders ?? []).map((f) => ({ queryKey: ['activity', f.id, 'overview'], queryFn: () => listActivityLog(f.id, 400), staleTime: 10_000 })),
  });

  const watching = folders?.filter((f) => !f.paused).length ?? 0;
  const paused = (folders?.length ?? 0) - watching;
  const totalVersions = filesQ.every((q) => q.data)
    ? filesQ.reduce((s, q) => s + (q.data ?? []).reduce((t, f) => t + f.snapshotCount, 0), 0)
    : null;

  useLayoutEffect(() => {
    if (!gridRef.current || !folders?.length) return;
    gsap.fromTo(gridRef.current.children, { autoAlpha: 0, y: 12, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.6), stagger: 0.05, ease: 'zftm', clearProps: 'transform' });
  }, [folders?.length]);

  if (!isLoading && folders && folders.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <div data-tauri-drag-region className="h-12 shrink-0" />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header data-tauri-drag-region className="shrink-0 flex items-center gap-4 px-8 pt-10 pb-6">
        <div data-tauri-drag-region className="flex-1 min-w-0">
          <h1 data-tauri-drag-region className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p data-tauri-drag-region className="text-sm text-muted-foreground mt-1.5">
            {isLoading ? <span className="skeleton inline-block w-48 h-3.5 align-middle" /> : (
              <>
                {watching} {watching === 1 ? 'folder' : 'folders'} watching{paused > 0 && <>, {paused} paused</>}.
                {totalVersions != null && <span className="text-faint"> {totalVersions.toLocaleString()} versions kept.</span>}
              </>
            )}
          </p>
        </div>
        <Button variant="primary" icon={<FolderPlus size={15} />} onClick={startAddFolder} loading={isAdding}>
          Add folder
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 pb-10 scroll-fade-y">
        <div className="max-w-[1100px] mx-auto space-y-9 pt-1">
          <div ref={gridRef} className="grid gap-4 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
            {isLoading && [0, 1].map((i) => <div key={i} className="h-[178px] rounded-xl bg-card shadow-card p-4"><div className="skeleton w-10 h-10 rounded-[calc(11px*var(--rs))]" /></div>)}
            {folders?.map((f, i) => (
              <FolderCard key={f.id} folder={f} files={filesQ[i]?.data} activity={activityQ[i]?.data} />
            ))}
          </div>
          {folders && folders.length > 0 && <RecentChanges folders={folders} activity={activityQ.map((q) => q.data)} />}
        </div>
      </div>
    </div>
  );
}
