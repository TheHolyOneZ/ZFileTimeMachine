import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { FolderOpen, Settings, AlertTriangle, Info } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { getPlatform } from './lib/tauri';
import { Folders } from './routes/Folders';
import { FolderDetail } from './routes/FolderDetail';
import { FolderRecover } from './routes/FolderRecover';
import { Settings as SettingsRoute } from './routes/Settings';
import { About } from './routes/About';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { OnboardingContext } from './context/OnboardingContext';
import { OnboardingModal } from './components/OnboardingModal';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import { useOnboarding } from './hooks/useOnboarding';


const savedTheme = localStorage.getItem('zftm-theme');
if (savedTheme === 'light') {
  document.documentElement.classList.add('light');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 2_000,
      throwOnError: false,
    },
  },
});

const NAV_ITEMS = [
  { to: '/', end: true, icon: FolderOpen, label: 'Folders' },
  { to: '/settings', end: false, icon: Settings, label: 'Settings' },
] as const;

function SidebarLink({ to, end, icon: Icon, label, className = '' }: {
  to: string; end?: boolean; icon: typeof FolderOpen; label: string; className?: string;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        `relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${className} ${
          isActive
            ? 'bg-foreground/[0.08] text-foreground shadow-[inset_0_1px_0_0_hsl(var(--highlight))]'
            : 'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} strokeWidth={1.75} />
          {isActive && (
            <span className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-[3px] h-4 bg-primary rounded-r-full" />
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar() {
  return (
    <nav aria-label="Main" className="w-12 flex flex-col items-center pt-2 pb-3 bg-chrome shrink-0 gap-1">
      {NAV_ITEMS.map((item) => <SidebarLink key={item.to} {...item} />)}

      <SidebarLink to="/about" icon={Info} label="About" className="mt-auto" />
    </nav>
  );
}

function MacOsWarningBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-300/90 text-xs shrink-0">
      <AlertTriangle size={13} className="shrink-0 text-amber-400" />
      <span className="flex-1">
        <strong>macOS — not fully tested.</strong> Core features should work, but you may encounter rough edges. Please report any issues.
      </span>
      <button
        onClick={onDismiss}
        className="text-amber-400/60 hover:text-amber-300 transition-colors shrink-0 font-medium"
      >
        Dismiss
      </button>
    </div>
  );
}

function AppShell() {
  const { seen, complete, resetGuide } = useOnboarding();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [cmdPalette, setCmdPalette] = useState(false);
  const [showMacWarning, setShowMacWarning] = useState(false);

  useEffect(() => {
    getPlatform().then((p) => {
      if (p === 'macos' && !localStorage.getItem('zftm-macos-warning-dismissed')) {
        setShowMacWarning(true);
      }
    });
  }, []);

  function dismissMacWarning() {
    localStorage.setItem('zftm-macos-warning-dismissed', '1');
    setShowMacWarning(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPalette((p) => !p);
        return;
      }
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts((v) => !v);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <OnboardingContext.Provider value={{ resetGuide }}>
      <div className="flex flex-col h-screen overflow-hidden bg-chrome">
        <TitleBar onOpenSearch={() => setCmdPalette(true)} />
        {showMacWarning && <MacOsWarningBanner onDismiss={dismissMacWarning} />}
        <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 flex overflow-hidden bg-background rounded-tl-xl border-l border-t border-border
                         shadow-[inset_0_1px_0_0_hsl(var(--highlight))]">
          <ErrorBoundary label="App">
            <Routes>
              <Route path="/" element={<Folders />} />
              <Route path="/folder/:id" element={<FolderDetail />} />
              <Route path="/folder/:id/recover" element={<FolderRecover />} />
              <Route path="/folder/:id/settings" element={<SettingsRoute />} />
              <Route path="/settings" element={<SettingsRoute />} />
              <Route path="/about" element={<About />} />
            </Routes>
          </ErrorBoundary>
        </main>
        </div>
      </div>
      {!seen && <OnboardingModal onComplete={complete} />}
      {showShortcuts && <KeyboardShortcuts onClose={() => setShowShortcuts(false)} />}
      <CommandPalette open={cmdPalette} onClose={() => setCmdPalette(false)} />
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
