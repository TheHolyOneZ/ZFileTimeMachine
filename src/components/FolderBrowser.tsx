import { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { createPortal } from 'react-dom';
import {
  Folder, FolderOpen, ChevronRight, ArrowLeft, Settings2,
  PauseCircle, PlayCircle, X,
} from 'lucide-react';
import type { FileEntry } from '@/lib/types';
import { FileList } from './FileList';
import { useSetPathOverride } from '@/hooks/useTimeline';
import { computePopupPos } from '@/lib/popup';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';


interface DirInfo { name: string; totalFiles: number; pausedFiles: number }

interface Entries {
  directFiles: FileEntry[];
  dirs: DirInfo[];
}

function getEntries(files: FileEntry[], subPath: string): Entries {
  const prefix = subPath ? subPath + '/' : '';

  const directFiles: FileEntry[] = [];
  const dirMap = new Map<string, { total: number; paused: number }>();

  for (const f of files) {

    const local = prefix ? (f.relPath.startsWith(prefix) ? f.relPath.slice(prefix.length) : null) : f.relPath;
    if (local === null) continue;

    const slashIdx = local.indexOf('/');
    if (slashIdx === -1) {
      directFiles.push(f);
    } else {
      const name = local.slice(0, slashIdx);
      const cur = dirMap.get(name) ?? { total: 0, paused: 0 };
      cur.total++;
      if (f.noAutoSnapshot) cur.paused++;
      dirMap.set(name, cur);
    }
  }

  const dirs = [...dirMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, { total, paused }]) => ({ name, totalFiles: total, pausedFiles: paused }));

  return { directFiles, dirs };
}


