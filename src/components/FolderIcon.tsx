import {
  Folder, FolderOpen, Code2, Terminal, FileCode2,
  BookOpen, Book, FileText, Database, Server, Cloud,
  Briefcase, Archive, Package, Music2, Film, Camera,
  Globe, Cpu, Layers, Star, Heart, Zap, Shield, Home, Box,
  type LucideProps,
} from 'lucide-react';

const ICON_MAP: Record<string, React.FC<LucideProps>> = {
  Folder, FolderOpen,
  Code2, Terminal, FileCode2,
  BookOpen, Book, FileText,
  Database, Server, Cloud,
  Briefcase, Archive, Package,
  Music2, Film, Camera,
  Globe, Cpu, Layers,
  Star, Heart, Zap,
  Shield, Home, Box,
};

interface Props {
  name?: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function FolderIcon({ name, size = 20, className, style }: Props) {
  const Icon = (name && ICON_MAP[name]) ? ICON_MAP[name] : Folder;
  return <Icon size={size} className={className} style={style} />;
}

export { ICON_MAP };
