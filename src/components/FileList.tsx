import { useState, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ChevronDown, ChevronRight, FileText, FileCode2, Binary,
  Clock, Camera, Copy, Check as CheckIcon, Search, X, PauseCircle, PlayCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { FileEntry } from '@/lib/types';
import { useSnapshots, useManualSnapshot, useSetFileNote, useSetFileOverride } from '@/hooks/useTimeline';
import { InfoTooltip } from './InfoTooltip';
import { NoteEditor } from './NoteEditor';
import { Timeline } from './Timeline';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';


function SnapshotSkeleton() {
  return (
    <div className="space-y-1 animate-pulse py-1">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <div className="w-2 h-2 rounded-full bg-secondary shrink-0" />
          <div className="h-2.5 bg-secondary rounded w-16" />
          <div className="h-2.5 bg-secondary/60 rounded w-24" />
          <div className="h-2.5 bg-secondary/40 rounded w-12" />
        </div>
      ))}
    </div>
  );
}


function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={copy}
      className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/50
                 hover:text-foreground transition-all"
      title="Copy relative path"
    >
      {copied ? <CheckIcon size={11} className="text-emerald-400" /> : <Copy size={11} />}
    </button>
  );
}


interface FileRowProps {
  file: FileEntry;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
  onHeightChange?: () => void;
  stripPrefix?: string;
  measureRef?: (el: Element | null) => void;
}

