import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { FolderOpen, Settings, AlertTriangle } from 'lucide-react';
import logoUrl from './assets/logo.png';
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

function Sidebar() {
  return (
    <nav className="w-14 flex flex-col items-center py-3 border-r border-border bg-card/80 backdrop-blur-sm shrink-0 gap-1">
      <div className="mb-3 shrink-0 flex flex-col items-center gap-1">
        <img src={logoUrl} alt="ZFileTimeMachine" className="w-8 h-8 rounded-lg object-cover" />
        <span className="text-[8px] font-bold tracking-widest text-amber-400/60 uppercase leading-none">BETA</span>
      </div>

      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `relative p-2.5 rounded-lg transition-all ${
            isActive
              ? 'bg-primary/20 text-primary shadow-[0_0_12px_hsl(217_91%_60%/0.2)]'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`
        }
        title="Folders"
      >
        {({ isActive }) => (
          <>
            <FolderOpen size={20} />
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
            )}
          </>
        )}
      </NavLink>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `relative p-2.5 rounded-lg transition-all ${
            isActive
              ? 'bg-primary/20 text-primary shadow-[0_0_12px_hsl(217_91%_60%/0.2)]'
              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
          }`
        }
        title="Global settings"
      >
        {({ isActive }) => (
          <>
            <Settings size={20} />
            {isActive && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-primary rounded-r-full" />
            )}
          </>
        )}
      </NavLink>


      <NavLink
        to="/about"
        className={({ isActive }) =>
          `mt-auto relative flex items-center justify-center w-9 h-9 rounded-full transition-all ${
            isActive
              ? 'bg-violet-500/20 text-violet-300 shadow-[0_0_16px_rgba(139,92,246,0.45)] ring-1 ring-violet-500/30'
              : 'bg-secondary/40 text-muted-foreground/50 ring-1 ring-border/40 hover:text-foreground hover:ring-violet-500/25 hover:shadow-[0_0_10px_rgba(139,92,246,0.22)]'
          }`
        }
        title="About"
      >
        <span className="text-sm font-bold select-none">A</span>
      </NavLink>
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
      <div className="flex flex-col h-screen overflow-hidden">
        {showMacWarning && <MacOsWarningBanner onDismiss={dismissMacWarning} />}
        <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 flex overflow-hidden">
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
