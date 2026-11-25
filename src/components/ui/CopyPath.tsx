import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { formatPath } from '@/lib/tauri';

interface Props {
  path: string;
  display?: string;
  className?: string;
  mono?: boolean;
}

export function CopyPath({ path, display, className = '', mono = true }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  if (!path) return null;
  return (
    <button
      type="button"
      onClick={copy}
      data-tip={copied ? 'Copied' : 'Click to copy'}
      aria-label={`Copy ${path}`}
      className={`group/copy relative inline-flex items-center gap-1.5 max-w-full min-w-0 -mx-1 px-1 rounded-[calc(5px*var(--rs))] text-left
                  text-faint hover:text-muted-foreground hover:bg-foreground/[0.05] transition-colors ${className}`}
    >
      <span className={`truncate ${mono ? 'font-mono' : ''}`}>{display ?? formatPath(path)}</span>
      <span className={`shrink-0 transition-opacity duration-200 ${copied ? 'opacity-100 text-positive' : 'opacity-0 group-hover/copy:opacity-100'}`}>
        {copied ? <Check size={11} /> : <Copy size={11} />}
      </span>
    </button>
  );
}

export function joinPath(folderPath: string, relPath: string) {
  const sep = folderPath.includes('\\') && !folderPath.includes('/') ? '\\' : '/';
  const base = folderPath.replace(/[\\/]+$/, '');
  return `${base}${sep}${sep === '\\' ? relPath.replace(/\//g, '\\') : relPath}`;
}
