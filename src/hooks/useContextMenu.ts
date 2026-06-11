import { useState, useCallback, useEffect } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
  separator?: boolean;
}

interface MenuState { x: number; y: number; items: ContextMenuItem[] }

export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const open = useCallback((e: React.MouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-ctx-menu]')) close();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu, close]);

  return { menu, open, close };
}
