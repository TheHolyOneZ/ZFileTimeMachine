

export type BackupTrigger =
  | { type: 'OnChange' }
  | { type: 'Interval'; minutes: number }
  | { type: 'Manual' }
  | { type: 'Hybrid'; debounce_secs: number; interval_minutes: number };

export type RetentionRule =
  | { type: 'KeepLast'; count: number }
  | { type: 'TimeBased'; days: number }
  | { type: 'Hybrid'; count: number; days: number };

export interface FolderConfig {
  trigger: BackupTrigger;
  retention: RetentionRule;
  ignore_globs: string[];
  binary_max_mb: number;
  binary_keep_last: number;
  color?: string;
  icon?: string;
  skip_files_larger_than_mb?: number;
  min_snapshot_interval_secs?: number;
  debounce_ms?: number;
  max_depth?: number;
  compressionEnabled?: boolean;
}


export interface Folder {
  id: number;
  path: string;
  displayName: string;
  config: FolderConfig;
  active: boolean;
  createdAt: number;
  paused: boolean;
  deletedAt: number | null;
}

export interface FileEntry {
  id: number;
  folderId: number;
  relPath: string;
  isBinary: boolean;
  currentHash: string | null;
  lastModified: number;
  note: string | null;
  noAutoSnapshot: boolean;
  snapshotCount: number;
  lastSnapshotAt: number | null;
}

export type SnapshotSource = 'change' | 'interval' | 'manual' | 'pre-rewind';

export interface Snapshot {
  id: number;
  fileId: number;
  contentHash: string;
  sizeBytes: number;
  deltaBytes: number;
  source: SnapshotSource;
  createdAt: number;
  note: string | null;
}

export interface NoteHit {
  kind: 'file' | 'snapshot';
  id: number;
  fileId: number | null;
  folderId: number;
  label: string;
  note: string;
  createdAt: number | null;
}

export interface DedupStats {
  physicalBytes: number;
  logicalBytes: number;
  savedBytes: number;
  dedupRatio: number;
}


export interface DiffLine {
  kind: string;
  content: string;
  old_lineno: number | null;
  new_lineno: number | null;
}

export interface DiffResult {
  lines: DiffLine[];
  is_binary: boolean;
  too_large: boolean;
}


export interface RewindResult {
  preRewindSnapshotId: number | null;
  restoredSnapshotId: number;
}

export interface GlobalSettings {
  global_size_cap_mb: number | null;
  log_level: string;
  close_to_tray: boolean;
  start_on_boot: boolean;
}


export interface SnapshotCreatedPayload {
  folder_id: number;
  file_id: number;
  snapshot_id: number;
}

export interface FileRenamedPayload {
  folder_id: number;
  file_id: number;
  old_path: string;
  new_path: string;
}

export interface ScanProgressPayload {
  folder_id: number;
  scanned: number;
  total: number;
}

export interface SnapshotSkippedPayload {
  folder_id: number;
  rel_path: string;
  reason: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  context: string;
}


export interface ActivityEntry {
  id: number;
  folderId: number;
  timestamp: number;
  action: string;
  relPath: string | null;
  reason: string | null;
  snapshotId: number | null;
}

export interface StorageEntry {
  relPath: string;
  snapshotCount: number;
  physicalBytes: number;
  logicalBytes: number;
}

export interface IntegrityResult {
  dbOk: boolean;
  dbMessages: string[];
  casChecked: number;
  casMissing: number;
}

export interface QaTestResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  duration_ms: number;
}


export type RecoverMode = 'export' | 'restore';
export type ConflictPolicy = 'overwrite' | 'skip';

export type SnapshotPreference = 'before' | 'after' | 'nearest';

export type SnapshotPoint =
  | { kind: 'latest' }
  | { kind: 'nthFromLatest'; offset: number }
  | {
      kind: 'asOf';
      timestamp_ms: number;

      preference: SnapshotPreference;

      toleranceMs?: number;
    };

export interface BulkRecoverArgs {
  folderId: number;
  mode: RecoverMode;
  destination?: string;
  selectedPaths: string[];
  snapshotPoint: SnapshotPoint;
  ignorePatterns?: string[];
  includeDeleted?: boolean;
  dryRun?: boolean;
  conflictPolicy?: ConflictPolicy;

  perFileSnapshots?: Record<string, number>;
}

export interface RecoverFailure {
  relPath: string;
  error: string;
}

export interface PreviewItem {
  relPath: string;
  snapshotAt: number | null;
  snapshotSource: string | null;
  sizeBytes: number | null;
  skipReason: string | null;
}

export interface BulkRecoverResult {
  total: number;
  succeeded: number;

  skipped: number;
  failed: RecoverFailure[];
  preRewindSnapshotIds: number[];
  bytesWritten: number;
  dryRun: boolean;
  abortedReason: string | null;
  requiresConflictResolution: boolean;
  conflicts: string[];

  preview: PreviewItem[] | null;
}

export interface RecoverProgressPayload {
  folderId: number;
  processed: number;
  total: number;
  currentPath: string;
}
