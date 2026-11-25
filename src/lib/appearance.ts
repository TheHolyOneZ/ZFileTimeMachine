import { invoke } from '@tauri-apps/api/core';

export type Mode = 'dark' | 'light' | 'system';
export type Theme = 'dark' | 'light';
export type FolderIconColors = 'own' | 'accent';

export interface Appearance {
  mode: Mode;
  palette: string;
  accent: string;
  radius: number;
  folderIcons: FolderIconColors;
}

export interface Palette { id: string; label: string; hue: number; sat: number; darkShift: number; lightShift: number }
export interface Accent { id: string; label: string; dark: [number, number, number]; light: [number, number, number] }

export const PALETTES: Palette[] = [
  { id: 'graphite', label: 'Graphite', hue: 228, sat: 1, darkShift: 0, lightShift: 0 },
  { id: 'midnight', label: 'Midnight', hue: 222, sat: 3.2, darkShift: 0.5, lightShift: 0 },
  { id: 'obsidian', label: 'Obsidian', hue: 240, sat: 0.15, darkShift: -4.5, lightShift: 1.5 },
  { id: 'slate', label: 'Slate', hue: 214, sat: 2.3, darkShift: 5, lightShift: -1.5 },
  { id: 'forest', label: 'Forest', hue: 152, sat: 1.9, darkShift: 0, lightShift: 0 },
  { id: 'mocha', label: 'Mocha', hue: 28, sat: 2, darkShift: 0.5, lightShift: -0.5 },
  { id: 'plum', label: 'Plum', hue: 284, sat: 1.8, darkShift: 0.5, lightShift: 0 },
];

export const ACCENTS: Accent[] = [
  { id: 'blue', label: 'Blue', dark: [214, 92, 63], light: [214, 88, 50] },
  { id: 'indigo', label: 'Indigo', dark: [236, 84, 70], light: [236, 68, 56] },
  { id: 'violet', label: 'Violet', dark: [262, 83, 72], light: [262, 66, 56] },
  { id: 'pink', label: 'Pink', dark: [330, 82, 70], light: [330, 72, 50] },
  { id: 'red', label: 'Red', dark: [356, 84, 66], light: [356, 72, 50] },
  { id: 'orange', label: 'Orange', dark: [24, 94, 62], light: [22, 88, 48] },
  { id: 'amber', label: 'Amber', dark: [40, 96, 58], light: [34, 94, 40] },
  { id: 'green', label: 'Green', dark: [150, 58, 52], light: [152, 72, 29] },
  { id: 'teal', label: 'Teal', dark: [178, 66, 48], light: [182, 82, 27] },
  { id: 'mono', label: 'Graphite', dark: [222, 12, 86], light: [225, 16, 22] },
];

export const RADII = [
  { value: 0.2, label: 'Sharp' },
  { value: 0.55, label: 'Crisp' },
  { value: 1, label: 'Soft' },
  { value: 1.45, label: 'Round' },
];

export const DEFAULT_APPEARANCE: Appearance = { mode: 'dark', palette: 'graphite', accent: 'blue', radius: 1, folderIcons: 'own' };

const KEY = 'zftm-appearance';
const LEGACY_KEY = 'zftm-theme';

type Tok = [number, number, number];

const DARK: Record<string, Tok> = {
  canvas: [228, 9, 6.5], sidebar: [228, 9, 6.5], surface: [228, 8, 9.5], 'surface-raised': [228, 8, 12], 'surface-sunken': [228, 9, 7.5],
  background: [228, 8, 9.5], foreground: [225, 20, 94], card: [228, 8, 11.5], 'card-foreground': [225, 20, 94],
  popover: [228, 8, 12.5], 'popover-foreground': [225, 20, 94], secondary: [228, 7, 15], 'secondary-foreground': [225, 20, 94],
  muted: [228, 7, 15], 'muted-foreground': [226, 9, 64], faint: [226, 7, 45], accent: [228, 7, 15], 'accent-foreground': [225, 20, 94],
  border: [228, 8, 16], input: [228, 7, 17], shadow: [230, 40, 2],
};

