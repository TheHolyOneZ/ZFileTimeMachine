interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled, id }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`group relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-[2px]
                  transition-[background-color,box-shadow] duration-300 ease-zftm
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background
                  disabled:opacity-40
                  ${checked
                    ? 'bg-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)),0_0_12px_-2px_hsl(var(--primary)/0.5)]'
                    : 'bg-foreground/[0.14] shadow-[inset_0_0_0_1px_hsl(var(--line))]'}`}
    >
      <span
        className={`block h-[18px] w-[18px] rounded-full bg-white shadow-knob
                    transition-[transform,width] duration-[380ms] ease-zftm
                    group-active:w-[22px]
                    ${checked ? 'translate-x-4 group-active:translate-x-3' : 'translate-x-0'}`}
      />
    </button>
  );
}
