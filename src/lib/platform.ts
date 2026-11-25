import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getAppearance, initAppearance, resolveMode, setAppearance, type Theme } from './appearance';

export const IS_MAC = /Mac/i.test(navigator.userAgent);

export type { Theme } from './appearance';
export type WindowMaterial = 'vibrancy' | 'mica' | 'none';

export function storedTheme(): Theme {
  return resolveMode(getAppearance().mode);
}

export function initTheme() {
  initAppearance();
}

export function setTheme(theme: Theme, origin?: { x: number; y: number }) {
  setAppearance({ mode: theme }, origin);
}

export async function initWindowMaterial(): Promise<WindowMaterial> {
  try {
    const material = await invoke<WindowMaterial>('get_window_material');
    document.documentElement.classList.toggle('has-material', material !== 'none');
    return material;
  } catch {
    return 'none';
  }
}

export function snapshotImageUrl(snapshotId: number): string {
  return convertFileSrc(String(snapshotId), 'zftm-snapshot');
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);

export function isPreviewableImage(relPath: string): boolean {
  const name = relPath.split('/').pop() ?? relPath;
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXT.has(name.slice(dot + 1).toLowerCase());
}
