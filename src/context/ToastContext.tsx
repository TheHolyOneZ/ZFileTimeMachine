import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

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
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const COLORS = {
  success: 'text-green-400 border-green-500/30 bg-green-950/60',
  error: 'text-red-400 border-red-500/30 bg-red-950/60',
  info: 'text-blue-400 border-blue-500/30 bg-blue-950/60',
} as const;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((kind: ToastKind, message: string, options?: ToastOptions) => {
    const id = nextId++;
    const defaultDuration = kind === 'error' ? 6000 : 3500;
    const duration = options?.duration ?? defaultDuration;
    setToasts((prev) => [...prev.slice(-4), { id, kind, message, action: options?.action }]);
    timers.current.set(id, setTimeout(() => dismiss(id), duration));
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border
                          shadow-overlay backdrop-blur-md animate-fade-in ${COLORS[t.kind]}`}
            >
              <Icon size={15} className="mt-0.5 shrink-0" />
              <span className="text-sm text-foreground flex-1 leading-snug">{t.message}</span>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="shrink-0 text-xs font-semibold text-primary hover:text-primary/80 transition-colors px-1.5 py-0.5 rounded border border-primary/30 hover:border-primary/50"
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors -mr-1 -mt-0.5 p-0.5"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
