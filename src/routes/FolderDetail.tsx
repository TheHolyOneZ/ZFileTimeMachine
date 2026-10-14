import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, Settings2, RefreshCw, FolderX, Loader2, Search, X,
  MessageSquare, FileText, ArrowRight, Camera, Zap, Activity,
  RotateCcw, History, PauseCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { useFolders } from '@/hooks/useFolders';
import { FolderIcon } from '@/components/FolderIcon';
import { getColor } from '@/lib/folderAppearance';
import { useFiles, useSearchNotes, useDiff, useRewind, useSnapshots } from '@/hooks/useTimeline';
import { FolderBrowser } from '@/components/FolderBrowser';
import { ScanProgress } from '@/components/ScanProgress';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { InfoTooltip } from '@/components/InfoTooltip';
import { ActivityFeed } from '@/components/ActivityFeed';
import { RewindDialog } from '@/components/RewindDialog';
import { useLiveEvents } from '@/hooks/useLiveEvents';
import { useToast } from '@/context/ToastContext';
import { formatPath } from '@/lib/tauri';
import type { NoteHit } from '@/lib/types';

function FileListSkeleton() {
  return (
    <div className="animate-pulse p-2 space-y-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
          <div className="w-3 h-3 rounded bg-secondary shrink-0" />
          <div className="w-3 h-3 rounded bg-secondary shrink-0" />
          <div className="h-3 bg-secondary rounded" style={{ width: `${30 + (i * 17) % 40}%` }} />
        </div>
      ))}
    </div>
  );
}


interface NoteRewindProps {
  snapshotId: number;
  fileId: number;
  onClose: () => void;
}

function NoteRewindConnector({ snapshotId, fileId, onClose }: NoteRewindProps) {
  const { data: snapshots } = useSnapshots(fileId);
  const { data: diff } = useDiff(snapshotId, true);
  const rewind = useRewind();
  const { toast } = useToast();

  const snapshot = snapshots?.find((s) => s.id === snapshotId);

  if (!snapshot) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-3">
          <Loader2 size={16} className="animate-spin-slow text-primary" />
          <span className="text-sm text-muted-foreground">Loading snapshot…</span>
        </div>
      </div>
    );
  }

  return (
    <RewindDialog
      snapshot={snapshot}
      diff={diff}
      isPending={rewind.isPending}
      onCancel={onClose}
      onConfirm={(autoSave) => {
        rewind.mutate(
          { snapshotId: snapshot.id, autoSaveCurrent: autoSave },
          {
            onSuccess: () => { toast('success', 'File rewound successfully'); onClose(); },
            onError: (e) => toast('error', `Rewind failed: ${String(e)}`),
          },
        );
      }}
    />
  );
}

