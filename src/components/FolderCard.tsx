import { useNavigate } from 'react-router-dom';
import {
  Trash2, Loader2, FolderOpen, Settings2, PauseCircle, PlayCircle,
  Clock, Repeat2, History, ShieldCheck, ChevronRight,
} from 'lucide-react';
import { FolderIcon } from './FolderIcon';
import { formatDistanceToNow } from 'date-fns';
import type { Folder } from '@/lib/types';
import { useRemoveFolder, useToggleFolderPause, useUndeleteFolder } from '@/hooks/useFolders';
import { getColor } from '@/lib/folderAppearance';
import { formatPath } from '@/lib/tauri';
import { useContextMenu } from '@/hooks/useContextMenu';
import { ContextMenu } from './ContextMenu';
import { useToast } from '@/context/ToastContext';

interface Props {
  folder: Folder;
}

function triggerLabel(folder: Folder): string {
  const t = folder.config.trigger;
  if (t.type === 'OnChange')  return 'On save';
  if (t.type === 'Manual')    return 'Manual';
  if (t.type === 'Interval')  return `Every ${t.minutes}m`;
  if (t.type === 'Hybrid')    return 'Hybrid';
  return 'Unknown';
}

function retentionLabel(folder: Folder): string {
  const r = folder.config.retention;
  if (r.type === 'KeepLast')   return `Last ${r.count}`;
  if (r.type === 'TimeBased')  return `${r.days}d`;
  if (r.type === 'Hybrid')     return `${r.days}d / ${r.count}`;
  return '';
}

export function FolderCard({ folder }: Props) {
  const navigate = useNavigate();
  const remove = useRemoveFolder();
  const togglePause = useToggleFolderPause();
  const undelete = useUndeleteFolder();
  const { menu, open, close } = useContextMenu();
  const { toast } = useToast();

  const ago = formatDistanceToNow(new Date(folder.createdAt), { addSuffix: true });
  const isRemoving = remove.isPending && remove.variables === folder.id;
  const colorDef = getColor(folder.config.color);
  const isPaused = folder.paused;

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Stop watching "${folder.displayName}"?\n\nHistory is preserved for 7 days — you can undo this action.`)) {
      remove.mutate(folder.id, {
        onSuccess: () => {
          toast('info', `"${folder.displayName}" removed.`, {
            action: { label: 'Undo', onClick: () => undelete.mutate(folder.id) },
            duration: 8000,
          });
        },
      });
    }
  }

  return (
    <>
    <div
      role="button"
      tabIndex={0}
      onClick={() => !isRemoving && navigate(`/folder/${folder.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && !isRemoving && navigate(`/folder/${folder.id}`)}
      onContextMenu={(e) => open(e, [
        { label: 'Open folder', icon: <FolderOpen size={12} />, onClick: () => navigate(`/folder/${folder.id}`) },
        { label: 'Recover files', icon: <History size={12} />, onClick: () => navigate(`/folder/${folder.id}/recover`) },
        { label: 'Folder settings', icon: <Settings2 size={12} />, onClick: () => navigate(`/folder/${folder.id}/settings`) },
        {
          label: isPaused ? 'Resume watching' : 'Pause watching',
          icon: isPaused ? <PlayCircle size={12} /> : <PauseCircle size={12} />,
          onClick: () => togglePause.mutate({ id: folder.id, paused: !isPaused }),
        },
        { label: 'Remove folder', icon: <Trash2 size={12} />, variant: 'destructive', separator: true, onClick: () => {
          if (confirm(`Stop watching "${folder.displayName}"?\n\nHistory is preserved for 7 days — you can undo this action.`)) {
            remove.mutate(folder.id, {
              onSuccess: () => {
                toast('info', `"${folder.displayName}" removed.`, {
                  action: { label: 'Undo', onClick: () => undelete.mutate(folder.id) },
                  duration: 8000,
                });
              },
            });
          }
        }},
      ])}
      className={`group relative flex items-stretch gap-0 rounded-xl border bg-card
                  cursor-pointer select-none overflow-hidden
                  transition-all duration-200
                  border-border/50 hover:border-border/80
                  hover:-translate-y-px hover:shadow-lg hover:shadow-black/20
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${isRemoving ? 'opacity-40 pointer-events-none' : ''}`}
    >

      <div
        className={`w-[3px] shrink-0 rounded-l-xl ${colorDef.barClass}
                    opacity-30 group-hover:opacity-100 transition-opacity duration-200`}
      />


      <div className="flex-1 flex items-center gap-4 px-4 py-4 min-w-0">


        <div className="relative shrink-0">
          <div className={`w-11 h-11 rounded-xl ${colorDef.bgClass} flex items-center justify-center`}>
            <FolderIcon name={folder.config.icon} size={20} className={colorDef.iconClass} />
          </div>
          <span
            className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-card
                        ${isPaused ? 'bg-amber-400' : 'bg-emerald-500 shadow-[0_0_6px_theme(colors.emerald.500)]'}`}
            title={isPaused ? 'Watcher paused' : 'Watcher active'}
          />
        </div>


        <div className="flex-1 min-w-0 flex flex-col gap-1.5">

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-[15px] text-foreground truncate leading-tight">
              {folder.displayName}
            </span>
            <span
              className={`shrink-0 text-[10px] px-1.5 py-px rounded-md font-medium
                          ${isPaused
                            ? 'bg-amber-500/10 text-amber-400/90 border border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/15'
                          }`}
            >
              {isPaused ? 'Paused' : 'Watching'}
            </span>
          </div>


          <span className="text-[11px] text-muted-foreground/45 font-mono truncate leading-none">
            {formatPath(folder.path)}
          </span>


          <div className="flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/35">
              <Repeat2 size={9} className="shrink-0" />
              {triggerLabel(folder)}
            </span>
            <span className="text-muted-foreground/20 text-[10px]">·</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/35">
              <ShieldCheck size={9} className="shrink-0" />
              {retentionLabel(folder)}
            </span>
            <span className="text-muted-foreground/20 text-[10px]">·</span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground/30">
              <Clock size={9} className="shrink-0" />
              {ago}
            </span>
          </div>
        </div>


        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/folder/${folder.id}/recover`); }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg
                       text-muted-foreground/50 hover:text-primary hover:bg-primary/10
                       transition-all"
            title="Recover files"
          >
            <History size={14} />
          </button>

          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/folder/${folder.id}/settings`); }}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg
                       text-muted-foreground/50 hover:text-foreground hover:bg-secondary/60
                       transition-all"
            title="Folder settings"
          >
            <Settings2 size={14} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePause.mutate({ id: folder.id, paused: !isPaused });
            }}
            disabled={togglePause.isPending}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg
                       text-muted-foreground/50 hover:text-amber-400 hover:bg-amber-400/10
                       disabled:opacity-30 transition-all"
            title={isPaused ? 'Resume watching' : 'Pause watching'}
          >
            {isPaused ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
          </button>

          <button
            onClick={handleRemove}
            disabled={remove.isPending}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg
                       text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10
                       disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            title="Remove folder"
          >
            {isRemoving ? (
              <Loader2 size={14} className="animate-spin-slow" />
            ) : (
              <Trash2 size={14} />
            )}
          </button>

          <ChevronRight
            size={14}
            className="text-muted-foreground/20 group-hover:text-muted-foreground/50 group-hover:translate-x-0.5 transition-all ml-1"
          />
        </div>
      </div>
    </div>
    {menu && <ContextMenu {...menu} onClose={close} />}
    </>
  );
}
