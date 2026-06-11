

export interface ColorDef {
  id: string;
  label: string;
  swatch: string;
  iconClass: string;
  bgClass: string;
  cardBorder: string;
  cardGlow: string;
  barClass: string;
  gradientFrom: string;
}

export const FOLDER_COLORS: ColorDef[] = [
  { id: 'blue',    label: 'Blue',    swatch: 'bg-blue-500',    iconClass: 'text-blue-400',    bgClass: 'bg-blue-500/15',    cardBorder: 'hover:border-blue-500/40',    cardGlow: 'hover:shadow-[0_8px_32px_hsl(217_91%_60%/0.18)]',  barClass: 'bg-blue-500',    gradientFrom: 'from-blue-500/[0.07]'    },
  { id: 'violet',  label: 'Violet',  swatch: 'bg-violet-500',  iconClass: 'text-violet-400',  bgClass: 'bg-violet-500/15',  cardBorder: 'hover:border-violet-500/40',  cardGlow: 'hover:shadow-[0_8px_32px_rgba(139,92,246,0.18)]',   barClass: 'bg-violet-500',  gradientFrom: 'from-violet-500/[0.07]'  },
  { id: 'rose',    label: 'Rose',    swatch: 'bg-rose-500',    iconClass: 'text-rose-400',    bgClass: 'bg-rose-500/15',    cardBorder: 'hover:border-rose-500/40',    cardGlow: 'hover:shadow-[0_8px_32px_rgba(244,63,94,0.18)]',    barClass: 'bg-rose-500',    gradientFrom: 'from-rose-500/[0.07]'    },
  { id: 'amber',   label: 'Amber',   swatch: 'bg-amber-500',   iconClass: 'text-amber-400',   bgClass: 'bg-amber-500/15',   cardBorder: 'hover:border-amber-500/40',   cardGlow: 'hover:shadow-[0_8px_32px_rgba(245,158,11,0.18)]',   barClass: 'bg-amber-500',   gradientFrom: 'from-amber-500/[0.07]'   },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500', iconClass: 'text-emerald-400', bgClass: 'bg-emerald-500/15', cardBorder: 'hover:border-emerald-500/40', cardGlow: 'hover:shadow-[0_8px_32px_rgba(16,185,129,0.18)]',   barClass: 'bg-emerald-500', gradientFrom: 'from-emerald-500/[0.07]' },
  { id: 'cyan',    label: 'Cyan',    swatch: 'bg-cyan-500',    iconClass: 'text-cyan-400',    bgClass: 'bg-cyan-500/15',    cardBorder: 'hover:border-cyan-500/40',    cardGlow: 'hover:shadow-[0_8px_32px_rgba(6,182,212,0.18)]',    barClass: 'bg-cyan-500',    gradientFrom: 'from-cyan-500/[0.07]'    },
  { id: 'orange',  label: 'Orange',  swatch: 'bg-orange-500',  iconClass: 'text-orange-400',  bgClass: 'bg-orange-500/15',  cardBorder: 'hover:border-orange-500/40',  cardGlow: 'hover:shadow-[0_8px_32px_rgba(249,115,22,0.18)]',   barClass: 'bg-orange-500',  gradientFrom: 'from-orange-500/[0.07]'  },
  { id: 'pink',    label: 'Pink',    swatch: 'bg-pink-500',    iconClass: 'text-pink-400',    bgClass: 'bg-pink-500/15',    cardBorder: 'hover:border-pink-500/40',    cardGlow: 'hover:shadow-[0_8px_32px_rgba(236,72,153,0.18)]',   barClass: 'bg-pink-500',    gradientFrom: 'from-pink-500/[0.07]'    },
  { id: 'slate',   label: 'Slate',   swatch: 'bg-slate-400',   iconClass: 'text-slate-400',   bgClass: 'bg-slate-500/15',   cardBorder: 'hover:border-slate-500/40',   cardGlow: 'hover:shadow-[0_8px_32px_rgba(100,116,139,0.18)]',  barClass: 'bg-slate-400',   gradientFrom: 'from-slate-500/[0.07]'   },
];

export const DEFAULT_COLOR = FOLDER_COLORS[0];

export function getColor(id?: string): ColorDef {
  return FOLDER_COLORS.find((c) => c.id === id) ?? DEFAULT_COLOR;
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
