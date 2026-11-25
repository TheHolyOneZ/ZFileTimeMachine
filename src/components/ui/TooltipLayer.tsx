import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { gsap, dur } from '@/lib/motion';

interface Tip { text: string; x: number; y: number; below: boolean }

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);
  const warm = useRef(0);

  useEffect(() => {
    function hide() {
      if (timer.current) clearTimeout(timer.current);
      current.current = null;
      setTip(null);
    }
    function onOver(e: PointerEvent) {
      const el = (e.target as Element | null)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el === current.current) return;
      if (timer.current) clearTimeout(timer.current);
      if (!el) {
        if (current.current) warm.current = Date.now();
        current.current = null;
        setTip(null);
        return;
      }
      current.current = el;
      const quick = Date.now() - warm.current < 600;
      timer.current = setTimeout(() => {
        const text = el.dataset.tip;
        if (!text || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 48 || el.dataset.tipSide === 'bottom';
        setTip({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
      }, quick ? 40 : 520);
    }
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('keydown', hide, true);
    window.addEventListener('blur', hide);
    document.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('keydown', hide, true);
      window.removeEventListener('blur', hide);
      document.removeEventListener('scroll', hide, true);
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!tip || !el) return;
    const w = el.offsetWidth;
    const left = Math.max(8, Math.min(tip.x - w / 2, window.innerWidth - w - 8));
    gsap.set(el, { left, top: tip.below ? tip.y : tip.y - el.offsetHeight });
    gsap.fromTo(el, { autoAlpha: 0, y: tip.below ? -3 : 3, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.22), ease: 'zftm' });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="fixed z-[90] pointer-events-none invisible max-w-[260px] px-2 py-1 rounded-[calc(7px*var(--rs))] text-2xs font-medium
                 bg-[hsl(228_10%_16%)] text-[hsl(225_20%_94%)] shadow-[0_0_0_1px_hsl(0_0%_100%/0.08),0_6px_18px_-6px_hsl(230_40%_2%/0.6)]"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