function FileRow({ file, autoOpen, onAutoOpened, onHeightChange, stripPrefix, measureRef }: FileRowProps) {
  const [open, setOpen] = useState(false);
  const [snapSearch, setSnapSearch] = useState('');
  const { data: snapshots, isLoading: snapsLoading } = useSnapshots(open ? file.id : undefined);
  const manualSnap = useManualSnapshot();
  const setNote = useSetFileNote();
  const setOverride = useSetFileOverride();
  const rowRef = useRef<HTMLDivElement>(null);
  const { menu, open: openCtx, close } = useContextMenu();

  useEffect(() => {
    if (autoOpen && !open) {
      setOpen(true);
      setTimeout(() => {
        rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      onAutoOpened?.();
    }
  }, [autoOpen]);


  useEffect(() => { onHeightChange?.(); }, [open, snapshots]);

  const Icon = file.isBinary ? Binary : file.relPath.endsWith('.md') ? FileText : FileCode2;
  const displayPath = (stripPrefix && file.relPath.startsWith(stripPrefix + '/'))
    ? file.relPath.slice(stripPrefix.length + 1)
    : file.relPath;
  const name = displayPath.split('/').pop() ?? displayPath;
  const dir  = displayPath.includes('/') ? displayPath.split('/').slice(0, -1).join('/') + '/' : '';
  const ext  = name.includes('.') ? name.split('.').pop() : null;

  function triggerSnapshot(e: React.MouseEvent) {
    e.stopPropagation();
    manualSnap.mutate(file.id);
  }

  return (
    <div
      ref={(el) => {
        (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        measureRef?.(el);
      }}
      className="border-b border-border/40 last:border-0"
      onContextMenu={(e) => openCtx(e, [
        { label: 'Take snapshot now', icon: <Camera size={12} />, onClick: () => manualSnap.mutate(file.id) },
        { label: file.noAutoSnapshot ? 'Resume auto-snapshots' : 'Pause auto-snapshots',
          icon: file.noAutoSnapshot ? <PlayCircle size={12} /> : <PauseCircle size={12} />,
          onClick: () => setOverride.mutate({ id: file.id, noAutoSnapshot: !file.noAutoSnapshot }),
          separator: true,
        },
      ])}
    >
      <div className="flex items-center group hover:bg-secondary/40 transition-colors">
        <button
          onClick={() => setOpen(!open)}
          className="flex-1 flex items-center gap-2.5 px-4 py-2.5 text-left min-w-0
                     focus-visible:outline-none focus-visible:bg-secondary/40"
        >
          <span className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors shrink-0">
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </span>
          <Icon size={13} className={`shrink-0 ${file.isBinary ? 'text-amber-400/70' : 'text-primary/70'}`} />
          <span className="text-sm flex-1 min-w-0 truncate">
            {dir && <span className="text-muted-foreground/40 text-xs">{dir}</span>}
            <span className="text-foreground/90">{name}</span>
          </span>
        </button>

        <div className="flex items-center gap-1 pr-3 py-2.5 shrink-0">
          <NoteEditor
            initialNote={file.note}
            onSave={(note) => setNote.mutate({ id: file.id, note })}
            placeholder="Note about this file…"
          />
          <button
            onClick={() => setOverride.mutate({ id: file.id, noAutoSnapshot: !file.noAutoSnapshot })}
            className={`p-1 rounded transition-colors shrink-0 ${
              file.noAutoSnapshot
                ? 'text-amber-400/80 hover:text-amber-300'
                : 'opacity-0 group-hover:opacity-100 text-muted-foreground/30 hover:text-muted-foreground/70'
            }`}
            title={file.noAutoSnapshot ? 'Manual-only mode — click to re-enable auto-snapshots' : 'Pause auto-snapshots (manual only)'}
          >
            <PauseCircle size={12} fill={file.noAutoSnapshot ? 'currentColor' : 'none'} />
          </button>
          {file.isBinary && (
            <div className="flex items-center gap-1 shrink-0">
              {ext && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 font-mono">
                  {ext}
                </span>
              )}
              <InfoTooltip
                placement="bottom"
                title="Binary file"
                body="Detected as binary. Still tracked and snapshotted — diff previews are unavailable but rewind works."
                iconSize={11}
              />
            </div>
          )}
          <button
            onClick={triggerSnapshot}
            disabled={manualSnap.isPending}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground/50
                       hover:text-primary transition-all disabled:opacity-30 shrink-0"
            title="Take manual snapshot now"
          >
            {manualSnap.isPending
              ? <Clock size={12} className="animate-spin-slow" />
              : <Camera size={12} />}
          </button>
          <CopyBtn text={file.relPath} />
          <span
            className={`text-[10px] font-mono shrink-0 ${
              file.snapshotCount > 0 ? 'text-muted-foreground/70' : 'text-muted-foreground/40'
            }`}
            title={`${file.snapshotCount} snapshot${file.snapshotCount !== 1 ? 's' : ''}`}
          >
            {file.snapshotCount}
          </span>
          {file.lastSnapshotAt != null && (
            <span
              className="text-[10px] text-muted-foreground/35 shrink-0 hidden group-hover:inline"
              title={new Date(file.lastSnapshotAt).toLocaleString()}
            >
              {formatDistanceToNow(new Date(file.lastSnapshotAt), { addSuffix: true })}
            </span>
          )}
          {!open && snapshots && snapshots.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
              {snapshots.length}
            </span>
          )}
          {!open && !snapshots && (
            <Clock size={10} className="text-muted-foreground/30 shrink-0" />
          )}
        </div>
      </div>

      {open && (
        <div className="bg-background/40 border-t border-border/30 animate-slide-down">
          {snapshots && snapshots.length > 0 && (
            <div className="px-4 pt-2.5 pb-1">
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/30 pointer-events-none" />
                <input
                  type="text"
                  value={snapSearch}
                  onChange={(e) => setSnapSearch(e.target.value)}
                  placeholder="Search snapshot notes…"
                  className="w-full bg-secondary/30 border border-border/30 rounded-lg pl-7 pr-7 py-1.5 text-xs
                             focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30
                             placeholder:text-muted-foreground/25 transition-colors"
                />
                {snapSearch && (
                  <button
                    onClick={() => setSnapSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )}
          {snapsLoading ? (
            <SnapshotSkeleton />
          ) : snapshots ? (
            <Timeline snapshots={snapshots} fileName={file.relPath} noteFilter={snapSearch} />
          ) : (
            <p className="text-xs text-muted-foreground px-8 py-3">No snapshots yet.</p>
          )}
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={close} />}
    </div>
  );
}


const VIRTUAL_THRESHOLD = 80;

interface Props {
  files: FileEntry[];
  filter?: string;
  autoOpenFileId?: number | null;
  onAutoOpened?: () => void;
  stripPrefix?: string;

  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function FileList({ files, filter = '', autoOpenFileId, onAutoOpened, stripPrefix, scrollRef }: Props) {
  const filtered = filter.trim()
    ? files.filter((f) => f.relPath.toLowerCase().includes(filter.toLowerCase()))
    : files;

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 animate-fade-in">
        <div className="w-14 h-14 rounded-xl bg-secondary/50 border border-border flex items-center justify-center">
          <FileText size={24} className="opacity-30" />
        </div>
        <div className="text-center">
          <p className="text-sm">No files tracked yet</p>
          <p className="text-xs opacity-50 mt-0.5">Files appear once the initial scan completes</p>
        </div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2 animate-fade-in">
        <p className="text-sm">No files match "<span className="font-mono text-foreground/60">{filter}</span>"</p>
      </div>
    );
  }


  if (filtered.length <= VIRTUAL_THRESHOLD) {
    return (
      <div>
        {filtered.map((f) => (
          <FileRow
            key={f.id}
            file={f}
            autoOpen={autoOpenFileId != null && f.id === autoOpenFileId}
            onAutoOpened={onAutoOpened}
            stripPrefix={stripPrefix}
          />
        ))}
        {filter && (
          <p className="text-xs text-muted-foreground/40 text-center py-2">
            {filtered.length} of {files.length} files
          </p>
        )}
      </div>
    );
  }

  return <VirtualFileList files={filtered} total={files.length} filter={filter} autoOpenFileId={autoOpenFileId} onAutoOpened={onAutoOpened} stripPrefix={stripPrefix} scrollRef={scrollRef} />;
}


function VirtualFileList({ files, total, filter, autoOpenFileId, onAutoOpened, stripPrefix, scrollRef }: Props & { total: number }) {

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef?.current ?? null,
    estimateSize: () => 44,
    overscan: 12,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const measure = useCallback(() => {
    virtualizer.getVirtualItems().forEach((v) => {
      const el = document.querySelector(`[data-index="${v.index}"]`);
      if (el) virtualizer.measureElement(el);
    });
  }, [virtualizer]);

  return (
    <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {virtualizer.getVirtualItems().map((vRow) => {
        const f = files[vRow.index];
        return (
          <div
            key={f.id}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)` }}
          >
            <FileRow
              file={f}
              autoOpen={autoOpenFileId != null && f.id === autoOpenFileId}
              onAutoOpened={onAutoOpened}
              onHeightChange={measure}
              stripPrefix={stripPrefix}
            />
          </div>
        );
      })}
      {filter && (
        <p className="text-xs text-muted-foreground/40 text-center py-2">
          {files.length} of {total} files
        </p>
      )}
    </div>
  );
}
