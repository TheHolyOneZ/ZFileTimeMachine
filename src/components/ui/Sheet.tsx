import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { gsap, dur } from '@/lib/motion';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  align?: 'center' | 'top';
  label?: string;
  dismissible?: boolean;
  className?: string;
  role?: 'dialog' | 'alertdialog';
}

const openStack: number[] = [];
let nextId = 1;

export function Sheet({
  open, onClose, children, width = 440, align = 'center', label, dismissible = true, className = '', role = 'dialog',
}: Props) {
  const [mounted, setMounted] = useState(open);
  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const idRef = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    const backdrop = backdropRef.current;
    const panel = panelRef.current;
    if (!mounted || !backdrop || !panel) return;
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement | null;
      idRef.current = nextId++;
      openStack.push(idRef.current);
      const tl = gsap.timeline();
      tl.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur(0.32), ease: 'power1.out' }, 0);
      tl.fromTo(
        panel,
        { autoAlpha: 0, scale: 0.965, y: align === 'top' ? -10 : 14, filter: 'blur(6px)' },
        { autoAlpha: 1, scale: 1, y: 0, filter: 'blur(0px)', duration: dur(0.5), ease: 'zftm', clearProps: 'filter' },
        0,
      );
      requestAnimationFrame(() => {
        const target = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
          ?? panel.querySelector<HTMLElement>('input, textarea, button:not([disabled])');
        target?.focus({ preventScroll: true });
      });
      return () => { tl.kill(); };
    }
    const index = openStack.indexOf(idRef.current);
    if (index !== -1) openStack.splice(index, 1);
    const tl = gsap.timeline({
      onComplete: () => {
        setMounted(false);
        restoreFocus.current?.focus?.({ preventScroll: true });
      },
    });
    tl.to(backdrop, { autoAlpha: 0, duration: dur(0.22), ease: 'power1.in' }, 0);
    tl.to(panel, { autoAlpha: 0, scale: 0.975, y: align === 'top' ? -6 : 8, duration: dur(0.2), ease: 'zftm-in' }, 0);
    return () => { tl.kill(); };
  }, [open, mounted, align]);

  useEffect(() => () => {
    const index = openStack.indexOf(idRef.current);
    if (index !== -1) openStack.splice(index, 1);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (openStack[openStack.length - 1] !== idRef.current) return;
      if (e.key === 'Escape' && dismissible) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, dismissible]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex justify-center px-6 ${align === 'top' ? 'items-start pt-[12vh]' : 'items-center py-8'}`}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-[hsl(var(--scrim))] backdrop-blur-[3px] invisible"
        onMouseDown={() => dismissible && open && onClose()}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={label}
        style={{ width, maxWidth: '100%' }}
        className={`bezel relative invisible will-change-transform max-h-full flex ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bezel-core flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SheetHeader({ title, description, icon, onClose }: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start gap-3.5 px-6 pt-6 pb-2 shrink-0">
      {icon && (
        <div className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.06] shadow-[inset_0_0_0_1px_hsl(var(--line))] flex items-center justify-center shrink-0 text-foreground/80">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0 pt-0.5">
        <h2 className="text-md font-semibold text-foreground leading-tight">{title}</h2>
        {description && <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{description}</div>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="press -mr-2 -mt-1 w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07]"
        >
          <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  );
}

export function SheetFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-end gap-2 px-6 py-4 shrink-0 ${className}`}>
      {children}
    </div>
  );
}
