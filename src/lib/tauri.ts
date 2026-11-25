import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  Folder,
  FolderConfig,
  DirEntryInfo,
  FileEntry,
  Snapshot,
  DiffResult,
  RewindResult,
  GlobalSettings,
  ActivityEntry,
  StorageEntry,
  IntegrityResult,
  QaTestResult,
  BulkRecoverArgs,
  BulkRecoverResult,
} from './types';


export function formatPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return '\\\\' + path.slice(8);
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

export async function getPlatform(): Promise<string> {
  return invoke('get_platform');
}

export async function listFolders(): Promise<Folder[]> {
  return invoke('list_folders');
}

export async function listDirectory(root: string, rel: string, globs: string[]): Promise<DirEntryInfo[]> {
  return invoke('list_directory', { root, rel, globs });
}

export async function addFolder(path: string, config?: FolderConfig): Promise<Folder> {
  return invoke('add_folder', { path, config: config ?? null });
}

export async function updateFolderConfig(id: number, config: FolderConfig): Promise<Folder> {
  return invoke('update_folder_config', { id, config });
}

export async function renameFolder(id: number, displayName: string): Promise<Folder> {
  return invoke('rename_folder', { id, displayName });
}

export async function removeFolder(id: number): Promise<void> {
  return invoke('remove_folder', { id });
}

export async function listFiles(folderId: number): Promise<FileEntry[]> {
  return invoke('list_files', { folderId });
}

export async function listSnapshots(fileId: number): Promise<Snapshot[]> {
  return invoke('list_snapshots', { fileId });
}

export async function triggerManualSnapshot(fileId: number): Promise<Snapshot> {
  return invoke('trigger_manual_snapshot', { fileId });
}

export async function previewDiff(
  snapshotId: number,
  againstCurrent: boolean,
): Promise<DiffResult> {
  return invoke('preview_diff', { snapshotId, againstCurrent });
}

export async function rewindTo(
  snapshotId: number,
  autoSaveCurrent: boolean,
): Promise<RewindResult> {
  return invoke('rewind_to', { snapshotId, autoSaveCurrent });
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  return invoke('get_global_settings');
}

export async function updateGlobalSettings(settings: GlobalSettings): Promise<GlobalSettings> {
  return invoke('update_global_settings', { settings });
}


export async function runGc(): Promise<number> {
  return invoke('run_gc');
}

export async function setFileNote(id: number, note: string | null): Promise<void> {
  return invoke('set_file_note', { id, note });
}

export async function setSnapshotNote(id: number, note: string | null): Promise<void> {
  return invoke('set_snapshot_note', { id, note });
}

export async function searchNotes(folderId: number, query: string): Promise<import('./types').NoteHit[]> {
  return invoke('search_notes', { folderId, query });
}

export async function setFileOverride(fileId: number, noAutoSnapshot: boolean): Promise<void> {
  return invoke('set_file_override', { fileId, noAutoSnapshot });
}

export async function setPathOverride(folderId: number, pathPrefix: string, noAutoSnapshot: boolean): Promise<number> {
  return invoke('set_path_override', { folderId, pathPrefix, noAutoSnapshot });
}

export async function cleanupOrphanedFiles(): Promise<number> {
  return invoke('cleanup_orphaned_files');
}

export async function getDedupStats(): Promise<import('./types').DedupStats> {
  return invoke('get_dedup_stats');
}


export async function pickFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  if (typeof result === 'string') return result;
  return null;
}

export async function toggleFolderPause(id: number, paused: boolean): Promise<Folder> {
  return invoke('toggle_folder_pause', { id, paused });
}

export async function undeleteFolder(id: number): Promise<Folder> {
  return invoke('undelete_folder', { id });
}

export async function listActivityLog(folderId: number, limit?: number): Promise<ActivityEntry[]> {
  return invoke('list_activity_log', { folderId, limit: limit ?? null });
}

export async function getStorageBreakdown(folderId: number): Promise<StorageEntry[]> {
  return invoke('get_storage_breakdown', { folderId });
}

export async function runIntegrityCheck(): Promise<IntegrityResult> {
  return invoke('run_integrity_check');
}

export async function getCasSize(): Promise<number> {
  return invoke('get_cas_size');
}

export async function listFilesPaged(
  folderId: number,
  limit?: number,
  offset?: number,
): Promise<{ items: FileEntry[]; total: number }> {
  return invoke('list_files_paged', { folderId, limit: limit ?? null, offset: offset ?? null });
}

export async function getSnapshotLineStats(fileId: number): Promise<import('./types').SnapshotLineStats[]> {
  return invoke('snapshot_line_stats', { fileId });
}

export async function runQaSuite(): Promise<QaTestResult[]> {
  return invoke<QaTestResult[]>('run_qa_suite');
}

export async function bulkRecover(args: BulkRecoverArgs): Promise<BulkRecoverResult> {
  return invoke('bulk_recover', { args });
}