const LIGHT: Record<string, Tok> = {
  canvas: [228, 14, 92.5], sidebar: [228, 14, 92.5], surface: [0, 0, 100], 'surface-raised': [228, 25, 98.6], 'surface-sunken': [228, 18, 96.5],
  background: [0, 0, 100], foreground: [228, 18, 11], card: [0, 0, 100], 'card-foreground': [228, 18, 11],
  popover: [0, 0, 100], 'popover-foreground': [228, 18, 11], secondary: [228, 16, 95], 'secondary-foreground': [228, 18, 11],
  muted: [228, 16, 95], 'muted-foreground': [226, 8, 40], faint: [226, 6, 56], accent: [228, 16, 93], 'accent-foreground': [228, 18, 11],
  border: [228, 12, 89], input: [228, 12, 87], shadow: [228, 30, 30],
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fmt = (h: number, s: number, l: number) => `${Math.round(h)} ${+s.toFixed(1)}% ${+l.toFixed(1)}%`;

function tint(table: Record<string, Tok>, p: Palette, dark: boolean) {
  const out: Record<string, Tok> = {};
  for (const [name, [h, s, l]] of Object.entries(table)) {
    if (l === 100 && s === 0) {
      out[name] = p.id === 'graphite' ? [h, s, l] : [p.hue, clamp(p.sat * 3, 0, 30), clamp(99.5 + p.lightShift * 0.3, 96, 100)];
      continue;
    }
    const text = dark ? l > 40 && name !== 'shadow' : l < 60;
    const shift = name === 'faint' && dark ? Math.max(0, p.darkShift) * 0.6 : text ? 0 : dark ? p.darkShift : p.lightShift;
    out[name] = [p.id === 'graphite' ? h : p.hue, clamp(s * (text ? Math.min(p.sat, 1.4) : p.sat), 0, 60), clamp(l + shift, 0, 100)];
  }
  return out;
}

export function hexToHsl(hex: string): Tok | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function luminance([h, s, l]: Tok) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

export function accentColors(accent: string): { dark: Tok; light: Tok } {
  if (accent.startsWith('#')) {
    const hsl = hexToHsl(accent) ?? ACCENTS[0].dark;
    const dark: Tok = [hsl[0], hsl[1], clamp(hsl[2], 45, 88)];
    const light: Tok = [hsl[0], hsl[1], clamp(hsl[2], 15, 60)];
    while (luminance(dark) < 0.16 && dark[2] < 90) dark[2] += 1;
    while (luminance(light) > 0.27 && light[2] > 10) light[2] -= 1;
    return { dark, light };
  }
  const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
  return { dark: a.dark, light: a.light };
}

function accentVars(c: Tok) {
  const l = luminance(c);
  const darkText: Tok = [228, 30, 7];
  const onDark = (l + 0.05) / (luminance(darkText) + 0.05);
  const onWhite = 1.05 / (l + 0.05);
  const fg = onDark > onWhite ? fmt(...darkText) : '0 0% 100%';
  return `--primary:${fmt(...c)};--ring:${fmt(...c)};--primary-foreground:${fg};`;
}

function vars(t: Record<string, Tok>) {
  return Object.entries(t).map(([k, v]) => `--${k}:${fmt(...v)};`).join('');
}

export function buildCss(a: Appearance) {
  const p = PALETTES.find((x) => x.id === a.palette) ?? PALETTES[0];
  const d = tint(DARK, p, true);
  const l = tint(LIGHT, p, false);
  const acc = accentColors(a.accent);
  const scrimDark = `${fmt(d.shadow[0], d.shadow[1], 3)} / 0.55`;
  return [
    `html:root{${vars(d)}${accentVars(acc.dark)}--scrim:${scrimDark};--rs:${a.radius};}`,
    `html:root.light{${vars(l)}${accentVars(acc.light)}--scrim:${fmt(l.shadow[0], 30, 20)} / 0.2;}`,
    `html:root.has-material{--canvas:${fmt(...d.canvas)} / 0;--sidebar:${fmt(d.sidebar[0], d.sidebar[1] + 3, d.sidebar[2] + 1.5)} / 0.42;}`,
    `html:root.light.has-material{--canvas:${fmt(...l.canvas)} / 0;--sidebar:${fmt(l.sidebar[0], l.sidebar[1] + 6, 97)} / 0.38;}`,
    a.folderIcons === 'accent' ? 'html:root:root .folder-color{--fc:var(--primary);}' : '',
  ].join('\n');
}

export function loadAppearance(): Appearance {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Appearance>;
      return {
        mode: v.mode === 'light' || v.mode === 'system' ? v.mode : 'dark',
        palette: PALETTES.some((p) => p.id === v.palette) ? v.palette! : 'graphite',
        accent: typeof v.accent === 'string' && (v.accent.startsWith('#') ? !!hexToHsl(v.accent) : ACCENTS.some((x) => x.id === v.accent)) ? v.accent : 'blue',
        radius: typeof v.radius === 'number' && v.radius >= 0 && v.radius <= 2 ? v.radius : 1,
        folderIcons: v.folderIcons === 'accent' ? 'accent' : 'own',
      };
    }
  } catch {
    localStorage.removeItem(KEY);
  }
  return { ...DEFAULT_APPEARANCE, mode: localStorage.getItem(LEGACY_KEY) === 'light' ? 'light' : 'dark' };
}

const systemQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function resolveMode(mode: Mode): Theme {
  if (mode === 'system') return systemQuery().matches ? 'dark' : 'light';
  return mode;
}

let current: Appearance = DEFAULT_APPEARANCE;
const listeners = new Set<(a: Appearance) => void>();

function applyNow(a: Appearance) {
  let style = document.getElementById('zftm-appearance') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'zftm-appearance';
    document.head.appendChild(style);
  }
  style.textContent = buildCss(a);
  const theme = resolveMode(a.mode);
  const root = document.documentElement;
  root.classList.toggle('light', theme === 'light');
  root.classList.toggle('dark', theme === 'dark');
  void invoke('set_window_theme', { theme }).catch(() => {});
}

function withTransition(update: () => void, origin?: { x: number; y: number }, reveal = false) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  if (!doc.startViewTransition || reduce) { update(); return; }
  const transition = doc.startViewTransition(update);
  transition.ready.catch(() => {});
  if (!reveal) return;
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  }, () => {});
}

export function initAppearance() {
  current = loadAppearance();
  applyNow(current);
  systemQuery().addEventListener('change', () => {
    if (current.mode === 'system') withTransition(() => applyNow(current));
  });
}

export function getAppearance() {
  return current;
}

export function setAppearance(patch: Partial<Appearance>, origin?: { x: number; y: number }) {
  const prevTheme = resolveMode(current.mode);
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  localStorage.removeItem(LEGACY_KEY);
  const themeChanged = resolveMode(current.mode) !== prevTheme;
  const next = current;
  const direct = Object.keys(patch).length === 1 && (patch.radius !== undefined || patch.accent?.startsWith('#'));
  if (direct) applyNow(next);
  else withTransition(() => applyNow(next), origin, themeChanged);
  listeners.forEach((fn) => fn(next));
}

export function subscribeAppearance(fn: (a: Appearance) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function previewColors(paletteId: string, theme: Theme) {
  const p = PALETTES.find((x) => x.id === paletteId) ?? PALETTES[0];
  const t = tint(theme === 'dark' ? DARK : LIGHT, p, theme === 'dark');
  const c = (k: string) => `hsl(${fmt(...t[k])})`;
  return { canvas: c('canvas'), surface: c('surface'), card: c('card'), line: c('border'), text: c('foreground'), faint: c('faint') };
}

export function accentCss(accent: string, theme: Theme) {
  const c = accentColors(accent)[theme];
  return `hsl(${fmt(...c)})`;
}

export function accentTokens(accent: string): { dark: string; light: string } {
  const c = accentColors(accent);
  return { dark: fmt(...c.dark), light: fmt(...c.light) };
}
