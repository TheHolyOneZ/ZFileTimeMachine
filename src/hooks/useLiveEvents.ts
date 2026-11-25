import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import * as events from '@/lib/events';
import { useToast } from '@/context/ToastContext';

export function useLiveEvents() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const location = useLocation();
  const openFolderRef = useRef<number | null>(null);
  const fileInvalidateTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const match = location.pathname.match(/^\/folder\/(\d+)/);
  openFolderRef.current = match ? Number(match[1]) : null;

  useEffect(() => {
    function scheduleFilesInvalidate(folderId: number) {
      const existing = fileInvalidateTimers.current.get(folderId);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['files', folderId] });
        fileInvalidateTimers.current.delete(folderId);
      }, 1_200);
      fileInvalidateTimers.current.set(folderId, t);
    }

    const unsubs = [
      events.onSnapshotCreated((p) => {
        qc.invalidateQueries({ queryKey: ['snapshots', p.file_id] });
        qc.invalidateQueries({ queryKey: ['line-stats', p.file_id] });
        qc.invalidateQueries({ queryKey: ['activity', p.folder_id] });
        qc.invalidateQueries({ queryKey: ['recent-activity'] });
        qc.invalidateQueries({ queryKey: ['cas-size'] });
        scheduleFilesInvalidate(p.folder_id);
      }),

      events.onFileDeleted((p) => {
        scheduleFilesInvalidate(p.folderId);
        qc.invalidateQueries({ queryKey: ['activity', p.folderId] });
        if (openFolderRef.current === p.folderId) {
          toast('info', `${p.relPath.split('/').pop()} was deleted. Its versions are kept, and Recover can bring it back.`);
        }
      }),

      events.onFileRestored((p) => {
        qc.invalidateQueries({ queryKey: ['files', p.folderId] });
        qc.invalidateQueries({ queryKey: ['snapshots', p.fileId] });
      }),

      events.onFileRenamed((p) => {
        scheduleFilesInvalidate(p.folder_id);
        qc.invalidateQueries({ queryKey: ['snapshots', p.file_id] });
        if (openFolderRef.current === p.folder_id) {
          toast('info', `Renamed ${p.old_path.split('/').pop()} to ${p.new_path.split('/').pop()}. Its history moved with it.`);
        }
      }),

      events.onError((p) => {
        console.error('[zftm]', p.code, p.message, p.context);
        toast('error', p.message);
      }),
    ];

    const timers = fileInvalidateTimers.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      unsubs.forEach((p) => p.then((fn) => fn()).catch(() => {}));
    };
  }, [qc, toast]);
}
