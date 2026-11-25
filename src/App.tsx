import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Sidebar } from './components/shell/Sidebar';
import { WindowControls } from './components/shell/WindowControls';
import { getPlatform } from './lib/tauri';
import { IS_MAC, initTheme, initWindowMaterial } from './lib/platform';
import { Overview } from './routes/Overview';
import { FolderDetail } from './routes/FolderDetail';
import { FolderRecover } from './routes/FolderRecover';
import { Settings as SettingsRoute } from './routes/Settings';
import { About } from './routes/About';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { OnboardingContext } from './context/OnboardingContext';
import { AddFolderProvider } from './context/AddFolderContext';
import { OnboardingModal } from './components/OnboardingModal';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import { TooltipLayer } from './components/ui/TooltipLayer';
import { useOnboarding } from './hooks/useOnboarding';
import { useFolders } from './hooks/useFolders';
import { useLiveEvents } from './hooks/useLiveEvents';
import { gsap, dur } from './lib/motion';

initTheme();
void initWindowMaterial();
document.documentElement.style.setProperty('--controls-space', IS_MAC ? '0px' : '136px');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2_000,
      throwOnError: false,
    },
  },
});

const NARROW = 1000;
const SIDEBAR_KEY = 'zftm-sidebar';

function useSidebarCollapse() {
  const [pref, setPref] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'collapsed');
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW);
  const [override, setOverride] = useState<boolean | null>(null);

  useEffect(() => {
    function onResize() {
      const n = window.innerWidth < NARROW;
      setNarrow((prev) => {
        if (prev !== n) setOverride(null);
        return n;
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const collapsed = override ?? (narrow || pref);

  function toggle() {
    const next = !collapsed;
    if (narrow) {
      setOverride(next);
    } else {
      setPref(next);
      setOverride(null);
      localStorage.setItem(SIDEBAR_KEY, next ? 'collapsed' : 'expanded');
    }
  }

  return { collapsed, toggle };
}

function stageKey(pathname: string) {
  const m = pathname.match(/^\/folder\/(\d+)(\/[a-z]+)?/);
  if (m) return `folder-${m[1]}${m[2] ?? ''}`;
  return pathname.split('/')[1] || 'overview';
}

function RouteStage() {
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const key = stageKey(location.pathname);
  const first = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (first.current) { first.current = false; return; }
    const tween = gsap.fromTo(
      el,
      { autoAlpha: 0, y: 8, filter: 'blur(3px)' },
      { autoAlpha: 1, y: 0, filter: 'blur(0px)', duration: dur(0.48), ease: 'zftm', clearProps: 'filter,transform,opacity,visibility' },
    );
    return () => { tween.kill(); };
  }, [key]);

  return (
    <div ref={ref} className="flex-1 min-w-0 min-h-0 flex">
      <ErrorBoundary label="This page" key={key}>
        <Routes location={location}>
          <Route path="/" element={<Overview />} />
          <Route path="/folder/:id" element={<FolderDetail />} />
          <Route path="/folder/:id/recover" element={<FolderRecover />} />
          <Route path="/folder/:id/settings" element={<SettingsRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </ErrorBoundary>
    </div>
  );
}

function MacOsNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 mx-3 mt-3 px-3.5 py-2.5 rounded-lg bg-caution/[0.08] shadow-[inset_0_0_0_1px_hsl(var(--caution)/0.2)] text-sm shrink-0">
      <TriangleAlert size={14} className="shrink-0 text-caution" />
      <span className="flex-1 text-foreground/85">
        The macOS version hasn't been fully tested yet. If something looks or works wrong, please report it on GitHub.
      </span>
      <button onClick={onDismiss} className="press text-xs font-medium text-muted-foreground hover:text-foreground px-2 h-6 rounded-md hover:bg-foreground/[0.06]">
        Dismiss
      </button>
    </div>
  );
}

function AppShell() {
  useLiveEvents();
  const { seen, complete, resetGuide } = useOnboarding();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [cmdPalette, setCmdPalette] = useState(false);
  const [showMacNotice, setShowMacNotice] = useState(false);
  const { collapsed, toggle } = useSidebarCollapse();
  const { isLoading: foldersLoading } = useFolders();
  const launched = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (launched.current || foldersLoading) return;
    launched.current = true;
    const shell = shellRef.current;
    const panel = panelRef.current;
    if (!shell || !panel) return;
    const tl = gsap.timeline({ defaults: { ease: 'zftm' } });
    tl.fromTo(panel, { autoAlpha: 0, y: 14, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.8), clearProps: 'transform' }, 0);
    tl.fromTo(
      shell.querySelectorAll('[data-launch]'),
      { autoAlpha: 0, x: -8 },
      { autoAlpha: 1, x: 0, duration: dur(0.6), stagger: 0.03, clearProps: 'transform' },
      0.08,
    );
  }, [foldersLoading]);

  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!launched.current && panelRef.current) {
        launched.current = true;
        gsap.to(panelRef.current, { autoAlpha: 1, duration: dur(0.3) });
      }
    }, 1500);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    getPlatform().then((p) => {
      if (p === 'macos' && !localStorage.getItem('zftm-macos-warning-dismissed')) setShowMacNotice(true);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdPalette((p) => !p);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !inField) {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key === '?' && !inField) setShowShortcuts((v) => !v);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return (
    <OnboardingContext.Provider value={{ resetGuide }}>
      <AddFolderProvider>
        <div ref={shellRef} className="flex h-screen overflow-hidden bg-canvas">
          <Sidebar collapsed={collapsed} onToggle={toggle} onOpenSearch={() => setCmdPalette(true)} />
          <main
            ref={panelRef}
            className="relative flex-1 min-w-0 flex flex-col my-2 mr-2 rounded-[calc(14px*var(--rs))] bg-surface shadow-panel overflow-hidden invisible"
          >
            {showMacNotice && (
              <MacOsNotice onDismiss={() => { localStorage.setItem('zftm-macos-warning-dismissed', '1'); setShowMacNotice(false); }} />
            )}
            <RouteStage />
          </main>
          {!IS_MAC && <WindowControls />}
        </div>
        <OnboardingModal open={!seen} onComplete={complete} />
        <KeyboardShortcuts open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <CommandPalette open={cmdPalette} onClose={() => setCmdPalette(false)} onShowShortcuts={() => setShowShortcuts(true)} onToggleSidebar={toggle} />
        <TooltipLayer />
      </AddFolderProvider>
    </OnboardingContext.Provider>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
