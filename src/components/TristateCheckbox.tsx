export type CheckState = 'checked' | 'unchecked' | 'indeterminate';

interface Props {
  state: CheckState;
  onToggle: () => void;
  disabled?: boolean;
  size?: number;
  label?: string;
}

export function TristateCheckbox({ state, onToggle, disabled, size = 15, label }: Props) {
  const filled = state !== 'unchecked';
  return (
    <button
      role="checkbox"
      aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      disabled={disabled}
      className={`press shrink-0 rounded-[calc(5px*var(--rs))] grid place-items-center transition-[background-color,box-shadow] duration-200 ease-zftm
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70
                  disabled:opacity-40
                  ${filled
                    ? 'bg-primary shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]'
                    : 'bg-surface shadow-[inset_0_0_0_1.5px_hsl(var(--foreground)/0.22)] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.7)]'}`}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 12 12" width={size * 0.7} height={size * 0.7} fill="none" aria-hidden className="text-primary-foreground">
        <path
          d={state === 'indeterminate' ? 'M2.5 6h7' : 'M2.4 6.3l2.4 2.4 4.8-5.2'}
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={filled ? 0 : 1}
          style={{ transition: 'stroke-dashoffset 260ms cubic-bezier(0.32,0.72,0,1)' }}
        />
      </svg>
    </button>
  );
}
