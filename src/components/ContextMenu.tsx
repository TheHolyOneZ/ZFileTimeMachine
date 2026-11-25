import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { gsap, dur } from '@/lib/motion';

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const W = 216;
const MARGIN = 8;

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const flipX = x + W + MARGIN > window.innerWidth;
    const flipY = y + h + MARGIN > window.innerHeight;
    const left = Math.max(MARGIN, flipX ? x - W : x);
    const top = Math.max(MARGIN, flipY ? y - h : y);
    gsap.set(el, { left, top });
    gsap.fromTo(
      el,
      { autoAlpha: 0, scale: 0.92, transformOrigin: `${flipX ? '100%' : '0%'} ${flipY ? '100%' : '0%'}` },
      { autoAlpha: 1, scale: 1, duration: dur(0.28), ease: 'zftm' },
    );
    gsap.fromTo(
      el.querySelectorAll('[data-menu-item]'),
      { autoAlpha: 0, y: flipY ? 3 : -3 },
      { autoAlpha: 1, y: 0, duration: dur(0.26), stagger: 0.018, ease: 'zftm', delay: 0.02 },
    );
    const first = el.querySelector<HTMLButtonElement>('button:not(:disabled)');
    first?.focus({ preventScroll: true });
  }, [x, y]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }

  return createPortal(
    <div
      ref={ref}
      data-ctx-menu
      role="menu"
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', top: y, left: x, width: W, zIndex: 85 }}
      className="invisible glass rounded-xl shadow-overlay p-1"
    >
      {items.map((item, i) => (
        <div key={i} data-menu-item>
          {item.separator && <div className="mx-2 my-1 h-px bg-[hsl(var(--line))]" />}
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2.5 h-8 px-2.5 rounded-[calc(7px*var(--rs))] text-sm text-left outline-none
              disabled:opacity-40 disabled:pointer-events-none
              ${item.variant === 'destructive'
                ? 'text-destructive hover:bg-destructive/12 focus-visible:bg-destructive/12'
                : 'text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground group'}`}
          >
            {item.icon && (
              <span className={`shrink-0 grid place-items-center w-4 ${item.variant === 'destructive' ? '' : 'text-muted-foreground group-hover:text-primary-foreground group-focus-visible:text-primary-foreground'}`}>
                {item.icon}
              </span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
