import { createPortal } from 'react-dom';
import type { ContextMenuItem } from '@/hooks/useContextMenu';

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const W = 192;
  const margin = 8;


  const clampedX = Math.min(x, window.innerWidth  - W       - margin);
  const clampedY = Math.min(y, window.innerHeight - estimateHeight(items) - margin);
  const finalX = Math.max(margin, clampedX);
  const finalY = Math.max(margin, clampedY);

  return createPortal(
    <div
      data-ctx-menu
      style={{ position: 'fixed', top: finalY, left: finalX, width: W, zIndex: 9999 }}
      className="bg-card/98 backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden
                 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]
                 animate-scale-in py-1"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.separator && (
            <div className="mx-2 my-1 border-t border-border/40" />
          )}
          <button
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 py-1.5 px-3 text-xs transition-colors text-left
              ${item.variant === 'destructive'
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-secondary'
              }
              ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            {item.icon && (
              <span className="shrink-0 text-muted-foreground opacity-70">
                {item.icon}
              </span>
            )}
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}


function estimateHeight(items: ContextMenuItem[]): number {
  return items.reduce((h, item) => h + 30 + (item.separator ? 10 : 0), 8);
}
