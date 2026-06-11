import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/tauri';

export function useFiles(folderId: number | undefined) {
  return useQuery({
    queryKey: ['files', folderId],
    queryFn: () => api.listFiles(folderId!),
    enabled: folderId != null,
    staleTime: 10_000,
    gcTime: 60_000,
  });
}

export function useSnapshots(fileId: number | undefined) {
  return useQuery({
    queryKey: ['snapshots', fileId],
    queryFn: () => api.listSnapshots(fileId!),
    enabled: fileId != null,
  });
}

export function useDiff(snapshotId: number | undefined, againstCurrent = true) {
  return useQuery({
    queryKey: ['diff', snapshotId, againstCurrent],
    queryFn: () => api.previewDiff(snapshotId!, againstCurrent),
    enabled: snapshotId != null,
    staleTime: 5_000,
  });
}

export function useRewind() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      snapshotId,
      autoSaveCurrent,
    }: {
      snapshotId: number;
      autoSaveCurrent: boolean;
    }) => api.rewindTo(snapshotId, autoSaveCurrent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snapshots'] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useManualSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: number) => api.triggerManualSnapshot(fileId),
    onSuccess: (snap) => {
      qc.invalidateQueries({ queryKey: ['snapshots', snap.fileId] });
      qc.invalidateQueries({ queryKey: ['files'] });
    },
  });
}

export function useSetFileNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string | null }) =>
      api.setFileNote(id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useSetSnapshotNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: number; note: string | null }) =>
      api.setSnapshotNote(id, note),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['snapshots'] }),
  });
}

export function useSetFileOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, noAutoSnapshot }: { id: number; noAutoSnapshot: boolean }) =>
      api.setFileOverride(id, noAutoSnapshot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useSetPathOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ folderId, pathPrefix, noAutoSnapshot }: { folderId: number; pathPrefix: string; noAutoSnapshot: boolean }) =>
      api.setPathOverride(folderId, pathPrefix, noAutoSnapshot),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
}

export function useSearchNotes(folderId: number | undefined, query: string) {
  return useQuery({
    queryKey: ['notes-search', folderId, query],
    queryFn: () => api.searchNotes(folderId!, query),
    enabled: folderId != null && query.trim().length > 0,
    staleTime: 1_000,
  });
}
