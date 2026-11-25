import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { gsap, dur } from '@/lib/motion';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

interface Props<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className = '', ariaLabel }: Props<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pill = pillRef.current;
    if (!root || !pill) return;
    const el = root.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`);
    if (!el) return;
    const target = { x: el.offsetLeft, width: el.offsetWidth };
    if (first.current) {
      gsap.set(pill, target);
      first.current = false;
      return;
    }
    gsap.to(pill, { ...target, duration: dur(0.42), ease: 'zftm', overwrite: 'auto' });
  }, [value, options]);

  return (
    <div
      ref={rootRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative inline-flex items-center p-[3px] rounded-[calc(10px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] ${className}`}
    >
      <span
        ref={pillRef}
        aria-hidden
        className="absolute top-[3px] bottom-[3px] left-0 rounded-[calc(7px*var(--rs))] bg-surface-raised
                   shadow-[inset_0_1px_0_0_hsl(var(--highlight)),0_0_0_1px_hsl(var(--line)),0_1px_3px_-1px_hsl(var(--shadow)/0.35),0_4px_10px_-6px_hsl(var(--shadow)/0.4)]"
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={opt.value}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex items-center gap-1.5 rounded-[calc(7px*var(--rs))] font-medium whitespace-nowrap
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60
                        ${size === 'sm' ? 'h-6 px-2.5 text-2xs' : 'h-7 px-3 text-xs'}
                        ${active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {opt.icon}
            {opt.label}
            {opt.count != null && opt.count > 0 && (
              <span className={`tabular-nums text-2xs ${active ? 'text-muted-foreground' : 'text-faint'}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
