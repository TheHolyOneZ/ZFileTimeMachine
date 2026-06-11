import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '@/lib/tauri';
import type { FolderConfig } from '@/lib/types';

export function useFolders() {
  return useQuery({
    queryKey: ['folders'],
    queryFn: api.listFolders,
  });
}

export function useAddFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, config }: { path: string; config?: FolderConfig }) =>
      api.addFolder(path, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useRemoveFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.removeFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useUpdateFolderConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, config }: { id: number; config: FolderConfig }) =>
      api.updateFolderConfig(id, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, displayName }: { id: number; displayName: string }) =>
      api.renameFolder(id, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useToggleFolderPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, paused }: { id: number; paused: boolean }) =>
      api.toggleFolderPause(id, paused),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}

export function useUndeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.undeleteFolder(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['folders'] }),
  });
}
