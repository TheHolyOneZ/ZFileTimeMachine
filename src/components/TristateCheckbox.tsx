import { Minus, Check } from 'lucide-react';

export type CheckState = 'checked' | 'unchecked' | 'indeterminate';

interface Props {
  state: CheckState;
  onToggle: () => void;
  disabled?: boolean;
  size?: number;
}

export function TristateCheckbox({ state, onToggle, disabled, size = 14 }: Props) {
  const filled = state !== 'unchecked';

  return (
    <button
      role="checkbox"
      aria-checked={state === 'indeterminate' ? 'mixed' : state === 'checked'}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onToggle(); }}
      disabled={disabled}
      className={`shrink-0 rounded flex items-center justify-center border transition-all
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                  ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  ${filled
                    ? 'bg-primary border-primary'
                    : 'bg-transparent border-border/60 hover:border-primary/60'
                  }`}
      style={{ width: size, height: size }}
    >
      {state === 'checked' && <Check strokeWidth={3} className="text-primary-foreground" style={{ width: size * 0.65, height: size * 0.65 }} />}
      {state === 'indeterminate' && <Minus strokeWidth={3} className="text-primary-foreground" style={{ width: size * 0.65, height: size * 0.65 }} />}
    </button>
  );
}
