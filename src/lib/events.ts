import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  SnapshotCreatedPayload,
  FileRenamedPayload,
  ScanProgressPayload,
  SnapshotSkippedPayload,
  ErrorPayload,
} from './types';

export interface FileDeletedPayload {
  folderId: number;
  fileId: number;
  relPath: string;
}

export function onSnapshotCreated(cb: (p: SnapshotCreatedPayload) => void): Promise<UnlistenFn> {
  return listen<SnapshotCreatedPayload>('snapshot:created', (e) => cb(e.payload));
}

export function onFileDeleted(cb: (p: FileDeletedPayload) => void): Promise<UnlistenFn> {
  return listen<FileDeletedPayload>('file:deleted', (e) => cb(e.payload));
}

export function onFileRestored(cb: (p: FileDeletedPayload) => void): Promise<UnlistenFn> {
  return listen<FileDeletedPayload>('file:restored', (e) => cb(e.payload));
}

export function onFileRenamed(cb: (p: FileRenamedPayload) => void): Promise<UnlistenFn> {
  return listen<FileRenamedPayload>('file:renamed', (e) => cb(e.payload));
}

export function onScanProgress(cb: (p: ScanProgressPayload) => void): Promise<UnlistenFn> {
  return listen<ScanProgressPayload>('folder:scan-progress', (e) => cb(e.payload));
}

export function onSnapshotSkipped(cb: (p: SnapshotSkippedPayload) => void): Promise<UnlistenFn> {
  return listen<SnapshotSkippedPayload>('snapshot:skipped', (e) => cb(e.payload));
}

export function onError(cb: (p: ErrorPayload) => void): Promise<UnlistenFn> {
  return listen<ErrorPayload>('error:occurred', (e) => cb(e.payload));
}

export function onRecoverProgress(
  cb: (p: import('./types').RecoverProgressPayload) => void,
): Promise<UnlistenFn> {
  return listen<import('./types').RecoverProgressPayload>('recover:progress', (e) => cb(e.payload));
}
