import { useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { Popover } from './ui/Popover';

interface Props {
  title: string;
  body: React.ReactNode;
  iconSize?: number;
  placement?: 'top' | 'bottom';
}

export function InfoTooltip({ title, body, iconSize = 13 }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`press w-5 h-5 rounded-full grid place-items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60
                    ${open ? 'text-foreground bg-foreground/[0.08]' : 'text-faint hover:text-foreground'}`}
        aria-label={`About ${title}`}
        aria-expanded={open}
      >
        <Info size={iconSize} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={288} estimatedHeight={200}>
        <div className="px-4 py-3.5">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <div className="mt-1.5 text-xs text-muted-foreground leading-relaxed space-y-1.5">{body}</div>
        </div>
      </Popover>
    </>
  );
}
