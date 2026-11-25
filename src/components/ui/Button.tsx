import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet-danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-foreground shadow-button hover:brightness-[1.08] active:brightness-95',
  secondary:
    'bg-surface-raised text-foreground shadow-control hover:bg-foreground/[0.06]',
  ghost:
    'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]',
  danger:
    'bg-destructive text-destructive-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.2),0_1px_2px_0_hsl(var(--shadow)/0.3),0_4px_12px_-6px_hsl(var(--destructive)/0.6)] hover:brightness-[1.06]',
  'quiet-danger':
    'text-destructive hover:bg-destructive/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-sm',
  md: 'h-8 px-3.5 text-sm gap-2 rounded-md',
  lg: 'h-10 px-5 text-base gap-2 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'secondary', size = 'md', icon, trailing, loading, children, className = '', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`press inline-flex items-center justify-center font-medium whitespace-nowrap select-none
                  disabled:opacity-45 disabled:pointer-events-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-0
                  ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={size === 'lg' ? 15 : 13} /> : icon}
      {children}
      {trailing}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', active, className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      data-tip={label}
      className={`press inline-flex items-center justify-center shrink-0 rounded-md
                  disabled:opacity-40 disabled:pointer-events-none
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70
                  ${size === 'sm' ? 'w-7 h-7' : 'w-8 h-8'}
                  ${active
                    ? 'text-foreground bg-foreground/[0.08]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]'}
                  ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
