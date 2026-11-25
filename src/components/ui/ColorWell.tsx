import { useRef } from 'react';
import { Pipette } from 'lucide-react';
import { accentTokens } from '@/lib/appearance';

interface Props {
  value: string | null;
  fallback: string;
  onChange: (hex: string) => void;
}

const RAINBOW = 'conic-gradient(from 0deg, #f87171, #fbbf24, #4ade80, #22d3ee, #60a5fa, #c084fc, #f472b6, #f87171)';

export function ColorWell({ value, fallback, onChange }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const tokens = value ? accentTokens(value) : null;
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        aria-label="Pick your own color"
        aria-pressed={!!value}
        data-tip="Pick your own color"
        className={`press relative w-7 h-7 rounded-full grid place-items-center transition-[transform,box-shadow] duration-300 ease-zftm
                    ${value ? 'color-swatch shadow-[0_0_0_2px_hsl(var(--card)),0_0_0_4px_hsl(var(--foreground)/0.7)]' : 'hover:scale-110'}`}
        style={tokens ? ({ '--fd': tokens.dark, '--fl': tokens.light } as React.CSSProperties) : { background: RAINBOW }}
      >
        <Pipette size={12} className="text-white drop-shadow-[0_0_2px_rgb(0_0_0/0.7)]" />
        <input
          ref={ref}
          type="color"
          value={value ?? fallback}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden
        />
      </button>
      {value && <span className="text-xs font-mono text-muted-foreground uppercase">{value}</span>}
    </>
  );
}
