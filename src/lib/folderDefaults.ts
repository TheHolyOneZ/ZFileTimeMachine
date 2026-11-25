import type { FolderConfig } from './types';

export const DEFAULT_GLOBS = ['node_modules/', 'target/', '.git/', '*.tmp', '*.log'];

export const DEFAULT_CONFIG: FolderConfig = {
  trigger: { type: 'OnChange' },
  retention: { type: 'KeepLast', count: 10 },
  ignore_globs: DEFAULT_GLOBS,
  binary_max_mb: 50,
  binary_keep_last: 3,
};

export const COMMON_PATTERNS = [
  'node_modules/', '.git/', 'target/', 'dist/', 'build/', '.next/', '.venv/', '__pycache__/',
  'vendor/', 'coverage/', '.cache/', '*.log', '*.tmp', '.DS_Store',
];
