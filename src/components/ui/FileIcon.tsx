import {
  File, FileCode2, FileText, FileJson, Image, FileArchive, FileSpreadsheet,
  FileAudio, FileVideo, FileType2, FileTerminal, FileCog, Binary, Folder, FolderOpen,
  type LucideProps,
} from 'lucide-react';

const BY_EXT: Record<string, React.FC<LucideProps>> = {};
const add = (icon: React.FC<LucideProps>, exts: string) => exts.split(' ').forEach((e) => { BY_EXT[e] = icon; });

add(FileCode2, 'ts tsx js jsx mjs cjs rs go py rb php java kt swift c h cpp hpp cc cs lua vue svelte astro html htm css scss sass less sql dart zig ex exs elm hs clj scala r');
add(FileText, 'md mdx txt rst org tex bib adoc log');
add(FileJson, 'json jsonc json5 lock');
add(FileCog, 'toml yaml yml ini conf cfg env xml plist editorconfig gitignore');
add(Image, 'png jpg jpeg gif webp avif bmp ico svg tif tiff heic psd raw');
add(FileArchive, 'zip tar gz tgz bz2 xz 7z rar zst');
add(FileSpreadsheet, 'csv tsv xls xlsx ods numbers');
add(FileAudio, 'mp3 wav flac ogg m4a aac opus');
add(FileVideo, 'mp4 mov mkv webm avi m4v');
add(FileType2, 'ttf otf woff woff2');
add(FileTerminal, 'sh bash zsh fish ps1 bat cmd');

export function fileExt(relPath: string): string {
  const name = relPath.split('/').pop() ?? relPath;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : name.toLowerCase().replace(/^\./, '');
}

export function FileIcon({ path, binary, size = 15, className = '' }: { path: string; binary?: boolean; size?: number; className?: string }) {
  const Icon = BY_EXT[fileExt(path)] ?? (binary ? Binary : File);
  return <Icon size={size} className={`shrink-0 ${className}`} aria-hidden />;
}

export function DirIcon({ open, size = 15, className = '' }: { open?: boolean; size?: number; className?: string }) {
  const Icon = open ? FolderOpen : Folder;
  return <Icon size={size} className={`shrink-0 ${className}`} aria-hidden />;
}
