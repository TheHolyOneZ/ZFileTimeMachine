import type { CSSProperties } from 'react';
import { accentTokens, hexToHsl } from './appearance';

export interface ColorDef {
  id: string;
  label: string;
  hex: string;
}

export const ACCENT_COLOR = 'accent';

export const FOLDER_COLORS: ColorDef[] = [
  { id: 'blue', label: 'Blue', hex: '#60a5fa' },
  { id: 'violet', label: 'Violet', hex: '#a78bfa' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'amber', label: 'Amber', hex: '#fbbf24' },
  { id: 'emerald', label: 'Emerald', hex: '#34d399' },
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'orange', label: 'Orange', hex: '#fb923c' },
  { id: 'pink', label: 'Pink', hex: '#f472b6' },
  { id: 'slate', label: 'Slate', hex: '#94a3b8' },
];

export function folderHex(color?: string | null): string | null {
  if (!color) return null;
  if (color.startsWith('#')) return hexToHsl(color) ? color : null;
  return FOLDER_COLORS.find((c) => c.id === color)?.hex ?? null;
}

export function followsAccent(color?: string | null) {
  return folderHex(color) === null;
}

export function folderTint(color?: string | null): { className: string; style: CSSProperties } {
  const hex = folderHex(color);
  const tokens = hex ? accentTokens(hex) : { dark: 'var(--primary)', light: 'var(--primary)' };
  return { className: 'folder-color', style: { '--fd': tokens.dark, '--fl': tokens.light } as CSSProperties };
}

export const FOLDER_ICON_NAMES = [
  'Folder', 'FolderOpen',
  'Code2', 'Terminal', 'FileCode2',
  'BookOpen', 'Book', 'FileText',
  'Database', 'Server', 'Cloud',
  'Briefcase', 'Archive', 'Package',
  'Music2', 'Film', 'Camera',
  'Globe', 'Cpu', 'Layers',
  'Star', 'Heart', 'Zap',
  'Shield', 'Home', 'Box',
] as const;

export type FolderIconName = typeof FOLDER_ICON_NAMES[number];

export const DEFAULT_ICON: FolderIconName = 'Folder';