interface FolderSettingsProps {
  folderId: number;
  subPath: string;
  dirName: string;
  totalFiles: number;
  pausedFiles: number;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

function FolderSettingsPopup({
  folderId, subPath, dirName, totalFiles, pausedFiles, onClose, anchorRect,
}: FolderSettingsProps) {
  const setPathOverride = useSetPathOverride();
  const allPaused = pausedFiles === totalFiles;
  const prefix = subPath ? `${subPath}/${dirName}` : dirName;

  if (!anchorRect) return null;
  const pos = computePopupPos(anchorRect, 260, 180);

  function toggle() {
    setPathOverride.mutate({ folderId, pathPrefix: prefix, noAutoSnapshot: !allPaused });
    onClose();
  }

  return createPortal(
    <div
      style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width: 260, maxHeight: pos.maxHeight, zIndex: 9999 }}
      className="bg-card/98 border border-border/70 rounded-xl shadow-2xl animate-scale-in overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-secondary/30">
        <span className="text-[11px] font-semibold text-muted-foreground/80 flex items-center gap-1.5">
          <Folder size={10} className="text-primary/60" />
          {dirName}/
        </span>
        <button onClick={onClose} className="p-1 rounded hover:bg-secondary text-muted-foreground/40 hover:text-foreground transition-colors">
          <X size={10} />
        </button>
      </div>
      <div className="p-3 space-y-3">
        <p className="text-[10px] text-muted-foreground/50">
          {totalFiles} file{totalFiles !== 1 ? 's' : ''} · {pausedFiles} paused
        </p>
        <button
          onClick={toggle}
          disabled={setPathOverride.isPending}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-xs transition-all ${
            allPaused
              ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
              : 'bg-secondary/40 border-border/40 text-foreground/70 hover:bg-secondary/70'
          }`}
        >
          {allPaused
            ? <><PlayCircle size={13} /><span className="flex-1 text-left">Re-enable auto-snapshots</span></>
            : <><PauseCircle size={13} /><span className="flex-1 text-left">Pause auto-snapshots</span></>
          }
          <span className="text-[10px] text-muted-foreground/40">all {totalFiles} files</span>
        </button>
        <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
          Paused files still appear in the list and can be snapshotted manually via the camera icon.
        </p>
      </div>
    </div>,
    document.body,
  );
}


interface FolderEntryProps {
  folderId: number;
  subPath: string;
  name: string;
  totalFiles: number;
  pausedFiles: number;
  onClick: () => void;
  measureRef?: (el: Element | null) => void;
}

function FolderEntry({ folderId, subPath, name, totalFiles, pausedFiles, onClick, measureRef }: FolderEntryProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const allPaused = pausedFiles === totalFiles && totalFiles > 0;
  const setPathOverride = useSetPathOverride();
  const { menu, open, close } = useContextMenu();
  const prefix = subPath ? `${subPath}/${name}` : name;

  function openSettings(e: React.MouseEvent) {
    e.stopPropagation();
    if (settingsBtnRef.current) setAnchorRect(settingsBtnRef.current.getBoundingClientRect());
    setSettingsOpen(true);
  }

  return (
    <>
      <div
        ref={measureRef as React.RefCallback<HTMLDivElement>}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
        onContextMenu={(e) => open(e, [
          {
            label: allPaused ? 'Resume auto-snapshots' : 'Pause auto-snapshots',
            icon: allPaused ? <PlayCircle size={12} /> : <PauseCircle size={12} />,
            onClick: () => setPathOverride.mutate({ folderId, pathPrefix: prefix, noAutoSnapshot: !allPaused }),
          },
        ])}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-secondary/40
                   border-b border-border/30 last:border-0 transition-colors cursor-pointer group"
      >
        <ChevronRight size={13} className="text-muted-foreground/30 group-hover:text-primary/50 transition-colors shrink-0" />
        {allPaused
          ? <FolderOpen size={13} className="text-amber-400/60 shrink-0" />
          : <Folder size={13} className="text-primary/60 group-hover:text-primary/80 transition-colors shrink-0" />
        }
        <span className="text-sm text-foreground/80 flex-1 min-w-0 truncate select-none">
          {name}<span className="text-muted-foreground/40">/</span>
        </span>
        {allPaused && (
          <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400/70 border-amber-500/20 shrink-0">
            paused
          </span>
        )}
        <button
          ref={settingsBtnRef}
          onClick={openSettings}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/40
                     hover:text-foreground hover:bg-secondary transition-all shrink-0"
          title="Folder settings"
        >
          <Settings2 size={11} />
        </button>
        <span className="text-xs text-muted-foreground/35 shrink-0 tabular-nums select-none">
          {totalFiles}
        </span>
        <ChevronRight size={11} className="text-muted-foreground/25 group-hover:text-muted-foreground/50 transition-colors shrink-0" />
      </div>

      {settingsOpen && anchorRect && (
        <FolderSettingsPopup
          folderId={folderId}
          subPath={subPath}
          dirName={name}
          totalFiles={totalFiles}
          pausedFiles={pausedFiles}
          anchorRect={anchorRect}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {menu && <ContextMenu {...menu} onClose={close} />}
    </>
  );
}


function PathBar({ subPath, onUp }: { subPath: string; onUp: () => void }) {
  const parts = subPath.split('/');
  const currentName = parts[parts.length - 1];
  const parentPath = parts.slice(0, -1).join('/');

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-secondary/15 shrink-0">
      <button
        onClick={onUp}
        className="flex items-center gap-1.5 p-1 -ml-1 rounded-md hover:bg-secondary text-muted-foreground/60
                   hover:text-foreground transition-colors text-xs"
        title="Go up"
      >
        <ArrowLeft size={13} />
        <span>{parentPath || 'root'}/</span>
      </button>
      <span className="text-muted-foreground/30 text-xs">/</span>
      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground/70">
        <Folder size={11} className="text-primary/60" />
        {currentName}/
      </span>
    </div>
  );
}


const DIR_ROW_H = 42;
const VIRTUAL_DIR_THRESHOLD = 60;

function VirtualDirList({ dirs, folderId, subPath, scrollRef, onDrillInto }: {
  dirs: DirInfo[];
  folderId: number;
  subPath: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onDrillInto: (name: string) => void;
}) {
  const virtualizer = useVirtualizer({
    count: dirs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIR_ROW_H,
    overscan: 8,
  });

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((vRow) => {
        const { name, totalFiles, pausedFiles } = dirs[vRow.index];
        return (
          <div
            key={name}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
          >
            <FolderEntry
              folderId={folderId}
              subPath={subPath}
              name={name}
              totalFiles={totalFiles}
              pausedFiles={pausedFiles}
              onClick={() => onDrillInto(name)}
            />
          </div>
        );
      })}
    </div>
  );
}


interface Props {
  folderId: number;
  files: FileEntry[];
  filter?: string;
  autoOpenFileId?: number | null;
  onAutoOpened?: () => void;
}

export function FolderBrowser({ folderId, files, filter = '', autoOpenFileId, onAutoOpened }: Props) {
  const [subPath, setSubPath] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSearching = filter.trim().length > 0;

  const { directFiles, dirs } = useMemo(
    () => isSearching ? { directFiles: files, dirs: [] } : getEntries(files, subPath),
    [files, subPath, isSearching],
  );

  function drillInto(name: string) {
    setSubPath(subPath ? `${subPath}/${name}` : name);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  function goUp() {
    const parts = subPath.split('/');
    parts.pop();
    setSubPath(parts.join('/'));
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const isEmpty = dirs.length === 0 && directFiles.length === 0;

  return (


    <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto flex flex-col">
      {subPath && <PathBar subPath={subPath} onUp={goUp} />}


      {dirs.length > VIRTUAL_DIR_THRESHOLD ? (
        <VirtualDirList dirs={dirs} folderId={folderId} subPath={subPath} scrollRef={scrollRef} onDrillInto={drillInto} />
      ) : (
        dirs.map(({ name, totalFiles, pausedFiles }) => (
          <FolderEntry
            key={name}
            folderId={folderId}
            subPath={subPath}
            name={name}
            totalFiles={totalFiles}
            pausedFiles={pausedFiles}
            onClick={() => drillInto(name)}
          />
        ))
      )}

      {dirs.length > 0 && directFiles.length > 0 && (
        <div className="mx-4 border-t border-border/20 my-0.5" />
      )}

      <FileList
        files={directFiles}
        filter={isSearching ? filter : ''}
        scrollRef={scrollRef}
        autoOpenFileId={autoOpenFileId}
        onAutoOpened={onAutoOpened}
        stripPrefix={subPath || undefined}
      />

      {isEmpty && !subPath && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 animate-fade-in">
          <Folder size={24} className="opacity-20" />
          <p className="text-sm">No files tracked yet</p>
          <p className="text-xs opacity-50">Files appear once the initial scan completes</p>
        </div>
      )}

      {isEmpty && subPath && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 animate-fade-in">
          <p className="text-sm">Empty folder</p>
        </div>
      )}
    </div>
  );
}
