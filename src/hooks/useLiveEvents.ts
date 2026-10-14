import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as events from '@/lib/events';
import { useToast } from '@/context/ToastContext';


export function useLiveEvents() {
  const qc = useQueryClient();
  const { toast } = useToast();


  const fileInvalidateTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  function scheduleFilesInvalidate(folderId: number) {
    const existing = fileInvalidateTimers.current.get(folderId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['files', folderId] });
      fileInvalidateTimers.current.delete(folderId);
    }, 4_000);
    fileInvalidateTimers.current.set(folderId, t);
  }

  useEffect(() => {
    const unsubs = [
      events.onSnapshotCreated((p) => {

        qc.invalidateQueries({ queryKey: ['snapshots', p.file_id] });
        qc.invalidateQueries({ queryKey: ['activity', p.folder_id] });

        scheduleFilesInvalidate(p.folder_id);
      }),

      events.onFileDeleted((p) => {
        scheduleFilesInvalidate(p.folderId);
        qc.invalidateQueries({ queryKey: ['activity', p.folderId] });
        toast('info', `File removed from tracking: ${p.relPath.split('/').pop()}`);
      }),

      events.onFileRestored((p) => {
        qc.invalidateQueries({ queryKey: ['files', p.folderId] });
        qc.invalidateQueries({ queryKey: ['snapshots', p.fileId] });
      }),

      events.onFileRenamed((p) => {
        scheduleFilesInvalidate(p.folder_id);
        qc.invalidateQueries({ queryKey: ['snapshots', p.file_id] });
        toast('info', `Renamed: ${p.old_path.split('/').pop()} → ${p.new_path.split('/').pop()}`);
      }),


      events.onSnapshotSkipped((p) => {
        console.debug('[zftm] skipped', p.rel_path, p.reason);
      }),

      events.onError((p) => {
        console.error('[zftm]', p.code, p.message, p.context);
        toast('error', p.message);
      }),
    ];

    return () => {

      fileInvalidateTimers.current.forEach((t) => clearTimeout(t));
      fileInvalidateTimers.current.clear();
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, [qc, toast]);
}
