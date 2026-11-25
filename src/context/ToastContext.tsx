import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CircleCheck, CircleAlert, Info, X } from 'lucide-react';
import { gsap, dur } from '@/lib/motion';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
  leaving?: boolean;
}

interface ToastOptions {
  action?: ToastAction;
  duration?: number;
}

interface ToastCtx {
  toast: (kind: ToastKind, message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastCtx>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICON = {
  success: CircleCheck,
  error: CircleAlert,
  info: Info,
} as const;

const ICON_COLOR = {
  success: 'text-positive',
  error: 'text-negative',
  info: 'text-muted-foreground',
} as const;

let nextId = 1;

function ToastItem({ t, onDismiss, onRemoved }: { t: Toast; onDismiss: (id: number) => void; onRemoved: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ICON[t.kind];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!t.leaving) {
      gsap.fromTo(el, { autoAlpha: 0, y: 18, scale: 0.92 }, { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.6), ease: 'zftm', overwrite: true });
    } else {
      gsap.to(el, {
        overwrite: true,
        autoAlpha: 0, y: 10, scale: 0.96, duration: dur(0.22), ease: 'power1.in',
        onComplete: () => onRemoved(t.id),
      });
    }
  }, [t.leaving]);

  return (
    <div
      ref={ref}
      role={t.kind === 'error' ? 'alert' : 'status'}
      className="invisible pointer-events-auto flex items-center gap-2.5 pl-3.5 pr-1.5 py-1.5 min-h-[40px] max-w-[520px]
                 rounded-full glass shadow-overlay"
    >
      <Icon size={16} className={`shrink-0 ${ICON_COLOR[t.kind]}`} />
      <span className="text-sm text-foreground leading-snug py-1 flex-1 min-w-0">{t.message}</span>
      {t.action && (
        <button
          onClick={() => { t.action!.onClick(); onDismiss(t.id); }}
          className="press shrink-0 h-7 px-3 rounded-full text-xs font-semibold text-primary hover:bg-primary/12"
        >
          {t.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(t.id)}
        className="press shrink-0 w-7 h-7 rounded-full grid place-items-center text-faint hover:text-foreground hover:bg-foreground/[0.07]"
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    const id = nextId++;
    const defaultDuration = kind === 'error' ? 6500 : 3800;
    const duration = options?.duration ?? defaultDuration;
    setToasts((prev) => {
      const live = prev.filter((t) => !t.leaving);
      const overflow = live.length >= 3 ? live.slice(0, live.length - 2).map((t) => t.id) : [];
      return [...prev.map((t) => (overflow.includes(t.id) ? { ...t, leaving: true } : t)), { id, kind, message, action: options?.action }];
    });
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[95] flex flex-col items-center gap-2 pointer-events-none w-[min(560px,calc(100vw-32px))]"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onDismiss={dismiss} onRemoved={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
