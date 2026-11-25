import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { computePopupPos, type PopupPos } from '@/lib/popup';
import { gsap, dur } from '@/lib/motion';

interface Props {
  open: boolean;
  onClose: () => void;
  onEscape?: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  width?: number;
  estimatedHeight?: number;
  children: ReactNode;
  className?: string;
}

export function Popover({ open, onClose, onEscape, anchorRef, width = 300, estimatedHeight = 240, children, className = '' }: Props) {
  const [mounted, setMounted] = useState(open);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (open && anchorRef.current) {
      setPos(computePopupPos(anchorRef.current.getBoundingClientRect(), width, estimatedHeight));
      setMounted(true);
    }
  }, [open, anchorRef, width, estimatedHeight]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !mounted || !pos) return;
    const origin = `${pos.arrowOffset}px ${pos.above ? '100%' : '0%'}`;
    if (open) {
      gsap.fromTo(el, { autoAlpha: 0, scale: 0.94, y: pos.above ? 4 : -4, transformOrigin: origin },
        { autoAlpha: 1, scale: 1, y: 0, duration: dur(0.34), ease: 'zftm', overwrite: true });
    } else {
      gsap.to(el, { autoAlpha: 0, scale: 0.97, duration: dur(0.14), ease: 'power1.in', transformOrigin: origin, overwrite: true, onComplete: () => setMounted(false) });
    }
  }, [open, mounted, pos]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onCloseRef.current();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      (onEscapeRef.current ?? onCloseRef.current)();
    }
    function onScroll(e: Event) { if (!ref.current?.contains(e.target as Node)) onCloseRef.current(); }
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, anchorRef]);

  if (!mounted || !pos) return null;
  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, width, maxHeight: pos.maxHeight, zIndex: 80 }}
      className={`invisible overflow-auto rounded-xl glass shadow-overlay ${className}`}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