export function FolderDetail() {
  useLiveEvents();

  const { id } = useParams<{ id: string }>();
  const folderId = id ? parseInt(id, 10) : undefined;
  const navigate = useNavigate();

  const { data: folders, isLoading: foldersLoading } = useFolders();
  const folder = folders?.find((f) => f.id === folderId);

  const { data: files, isLoading, refetch, isFetching, error } = useFiles(folderId);

  const [fileSearch, setFileSearch] = useState('');
  const [searchTab, setSearchTab] = useState<'files' | 'notes' | 'activity'>('files');
  const [noteQuery, setNoteQuery] = useState('');
  const { data: noteHits } = useSearchNotes(folderId, noteQuery);
  const [jumpFileId, setJumpFileId] = useState<number | null>(null);
  const [rewindTarget, setRewindTarget] = useState<{ snapshotId: number; fileId: number } | null>(null);

  const totalSnapshots = files?.reduce((s, f) => s + f.snapshotCount, 0) ?? 0;

  function jumpToFile(fileId: number) {
    setJumpFileId(fileId);
    setSearchTab('files');
  }

  function handleNoteHitRewind(hit: NoteHit) {
    if (hit.kind === 'snapshot' && hit.fileId != null) {
      setRewindTarget({ snapshotId: hit.id, fileId: hit.fileId });
    }
  }

  if (!foldersLoading && !folder) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground p-8 animate-fade-in">
        <div className="w-16 h-16 rounded-xl bg-secondary/50 border border-border flex items-center justify-center">
          <FolderX size={28} className="opacity-30" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Folder not found</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">It may have been removed or never existed</p>
        </div>
        <Link to="/" className="flex items-center gap-1.5 text-primary text-sm hover:underline mt-1">
          <ArrowLeft size={13} />Back to folders
        </Link>
      </div>
    );
  }

  const colorDef = folder ? getColor(folder.config.color) : getColor();
  const isPaused = folder?.paused ?? false;

  const TABS = [
    { id: 'files' as const,    icon: <FileText size={12} />,      label: 'Files',    count: files?.length },
    { id: 'notes' as const,    icon: <MessageSquare size={12} />, label: 'Notes',    count: undefined },
    { id: 'activity' as const, icon: <Activity size={12} />,      label: 'Activity', count: undefined },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">


      <div className="shrink-0 border-b border-border/70">

        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-1.5 rounded-md hover:bg-secondary/70 transition-colors text-muted-foreground/60 hover:text-foreground shrink-0"
            title="Back to folders"
          >
            <ArrowLeft size={15} />
          </button>


          <div className={`w-8 h-8 rounded-lg ${colorDef.bgClass} flex items-center justify-center shrink-0 relative`}>
            <FolderIcon name={folder?.config.icon} size={16} className={colorDef.iconClass} />
            <span
              title={isPaused ? 'Watcher paused' : 'Watcher active'}
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card
                          ${isPaused ? 'bg-amber-400' : 'bg-emerald-500'}`}
            />
          </div>


          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-foreground text-sm truncate leading-tight">
                {folder?.displayName ?? <span className="inline-block w-32 h-3.5 bg-secondary/80 rounded animate-pulse" />}
              </h1>
              {folder && isPaused && (
                <span className="shrink-0 text-[11px] px-1.5 rounded font-medium bg-amber-500/10 text-amber-400">
                  Paused
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/80 truncate font-mono mt-0.5 leading-tight" title={folder?.path}>
              {formatPath(folder?.path ?? '')}
            </p>
          </div>


          <div className="flex items-center gap-1 shrink-0">
            <InfoTooltip
              placement="bottom"
              title="Folder view"
              body={
                <div className="space-y-1.5">
                  <p><strong className="text-foreground/80">Click any file</strong> to expand its full version history.</p>
                  <p>The <strong className="text-foreground/80"><Camera size={10} className="inline -mt-0.5 mr-0.5" />camera icon</strong> takes a manual snapshot right now.</p>
                  <p>The <strong className="text-foreground/80"><MessageSquare size={10} className="inline -mt-0.5 mr-0.5" />note icon</strong> attaches a note to any file or snapshot.</p>
                </div>
              }
            />

            <button
              onClick={() => void refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-md hover:bg-secondary/70 transition-colors text-muted-foreground/50 hover:text-foreground disabled:opacity-40"
              title="Refresh file list"
            >
              {isFetching ? <Loader2 size={14} className="animate-spin-slow" /> : <RefreshCw size={14} />}
            </button>

            {folderId != null && (
              <Link
                to={`/folder/${folderId}/recover`}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                           bg-primary/12 text-primary hover:bg-primary/20 transition-colors"
                title="Recover — restore files from any snapshot"
              >
                <History size={12} />
                Recover
              </Link>
            )}

            {folderId != null && (
              <Link
                to={`/folder/${folderId}/settings`}
                className="p-1.5 rounded-md hover:bg-secondary/70 transition-colors text-muted-foreground/50 hover:text-foreground"
                title="Folder settings"
              >
                <Settings2 size={14} />
              </Link>
            )}
          </div>
        </div>


        <div className="flex items-center gap-0 px-4 pt-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSearchTab(tab.id)}
              className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-all
                ${searchTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              )}

              {searchTab === tab.id && (
                <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-t-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      </div>


      {folderId != null && <ScanProgress folderId={folderId} />}


      {searchTab !== 'activity' && (
        <div className="px-4 py-2.5 border-b border-border/30 bg-card/10 shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            <input
              type="text"
              value={searchTab === 'files' ? fileSearch : noteQuery}
              onChange={(e) => searchTab === 'files' ? setFileSearch(e.target.value) : setNoteQuery(e.target.value)}
              placeholder={searchTab === 'files' ? 'Filter files by name…' : 'Search all notes…'}
              className="w-full bg-secondary/30 border border-border/30 rounded-lg pl-8 pr-8 py-2 text-xs
                         focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40
                         placeholder:text-muted-foreground/50 transition-colors"
            />
            {(searchTab === 'files' ? fileSearch : noteQuery) && (
              <button
                onClick={() => searchTab === 'files' ? setFileSearch('') : setNoteQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}


      <div className="flex-1 min-h-0 flex flex-col">


        {searchTab === 'activity' && folderId != null && (
          <div className="flex-1 overflow-auto min-h-0">
            <ActivityFeed folderId={folderId} />
          </div>
        )}


        {searchTab === 'notes' && (
          <div className="flex-1 overflow-auto min-h-0 p-4 space-y-2 animate-fade-in">
            {!noteQuery.trim() && (
              <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground/70">
                <div className="w-10 h-10 rounded-full bg-secondary/40 border border-border/30 flex items-center justify-center">
                  <MessageSquare size={16} className="opacity-50" />
                </div>
                <p className="text-xs text-center leading-relaxed max-w-[200px]">
                  Type above to search notes attached to files and snapshots
                </p>
              </div>
            )}

            {noteQuery.trim() && (!noteHits || noteHits.length === 0) && (
              <p className="text-xs text-muted-foreground/50 text-center py-10">
                No notes match "<span className="font-mono text-foreground/50">{noteQuery}</span>"
              </p>
            )}

            {noteHits?.map((hit) => {
              const targetFileId = hit.kind === 'file' ? hit.id : (hit.fileId ?? null);
              const isSnapshot = hit.kind === 'snapshot';
              return (
                <button
                  key={`${hit.kind}-${hit.id}`}
                  onClick={() => targetFileId != null && jumpToFile(targetFileId)}
                  className="w-full rounded-xl border border-border/40 bg-card/50 hover:bg-card/90
                             hover:border-border/70 transition-all text-left group overflow-hidden"
                >

                  <div className={`h-[2px] w-full ${isSnapshot ? 'bg-purple-500/40' : 'bg-blue-500/40'}`} />
                  <div className="p-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0 mt-0.5
                        ${isSnapshot
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                        {hit.kind}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-mono text-foreground/75 truncate flex-1">{hit.label}</p>
                          <ArrowRight size={11} className="text-muted-foreground/50 group-hover:text-primary/60 transition-colors shrink-0" />
                        </div>
                        {hit.createdAt && (
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                            {format(new Date(hit.createdAt), 'MMM d, HH:mm')}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/65 mt-2 leading-relaxed bg-secondary/30 rounded-lg px-3 py-2 text-left border border-border/20">
                          {hit.note}
                        </p>
                        {isSnapshot && hit.fileId != null && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleNoteHitRewind(hit); }}
                            className="mt-2.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                          >
                            <RotateCcw size={10} />Rewind to this snapshot
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}


        {searchTab === 'files' && (
          <ErrorBoundary label="File list">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {isLoading ? (
                <div className="overflow-auto flex-1"><FileListSkeleton /></div>
              ) : error ? (
                <div className="m-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                  <p className="font-medium">Failed to load files</p>
                  <p className="text-xs mt-1 opacity-70">{String(error)}</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  {files && files.length > 0 && files.every((f) => f.snapshotCount === 0) && (
                    <div className="mx-4 mt-4 mb-1 p-3.5 rounded-xl border border-primary/15 bg-primary/5 text-xs text-primary/75 flex items-start gap-2.5 shrink-0">
                      <Zap size={13} className="shrink-0 mt-0.5 text-primary/60" />
                      <span className="leading-relaxed">
                        Files found — snapshots appear here automatically when you save, or click the
                        <Camera size={10} className="inline mx-1 -mt-0.5" />
                        camera icon for a manual snapshot now.
                      </span>
                    </div>
                  )}
                  <FolderBrowser
                    folderId={folderId!}
                    files={files ?? []}
                    filter={fileSearch}
                    autoOpenFileId={jumpFileId}
                    onAutoOpened={() => setJumpFileId(null)}
                  />
                </div>
              )}
            </div>
          </ErrorBoundary>
        )}
      </div>


      {files && files.length > 0 && (
        <div className="border-t border-border/40 px-5 py-2 flex items-center gap-3 shrink-0 bg-card/20">
          <span className="text-[11px] text-muted-foreground/50">
            {files.length} file{files.length !== 1 ? 's' : ''}
          </span>

          {totalSnapshots > 0 && (
            <>
              <span className="text-border/40 text-[11px]">·</span>
              <span className="text-[11px] text-muted-foreground/50">
                {totalSnapshots} snapshot{totalSnapshots !== 1 ? 's' : ''}
              </span>
            </>
          )}

          {files.filter((f) => f.isBinary).length > 0 && (
            <>
              <span className="text-border/40 text-[11px]">·</span>
              <span className="text-[11px] text-muted-foreground/70">
                {files.filter((f) => f.isBinary).length} binary
              </span>
            </>
          )}

          {isPaused && (
            <>
              <span className="text-border/40 text-[11px]">·</span>
              <span className="flex items-center gap-1 text-[11px] text-amber-400/70">
                <PauseCircle size={10} />Watcher paused
              </span>
            </>
          )}

          {fileSearch && searchTab === 'files' && (
            <span className="ml-auto text-[11px] text-muted-foreground/60 font-mono">
              "{fileSearch}"
            </span>
          )}
        </div>
      )}


      {rewindTarget && (
        <NoteRewindConnector
          snapshotId={rewindTarget.snapshotId}
          fileId={rewindTarget.fileId}
          onClose={() => setRewindTarget(null)}
        />
      )}
    </div>
  );
}
