import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Settings2, History, Pause, Play, Search, X, FileText, StickyNote, Activity, FolderX, ArrowLeft, MousePointerClick,
} from 'lucide-react';
import { format } from 'date-fns';
import { useFolders, useToggleFolderPause } from '@/hooks/useFolders';
import { useFiles, useSearchNotes } from '@/hooks/useTimeline';
import { FolderIcon } from '@/components/FolderIcon';
import { folderTint } from '@/lib/folderAppearance';
import { CopyPath } from '@/components/ui/CopyPath';
import { FileTree } from '@/components/FileTree';
import { HistoryPane } from '@/components/HistoryPane';
import { ScanProgress } from '@/components/ScanProgress';
import { ActivityFeed } from '@/components/ActivityFeed';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Segmented } from '@/components/ui/Segmented';
import { Button, IconButton } from '@/components/ui/Button';
import { FileIcon } from '@/components/ui/FileIcon';
import { useToast } from '@/context/ToastContext';
import { gsap, dur } from '@/lib/motion';
import type { FileEntry } from '@/lib/types';

type Tab = 'files' | 'activity' | 'notes';

function NotesTab({ folderId, onOpenFile }: { folderId: number; onOpenFile: (fileId: number) => void }) {
  const [query, setQuery] = useState('');
  const { data: hits, isFetching } = useSearchNotes(folderId, query);
  const listRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!listRef.current || !hits?.length) return;
    gsap.fromTo(listRef.current.children, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, stagger: 0.03, duration: dur(0.4), ease: 'zftm' });
  }, [hits]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 pt-4 pb-3 shrink-0">
        <div className="relative max-w-[560px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes on files and versions"
            className="field !h-9 pl-9 text-sm"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-8 scroll-fade-y">
        {!query.trim() && (
          <div className="max-w-[420px] pt-10 mx-auto text-center">
            <StickyNote size={22} className="mx-auto text-faint mb-3" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Notes you add to files or versions show up here. Add one from a file's history with the note button.
            </p>
          </div>
        )}
        {query.trim() && !isFetching && hits?.length === 0 && (
          <p className="text-sm text-muted-foreground pt-8 text-center">No notes match “{query}”.</p>
        )}
        <div ref={listRef} className="max-w-[760px] space-y-2">
          {hits?.map((hit) => {
            const fileId = hit.kind === 'file' ? hit.id : hit.fileId;
            return (
              <button
                key={`${hit.kind}-${hit.id}`}
                onClick={() => fileId != null && onOpenFile(fileId)}
                className="press group w-full text-left p-4 rounded-xl bg-card shadow-card hover:shadow-card-hover transition-shadow"
              >
                <div className="flex items-center gap-2.5">
                  <FileIcon path={hit.label} size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium truncate flex-1">{hit.label}</span>
                  <span className="text-2xs text-faint shrink-0">
                    {hit.kind === 'snapshot' && hit.createdAt ? `Version from ${format(new Date(hit.createdAt), 'MMM d, HH:mm')}` : 'Note on the file'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed whitespace-pre-wrap line-clamp-3">{hit.note}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NoSelection({ files }: { files: FileEntry[] }) {
  const versions = files.reduce((s, f) => s + f.snapshotCount, 0);
  return (
    <div className="flex-1 grid place-items-center px-8">
      <div className="text-center max-w-[300px]">
        <MousePointerClick size={22} className="mx-auto text-faint mb-3" />
        <p className="text-sm text-muted-foreground">Pick a file to see its history.</p>
        <p className="text-xs text-faint mt-1.5">{files.length.toLocaleString()} files, {versions.toLocaleString()} versions in this folder.</p>
      </div>
    </div>
  );
}

export function FolderDetail() {
  const { id } = useParams<{ id: string }>();
  const folderId = id ? parseInt(id, 10) : undefined;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();

  const { data: folders, isLoading: foldersLoading } = useFolders();
  const folder = folders?.find((f) => f.id === folderId);
  const { data: files, isLoading, error } = useFiles(folderId);
  const togglePause = useToggleFolderPause();

  const [tab, setTab] = useState<Tab>('files');
  const [filter, setFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const requestedPath = params.get('file');

  useEffect(() => {
    if (!files) return;
    if (requestedPath) {
      const match = files.find((f) => f.relPath === requestedPath);
      if (match) { setSelectedId(match.id); setTab('files'); }
      setParams((p) => { p.delete('file'); return p; }, { replace: true });
      return;
    }
    if (selectedId != null && files.some((f) => f.id === selectedId)) return;
    const recent = [...files].filter((f) => f.lastSnapshotAt != null).sort((a, b) => (b.lastSnapshotAt ?? 0) - (a.lastSnapshotAt ?? 0))[0];
    setSelectedId(recent?.id ?? null);
  }, [files, requestedPath]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    gsap.fromTo(el, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: dur(0.38), ease: 'zftm', clearProps: 'transform' });
  }, [tab]);

  const selectedFile = useMemo(() => files?.find((f) => f.id === selectedId) ?? null, [files, selectedId]);
  const totalVersions = files?.reduce((s, f) => s + f.snapshotCount, 0) ?? 0;

  if (!foldersLoading && !folder) {
    return (
      <div className="flex-1 grid place-items-center p-8">
        <div className="text-center">
          <FolderX size={26} className="mx-auto text-faint mb-3" />
          <p className="text-md font-medium">This folder isn't being watched</p>
          <p className="text-sm text-muted-foreground mt-1">It may have been removed.</p>
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-primary mt-4 hover:underline">
            <ArrowLeft size={13} />Back to the overview
          </Link>
        </div>
      </div>
    );
  }
  const isPaused = folder?.paused ?? false;

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="shrink-0 flex items-center gap-3.5 pl-6 pt-5 pb-4"
        style={{ paddingRight: 'max(1.25rem, var(--controls-space))' }}
      >
        <div className="w-11 h-11 rounded-[calc(12px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0">
          {folder ? <FolderIcon name={folder.config.icon} size={20} {...folderTint(folder.config.color)} /> : <div className="skeleton w-5 h-5" />}
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-0">
          <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-xl font-semibold truncate">{folder?.displayName ?? <span className="skeleton inline-block w-40 h-5 align-middle" />}</h1>
            {folder && (
              <span className={`shrink-0 inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-2xs font-medium
                                ${isPaused ? 'bg-foreground/[0.06] text-muted-foreground' : 'bg-positive/10 text-positive'}`}>
                {isPaused ? <Pause size={10} /> : <span className="live-dot w-1.5 h-1.5 rounded-full bg-positive" />}
                {isPaused ? 'Paused' : 'Watching'}
              </span>
            )}
          </div>
          <div className="mt-1 flex min-w-0"><CopyPath path={folder?.path ?? ''} className="text-xs" /></div>
        </div>
        {folderId != null && (
          <div className="flex items-center gap-1.5 shrink-0">
            <IconButton
              label={isPaused ? 'Resume watching' : 'Pause watching'}
              disabled={togglePause.isPending || !folder}
              onClick={() => folder && togglePause.mutate(
                { id: folder.id, paused: !isPaused },
                { onSuccess: () => toast('info', isPaused ? `Watching ${folder.displayName} again.` : `Paused ${folder.displayName}. Nothing is saved until you resume.`) },
              )}
            >
              {isPaused ? <Play size={16} /> : <Pause size={16} />}
            </IconButton>
            <IconButton label="Folder settings" onClick={() => navigate(`/folder/${folderId}/settings`)}>
              <Settings2 size={16} />
            </IconButton>
            <Button icon={<History size={14} />} onClick={() => navigate(`/folder/${folderId}/recover`)} className="ml-1">
              Recover files
            </Button>
          </div>
        )}
      </header>

      <div className="shrink-0 flex items-center gap-4 px-6 pb-3">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          ariaLabel="Folder views"
          options={[
            { value: 'files', label: 'Files', icon: <FileText size={13} />, count: files?.length },
            { value: 'activity', label: 'Activity', icon: <Activity size={13} /> },
            { value: 'notes', label: 'Notes', icon: <StickyNote size={13} /> },
          ]}
        />
        <div className="flex-1" />
        {files && files.length > 0 && (
          <span className="text-xs text-faint tabular-nums">{totalVersions.toLocaleString()} versions kept</span>
        )}
      </div>

      {folderId != null && <ScanProgress folderId={folderId} />}

      <div ref={contentRef} className="flex-1 min-h-0 flex border-t border-[hsl(var(--line))]">
        {tab === 'files' && (
          <ErrorBoundary label="Files">
            <aside className="w-[292px] shrink-0 flex flex-col border-r border-[hsl(var(--line))] bg-surface-sunken/40">
              <div className="p-2.5 shrink-0">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setFilter(''); }}
                    placeholder="Filter files"
                    className="field !h-8 pl-8 pr-7 text-sm"
                    aria-label="Filter files"
                  />
                  {filter && (
                    <button onClick={() => setFilter('')} aria-label="Clear filter" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full text-faint hover:text-foreground hover:bg-foreground/[0.08]">
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
              {isLoading ? (
                <div className="px-3 space-y-1">
                  {[60, 42, 75, 50, 66, 38].map((w, i) => (
                    <div key={i} className="flex items-center gap-2 h-[30px] px-2">
                      <div className="skeleton w-4 h-4" />
                      <div className="skeleton h-3" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <p className="m-3 p-3 rounded-lg bg-negative/10 text-sm text-negative">Couldn't load the files: {String(error)}</p>
              ) : (
                <FileTree
                  folderId={folderId!}
                  files={files ?? []}
                  filter={filter}
                  selectedId={selectedId}
                  onSelect={(f) => setSelectedId(f.id)}
                />
              )}
            </aside>
            {selectedFile ? <HistoryPane key={folderId} file={selectedFile} folderPath={folder?.path ?? ''} /> : files && <NoSelection files={files} />}
          </ErrorBoundary>
        )}

        {tab === 'activity' && folderId != null && (
          <ActivityFeed
            folderId={folderId}
            onOpenFile={(relPath) => {
              const f = files?.find((x) => x.relPath === relPath);
              if (f) { setSelectedId(f.id); setTab('files'); }
            }}
          />
        )}

        {tab === 'notes' && folderId != null && (
          <NotesTab folderId={folderId} onOpenFile={(fid) => { setSelectedId(fid); setTab('files'); }} />
        )}
      </div>

      {isPaused && (
        <div className="shrink-0 flex items-center gap-3 px-6 h-10 border-t border-[hsl(var(--line))] bg-foreground/[0.025] text-xs text-muted-foreground">
          <Pause size={12} className="shrink-0" />
          <span className="flex-1">Watching is paused. Changes to files in this folder aren't saved until you resume.</span>
          <button
            onClick={() => folder && togglePause.mutate({ id: folder.id, paused: false })}
            className="press inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs font-medium text-foreground hover:bg-foreground/[0.07]"
          >
            <Play size={11} />Resume
          </button>
        </div>
      )}
    </div>
  );
}
