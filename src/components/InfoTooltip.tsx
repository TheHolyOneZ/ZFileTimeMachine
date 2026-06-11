import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';
import { computePopupPos, type PopupPos } from '@/lib/popup';

const POPUP_WIDTH = 288;

interface Props {
  title: string;
  body: React.ReactNode;
  iconSize?: number;
  placement?: 'top' | 'bottom';
}

export function InfoTooltip({ title, body, iconSize = 13 }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const compute = useCallback(() => {
    if (!btnRef.current) return;
    setPos(computePopupPos(btnRef.current.getBoundingClientRect(), POPUP_WIDTH, 280));
  }, []);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open) compute();
    setOpen((v) => !v);
  }

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-infotooltip]')) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    function onScroll() { setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        data-infotooltip
        className={`p-0.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
          open ? 'text-primary' : 'text-muted-foreground/40 hover:text-primary'
        }`}
        aria-label="More information"
      >
        <Info size={iconSize} />
      </button>

      {open && pos && createPortal(
        <div
          data-infotooltip
          style={{
            position: 'fixed',
            top: pos.top,
            bottom: pos.bottom,
            left: pos.left,
            width: POPUP_WIDTH,
            maxHeight: pos.maxHeight,
            zIndex: 9999,
          }}
          className="animate-scale-in overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-card/98 backdrop-blur-sm border border-border/60 rounded-xl overflow-hidden
                          shadow-[0_16px_48px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.04)] relative">

            <div
              style={{ left: pos.arrowOffset }}
              className={`absolute -translate-x-1/2 w-2.5 h-2.5 rotate-45 bg-secondary/60 ${
                pos.above
                  ? '-bottom-[5px] border-r border-b border-border/60'
                  : '-top-[5px] border-l border-t border-border/60'
              }`}
            />

            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-secondary/30 border-b border-border/50">
              <p className="text-xs font-semibold text-foreground/90 leading-tight">{title}</p>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
              >
                <X size={10} />
              </button>
            </div>

            <div className="px-3.5 py-3 text-xs text-muted-foreground/80 leading-relaxed space-y-1.5">
              {body}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
