import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Save, Trash2, Loader2, Globe, Sparkles, Palette,
  HardDrive, Wrench, ShieldCheck, Filter, Sun, Moon, Database,
  CheckCircle2, XCircle, Zap, FlaskConical, RefreshCw, ScanSearch,
  MonitorDot, PowerOff, XSquare,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { DevPanel } from '@/components/DevPanel';
import { InfoTooltip } from '@/components/InfoTooltip';
import { FolderIcon } from '@/components/FolderIcon';
import { useFolders, useUpdateFolderConfig, useRenameFolder } from '@/hooks/useFolders';
import { getGlobalSettings, updateGlobalSettings, runGc, getDedupStats, cleanupOrphanedFiles, getStorageBreakdown, runIntegrityCheck } from '@/lib/tauri';
import { IgnoreRulesEditor } from '@/components/IgnoreRulesEditor';
import { useToast } from '@/context/ToastContext';
import { useOnboardingContext } from '@/context/OnboardingContext';
import { FOLDER_COLORS, FOLDER_ICON_NAMES, getColor } from '@/lib/folderAppearance';
import type { FolderConfig, GlobalSettings, DedupStats, IntegrityResult } from '@/lib/types';


function FieldLabel({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip?: { title: string; body: React.ReactNode };
}) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <label className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
        {children}
      </label>
      {tooltip && <InfoTooltip title={tooltip.title} body={tooltip.body} />}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: number | string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`[appearance:none] bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-sm
                  focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50
                  transition-colors placeholder:text-muted-foreground/40 ${className}`}
    />
  );
}

function NavItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs transition-all text-left relative overflow-hidden
        ${active
          ? 'bg-primary/12 text-primary font-medium'
          : 'text-muted-foreground/55 hover:bg-secondary/60 hover:text-foreground'
        }`}
    >
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-[2.5px] rounded-full bg-primary" />
      )}
      <span className={`shrink-0 ml-0.5 transition-opacity ${active ? 'opacity-100' : 'opacity-55'}`}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function SettingsCard({
  children,
  footer,
  divided = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  divided?: boolean;
}) {
  return (
    <div className="bg-card/60 border border-border/50 rounded-xl overflow-hidden shadow-sm">
      <div className={divided ? 'divide-y divide-border/25' : 'p-5 space-y-5'}>
        {children}
      </div>
      {footer && (
        <div className="px-5 py-3.5 border-t border-border/40 bg-secondary/10 flex items-center gap-3">
          {footer}
        </div>
      )}
    </div>
  );
}

function SaveBtn({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="flex items-center gap-2 px-4 py-1.5 text-sm rounded-lg bg-primary text-primary-foreground
                 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
    >
      {pending ? <Loader2 size={13} className="animate-spin-slow" /> : <Save size={13} />}
      {pending ? 'Saving…' : 'Save'}
    </button>
  );
}

function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary/70">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}


function ActionCard({
  icon,
  title,
  description,
  label,
  runningLabel,
  running,
  onClick,
  variant = 'default',
  result,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  label: string;
  runningLabel: string;
  running: boolean;
  onClick: () => void;
  variant?: 'default' | 'danger';
  result?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-secondary/10 overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0
          ${variant === 'danger'
            ? 'bg-destructive/8 border-destructive/20 text-destructive/70'
            : 'bg-secondary/80 border-border/60 text-muted-foreground/60'
          }`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground/80 leading-none">{title}</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1 leading-relaxed">{description}</p>
        </div>
        <button
          onClick={onClick}
          disabled={running}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border
                      disabled:opacity-50 disabled:cursor-not-allowed
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all
                      ${variant === 'danger'
                        ? 'border-destructive/25 text-destructive/80 hover:bg-destructive/8 hover:border-destructive/40'
                        : 'border-border/60 text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border'
                      }`}
        >
          {running ? <Loader2 size={11} className="animate-spin-slow" /> : null}
          {running ? runningLabel : label}
        </button>
      </div>
      {result && (
        <div className="border-t border-border/30 px-4 pb-4 pt-3">
          {result}
        </div>
      )}
    </div>
  );
}


type GlobalSection = 'system' | 'storage' | 'maintenance' | 'onboarding' | 'appearance' | 'dev';

const GLOBAL_SECTIONS: { id: GlobalSection; label: string; icon: React.ReactNode }[] = [
  { id: 'system',      label: 'System',       icon: <MonitorDot size={13} /> },
  { id: 'storage',     label: 'Storage',      icon: <HardDrive size={13} /> },
  { id: 'maintenance', label: 'Maintenance',  icon: <Wrench size={13} /> },
  { id: 'onboarding',  label: 'Onboarding',   icon: <Sparkles size={13} /> },
  { id: 'appearance',  label: 'Appearance',   icon: <Sun size={13} /> },
  { id: 'dev',         label: 'Dev / QA',     icon: <FlaskConical size={13} /> },
];

function GlobalSettingsPage() {
  const [activeSection, setActiveSection] = useState<GlobalSection>('system');
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [gcRunning, setGcRunning] = useState(false);
  const [dedupStats, setDedupStats] = useState<DedupStats | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.classList.contains('light') ? 'light' : 'dark'
  );
  const { toast } = useToast();
  const { resetGuide } = useOnboardingContext();

  useEffect(() => {
    getGlobalSettings()
      .then(setSettings)
      .catch(() => setSettings({ global_size_cap_mb: null, log_level: 'info', close_to_tray: false, start_on_boot: false }));
    getDedupStats()
      .then(setDedupStats)
      .catch(() => null);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (next === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
    localStorage.setItem('zftm-theme', next);
  }

  async function checkIntegrity() {
    setIntegrityRunning(true);
    setIntegrityResult(null);
    await runIntegrityCheck()
      .then((r) => {
        setIntegrityResult(r);
        if (r.dbOk && r.casMissing === 0) {
          toast('success', 'Integrity check passed — database and CAS are healthy');
        } else {
          toast('error', `Integrity issues found: ${r.casMissing} missing CAS blobs`);
        }
      })
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setIntegrityRunning(false));
  }

  async function cleanOrphans() {
    setCleaningOrphans(true);
    await cleanupOrphanedFiles()
      .then((n) => toast('success', `Cleaned up ${n} orphaned file record${n !== 1 ? 's' : ''}`))
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setCleaningOrphans(false));
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    await updateGlobalSettings(settings)
      .then(() => toast('success', 'Global settings saved'))
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setSaving(false));
  }

  async function gc() {
    setGcRunning(true);
    await runGc()
      .then((n) => toast('success', `GC complete — ${n} orphaned blob${n !== 1 ? 's' : ''} removed`))
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setGcRunning(false));
  }

  function renderContent() {
    if (!settings) {
      return (
        <div className="p-6 max-w-2xl space-y-3 animate-pulse">
          {[1, 2].map((i) => <div key={i} className="h-12 bg-secondary/50 rounded-xl" />)}
        </div>
      );
    }

    if (activeSection === 'system') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<MonitorDot size={15} />}
            title="System"
            subtitle="Tray icon, startup behavior, and background operation."
          />

          <SettingsCard divided>

            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary/80 border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
                  <XSquare size={14} className="text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/85">Minimize to tray on close</p>
                  <p className="text-xs text-muted-foreground/55 mt-0.5 leading-relaxed max-w-sm">
                    When you click the window's × button, hide to the system tray instead of quitting.
                    Right-click the tray icon → <span className="font-mono text-[10px]">Quit ZFileTimeMachine</span> to fully exit.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettings({ ...settings, close_to_tray: !settings.close_to_tray })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors mt-1
                  ${settings.close_to_tray ? 'bg-primary' : 'bg-secondary border border-border/60'}`}
                role="switch"
                aria-checked={settings.close_to_tray}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
                  ${settings.close_to_tray ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Start on boot */}
            <div className="flex items-start justify-between gap-4 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-secondary/80 border border-border/50 flex items-center justify-center shrink-0 mt-0.5">
                  <PowerOff size={14} className="text-muted-foreground/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground/85">Launch on system startup</p>
                  <p className="text-xs text-muted-foreground/55 mt-0.5 leading-relaxed max-w-sm">
                    Register ZFileTimeMachine with your OS so it starts automatically on login.
                    The app will start <span className="text-foreground/70 font-medium">hidden in the tray</span> — watchers
                    run in the background without opening a window.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSettings({ ...settings, start_on_boot: !settings.start_on_boot })}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors mt-1
                  ${settings.start_on_boot ? 'bg-primary' : 'bg-secondary border border-border/60'}`}
                role="switch"
                aria-checked={settings.start_on_boot}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
                  ${settings.start_on_boot ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </SettingsCard>

          <div className="mt-4 p-4 rounded-xl border border-border/30 bg-secondary/10 text-xs text-muted-foreground/55 space-y-1.5 leading-relaxed">
            <p className="font-semibold text-muted-foreground/70">How the tray icon works</p>
            <p>The tray icon is always visible while ZFileTimeMachine is running. Left-click it (or use <span className="font-mono text-[10px]">Open ZFileTimeMachine</span>) to bring the window back. File watchers keep running even while the window is hidden.</p>
            <p>On <span className="font-medium">Linux</span> startup uses XDG autostart (<code className="font-mono text-[10px]">~/.config/autostart/</code>). On <span className="font-medium">Windows</span> it writes to the registry Run key. On <span className="font-medium">macOS</span> a LaunchAgent plist is created.</p>
          </div>

          <div className="mt-4 flex justify-end">
            <SaveBtn onClick={save} pending={saving} />
          </div>
        </div>
      );
    }

    if (activeSection === 'storage') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<HardDrive size={15} />}
            title="Storage"
            subtitle="Configure global storage limits across all folders."
          />

          {/* Dedup bento tiles */}
          {dedupStats && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-3.5 flex flex-col">
                <p className="text-[10px] font-medium text-muted-foreground/45 uppercase tracking-widest mb-2">On Disk</p>
                <p className="text-2xl font-bold text-foreground/90 tabular-nums leading-none">
                  {(dedupStats.physicalBytes / 1024 / 1024).toFixed(1)}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1.5">MB physical</p>
              </div>
              <div className="rounded-xl border border-border/40 bg-secondary/20 p-3.5 flex flex-col">
                <p className="text-[10px] font-medium text-muted-foreground/45 uppercase tracking-widest mb-2">Logical</p>
                <p className="text-2xl font-bold text-foreground/40 tabular-nums leading-none">
                  {(dedupStats.logicalBytes / 1024 / 1024).toFixed(1)}
                </p>
                <p className="text-[11px] text-muted-foreground/40 mt-1.5">MB without dedup</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 flex flex-col">
                <p className="text-[10px] font-medium text-emerald-400/50 uppercase tracking-widest mb-2">Saved</p>
                <p className="text-2xl font-bold text-emerald-400/90 tabular-nums leading-none">
                  {(dedupStats.savedBytes / 1024 / 1024).toFixed(1)}
                </p>
                <p className="text-[11px] text-emerald-400/40 mt-1.5">{dedupStats.dedupRatio.toFixed(1)}× ratio</p>
              </div>
            </div>
          )}

          <SettingsCard footer={<SaveBtn onClick={() => void save()} pending={saving} />}>
            <div>
              <FieldLabel tooltip={{
                title: 'Global size cap',
                body: <>Sets a hard limit on <strong className="text-foreground/80">total snapshot storage</strong> across all folders. When the cap is exceeded, the oldest snapshots are deleted until you're back under it. Leave blank for unlimited.</>,
              }}>
                Global size cap (MB)
              </FieldLabel>
              <NumberInput
                value={settings.global_size_cap_mb ?? ''}
                onChange={(v) => setSettings({ ...settings, global_size_cap_mb: v ? parseInt(v) : null })}
                placeholder="No limit"
                className="w-40"
              />
              <p className="text-xs text-muted-foreground/50 mt-1.5">Leave blank for unlimited storage.</p>
            </div>
          </SettingsCard>
        </div>
      );
    }

    if (activeSection === 'maintenance') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in space-y-3">
          <SectionHeader
            icon={<Wrench size={15} />}
            title="Maintenance"
            subtitle="Tools for keeping your snapshot store clean and efficient."
          />

          <ActionCard
            icon={<RefreshCw size={15} />}
            title="Garbage Collection"
            description="Removes orphaned snapshot blobs that are no longer referenced by any snapshot record. Safe to run at any time."
            label="Run GC"
            runningLabel="Running…"
            running={gcRunning}
            onClick={() => void gc()}
          />

          <ActionCard
            icon={<Trash2 size={15} />}
            title="Orphaned File Cleanup"
            description="Removes file records with no snapshots — left over after retention pruning. Does not touch actual files on disk."
            label="Clean up"
            runningLabel="Cleaning…"
            running={cleaningOrphans}
            onClick={() => void cleanOrphans()}
          />

          <ActionCard
            icon={<ScanSearch size={15} />}
            title="Database Integrity Check"
            description="Runs SQLite PRAGMA integrity_check and verifies every snapshot's content blob exists on disk."
            label="Run Check"
            runningLabel="Checking…"
            running={integrityRunning}
            onClick={() => void checkIntegrity()}
            result={integrityResult ? (
              <div className={`rounded-lg border px-4 py-3 text-xs space-y-1.5
                ${integrityResult.dbOk && integrityResult.casMissing === 0
                  ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400/90'
                  : 'bg-red-500/8 border-red-500/20 text-red-400/90'
                }`}>
                <div className="flex items-center gap-1.5 font-medium">
                  {integrityResult.dbOk && integrityResult.casMissing === 0
                    ? <CheckCircle2 size={12} />
                    : <XCircle size={12} />}
                  {integrityResult.dbOk ? 'Database OK' : 'Database issues found'}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] opacity-80">
                  <Zap size={10} />
                  {integrityResult.casChecked} CAS blobs checked · {integrityResult.casMissing} missing
                </div>
                {integrityResult.dbMessages.length > 1 && (
                  <ul className="mt-1 space-y-0.5 font-mono text-[10px] opacity-70">
                    {integrityResult.dbMessages.map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                )}
              </div>
            ) : undefined}
          />
        </div>
      );
    }

    if (activeSection === 'appearance') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<Sun size={15} />}
            title="Appearance"
            subtitle="Customize the look and feel of the application."
          />
          <SettingsCard>
            <div>
              <FieldLabel>Theme</FieldLabel>
              <div className="grid grid-cols-2 gap-3 mt-2">
                {(['dark', 'light'] as const).map((t) => {
                  const isActive = theme === t;
                  return (
                    <button
                      key={t}
                      onClick={() => t !== theme && toggleTheme()}
                      className={`rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                        ${isActive
                          ? 'border-primary/40 bg-primary/8 ring-1 ring-primary/20'
                          : 'border-border/40 bg-secondary/20 hover:border-border/70 hover:bg-secondary/40'
                        }`}
                    >

                      <div className={`w-full h-14 rounded-lg mb-3 overflow-hidden border
                        ${t === 'dark' ? 'bg-zinc-900 border-zinc-700/60' : 'bg-zinc-50 border-zinc-200'}`}>
                        <div className={`h-3 flex items-center gap-1 px-2 border-b
                          ${t === 'dark' ? 'bg-zinc-800 border-zinc-700/60' : 'bg-zinc-100 border-zinc-200'}`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${t === 'dark' ? 'bg-zinc-600' : 'bg-zinc-300'}`} />
                          <div className={`w-6 h-1 rounded-full ${t === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
                        </div>
                        <div className="p-2 space-y-1.5">
                          <div className={`h-1.5 w-2/3 rounded-full ${t === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
                          <div className={`h-1.5 w-1/2 rounded-full ${t === 'dark' ? 'bg-zinc-800' : 'bg-zinc-150'}`} />
                          <div className={`h-1.5 w-3/4 rounded-full ${t === 'dark' ? 'bg-zinc-700/60' : 'bg-zinc-200/80'}`} />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {t === 'dark'
                          ? <Moon size={13} className="text-indigo-400/80 shrink-0" />
                          : <Sun size={13} className="text-amber-400/80 shrink-0" />}
                        <span className="text-sm font-medium">{t === 'dark' ? 'Dark' : 'Light'}</span>
                        {isActive && (
                          <span className="ml-auto text-[10px] text-primary font-medium">Active</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </SettingsCard>
        </div>
      );
    }

    if (activeSection === 'onboarding') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<Sparkles size={15} />}
            title="Onboarding"
            subtitle="Manage the setup guide and first-run experience."
          />
          <ActionCard
            icon={<Sparkles size={15} />}
            title="Setup Guide"
            description="Reopen the step-by-step onboarding wizard to revisit the initial setup steps or walk a new user through the app."
            label="Restart guide"
            runningLabel="Opening…"
            running={false}
            onClick={resetGuide}
          />
        </div>
      );
    }

    if (activeSection === 'dev') {
      return <DevPanel />;
    }

    return null;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5 flex items-center gap-3 shrink-0 bg-card/40">
        <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Globe size={13} className="text-primary/70" />
        </div>
        <h1 className="font-semibold text-sm">Global Settings</h1>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <nav className="w-46 shrink-0 border-r border-border/40 p-2 space-y-0.5 bg-card/20">
          {GLOBAL_SECTIONS.map((s) => (
            <NavItem key={s.id} icon={s.icon} label={s.label} active={activeSection === s.id} onClick={() => setActiveSection(s.id)} />
          ))}
        </nav>
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}


function StorageBreakdownSection({ folderId }: { folderId: number }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['storage-breakdown', folderId],
    queryFn: () => getStorageBreakdown(folderId),
    enabled: false,
  });

  function fmtBytes(b: number) {
    if (b < 1024) return `${b}B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
    return `${(b / 1024 / 1024).toFixed(1)}MB`;
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => void refetch()}
        disabled={isLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
      >
        {isLoading ? <Loader2 size={12} className="animate-spin-slow" /> : <Database size={12} />}
        Analyze storage
      </button>
      {data && data.length > 0 && (
        <div className="space-y-1">
          {data.map((entry) => (
            <div key={entry.relPath} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/20 text-xs">
              <span className="font-mono text-foreground/70 flex-1 truncate min-w-0">{entry.relPath}</span>
              <span className="text-muted-foreground/60 shrink-0">{entry.snapshotCount}×</span>
              <span className="text-foreground/70 shrink-0 w-16 text-right">{fmtBytes(entry.logicalBytes)}</span>
            </div>
          ))}
        </div>
      )}
      {data && data.length === 0 && (
        <p className="text-xs text-muted-foreground/40">No snapshot data found for this folder.</p>
      )}
    </div>
  );
}


type FolderSection = 'appearance' | 'backup' | 'rules' | 'storage';

const FOLDER_SECTIONS: { id: FolderSection; label: string; icon: React.ReactNode }[] = [
  { id: 'appearance', label: 'Appearance',  icon: <Palette size={13} /> },
  { id: 'backup',     label: 'Backup',       icon: <ShieldCheck size={13} /> },
  { id: 'rules',      label: 'Ignore Rules', icon: <Filter size={13} /> },
  { id: 'storage',    label: 'Storage',      icon: <Database size={13} /> },
];

function FolderSettingsPage({ folderId }: { folderId: number }) {
  const [activeSection, setActiveSection] = useState<FolderSection>('appearance');
  const { data: folders } = useFolders();
  const folder = folders?.find((f) => f.id === folderId);
  const update = useUpdateFolderConfig();
  const rename = useRenameFolder();
  const { toast } = useToast();

  const [config, setConfig] = useState<FolderConfig | null>(null);
  const [displayName, setDisplayName] = useState('');

  useEffect(() => {
    if (folder) {
      setConfig(folder.config);
      setDisplayName(folder.displayName);
    }
  }, [folder]);

  async function save() {
    if (!config || !folder) return;
    if (
      config.retention.type === 'KeepLast' &&
      folder.config.retention.type === 'KeepLast' &&
      config.retention.count < folder.config.retention.count
    ) {
      const ok = confirm(
        `Reducing retention from ${folder.config.retention.count} to ${config.retention.count} snapshots will permanently delete old history. Continue?`
      );
      if (!ok) return;
    }
    const ops: Promise<unknown>[] = [update.mutateAsync({ id: folderId, config })];
    if (displayName.trim() && displayName.trim() !== folder.displayName) {
      ops.push(rename.mutateAsync({ id: folderId, displayName: displayName.trim() }));
    }
    await Promise.all(ops)
      .then(() => toast('success', 'Folder settings saved'))
      .catch((e: unknown) => toast('error', String(e)));
  }

  const isPending = update.isPending || rename.isPending;
  const colorDef = config ? getColor(config.color) : getColor();

  function renderContent() {
    if (!config) {
      return (
        <div className="p-6 max-w-2xl space-y-3 animate-pulse">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-secondary/50 rounded-xl" />)}
        </div>
      );
    }

    if (activeSection === 'appearance') {
      const PRESETS = [
        { label: 'Code',  icon: 'Code2',     color: 'blue',    retention: 50, debounce: 1000, hint: '50 snaps · 1s debounce' },
        { label: 'Docs',  icon: 'BookOpen',  color: 'emerald', retention: 20, debounce: 3000, hint: '20 snaps · 3s debounce' },
        { label: 'Media', icon: 'Camera',    color: 'rose',    retention: 5,  debounce: 5000, hint: '5 snaps · 5s debounce'  },
      ];
      const selectedColorLabel = FOLDER_COLORS.find((c) => c.id === config.color)?.label ?? 'Blue';
      const selectedIcon = config.icon ?? 'Folder';

      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<Palette size={15} />}
            title="Appearance"
            subtitle="Customize the folder's display name, color, and icon."
          />
          <SettingsCard divided footer={<SaveBtn onClick={() => void save()} pending={isPending} />}>


            <div className="p-5">
              <FieldLabel>Quick presets</FieldLabel>
              <div className="grid grid-cols-3 gap-2.5 mt-2">
                {PRESETS.map((preset) => {
                  const pd = getColor(preset.color);
                  const isActive = config.color === preset.color && config.icon === preset.icon;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setConfig({
                        ...config,
                        icon: preset.icon,
                        color: preset.color,
                        retention: { type: 'KeepLast', count: preset.retention },
                        debounce_ms: preset.debounce,
                      })}
                      className={`relative rounded-xl border p-4 text-left transition-all
                        ${isActive
                          ? `border-current/30 ${pd.bgClass} ring-1 ring-inset ring-current/20`
                          : 'border-border/40 bg-secondary/20 hover:border-border/70 hover:bg-secondary/40'
                        }`}
                    >
                      <div className={`w-9 h-9 rounded-xl ${pd.bgClass} flex items-center justify-center mb-3`}>
                        <FolderIcon name={preset.icon} size={17} className={pd.iconClass} />
                      </div>
                      <p className={`text-sm font-semibold leading-none mb-1 ${isActive ? pd.iconClass : 'text-foreground/80'}`}>
                        {preset.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/45 leading-relaxed">{preset.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>


            <div className="p-5">
              <FieldLabel>Display name</FieldLabel>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Folder name"
                className="bg-secondary/60 border border-border rounded-lg px-3 py-2 text-sm w-full
                           focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50
                           transition-colors placeholder:text-muted-foreground/40"
              />
            </div>


            <div className="p-5 space-y-5">

              <div>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel>Accent color</FieldLabel>
                  <span className="text-[11px] text-muted-foreground/40">{selectedColorLabel}</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      title={c.label}
                      onClick={() => setConfig({ ...config, color: c.id })}
                      className={`w-7 h-7 rounded-full ${c.swatch} transition-all
                                  ${config.color === c.id || (!config.color && c.id === 'blue')
                                    ? 'ring-2 ring-offset-2 ring-offset-card ring-white/60 scale-110'
                                    : 'opacity-55 hover:opacity-100 hover:scale-110'
                                  }`}
                    />
                  ))}
                </div>
              </div>


              <div>
                <div className="flex items-center justify-between mb-2">
                  <FieldLabel>Icon</FieldLabel>
                  <span className="text-[11px] text-muted-foreground/40">{selectedIcon}</span>
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {FOLDER_ICON_NAMES.map((name) => {
                    const isActive = config.icon === name || (!config.icon && name === 'Folder');
                    return (
                      <button
                        key={name}
                        type="button"
                        title={name}
                        onClick={() => setConfig({ ...config, icon: name })}
                        className={`p-2 rounded-lg transition-all ${
                          isActive
                            ? `${colorDef.bgClass} ${colorDef.iconClass} ring-1 ring-inset ring-current/25`
                            : 'text-muted-foreground/40 hover:text-foreground/80 hover:bg-secondary/60'
                        }`}
                      >
                        <FolderIcon name={name} size={17} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>


            <div className="p-5">
              <FieldLabel>Preview</FieldLabel>
              <div className="relative flex items-stretch rounded-xl border border-border/50 bg-card/80 overflow-hidden mt-2">

                <div className={`w-[3px] shrink-0 ${colorDef.barClass} opacity-80`} />

                <div className="flex items-center gap-4 px-4 py-4 flex-1 min-w-0">

                  <div className="relative shrink-0">
                    <div className={`w-11 h-11 rounded-xl ${colorDef.bgClass} flex items-center justify-center`}>
                      <FolderIcon name={config.icon} size={20} className={colorDef.iconClass} />
                    </div>
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-card bg-emerald-500 shadow-[0_0_5px_theme(colors.emerald.500)]" />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[15px] text-foreground truncate">
                        {displayName || folder?.displayName || 'Folder'}
                      </span>
                      <span className="shrink-0 text-[10px] px-1.5 py-px rounded-md font-medium bg-emerald-500/10 text-emerald-400/90 border border-emerald-500/15">
                        Watching
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground/40 font-mono truncate">
                      {folder?.path ?? '/path/to/folder'}
                    </span>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/30">
                      <span>{selectedColorLabel}</span>
                      <span>·</span>
                      <span>{selectedIcon}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </SettingsCard>
        </div>
      );
    }

    if (activeSection === 'backup') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<ShieldCheck size={15} />}
            title="Backup"
            subtitle="Control snapshot limits and retention for this folder."
          />
          <SettingsCard footer={<SaveBtn onClick={() => void save()} pending={isPending} />}>
            <div>
              <FieldLabel tooltip={{
                title: 'Binary file size cap',
                body: <>Binary files are detected by content, not extension. Files <strong className="text-foreground/80">larger than this cap</strong> won't be snapshotted. Set to 0 to skip all binaries.</>,
              }}>
                Binary file size cap (MB)
              </FieldLabel>
              <NumberInput
                value={config.binary_max_mb}
                onChange={(v) => setConfig({ ...config, binary_max_mb: parseInt(v) || 50 })}
                className="w-36"
              />
            </div>

            <div>
              <FieldLabel tooltip={{
                title: 'Keep last N snapshots',
                body: <>
                  <p>After each new snapshot, the oldest ones are <strong className="text-foreground/80">automatically deleted</strong> so only this many remain per file.</p>
                  <p className="mt-1"><strong className="text-foreground/80">Recommended values:</strong></p>
                  <ul className="mt-0.5 space-y-0.5 list-none">
                    <li>• <strong>5–10</strong> — casual use, saves space</li>
                    <li>• <strong>20–50</strong> — code projects, good history</li>
                    <li>• <strong>100+</strong> — critical files, maximum history</li>
                  </ul>
                  <p className="mt-1 text-muted-foreground/50">Deleted blobs are cleaned up by Garbage Collection.</p>
                </>,
              }}>
                Keep last N snapshots per file
              </FieldLabel>
              <NumberInput
                value={config.retention.type === 'KeepLast' ? config.retention.count : ''}
                onChange={(v) => setConfig({ ...config, retention: { type: 'KeepLast', count: parseInt(v) || 10 } })}
                className="w-36"
              />
            </div>

            <div>
              <FieldLabel tooltip={{ title: 'Snapshot cooldown', body: 'Minimum gap between two snapshots of the same file. Handy when a formatter, build tool, or auto-save feature rewrites the same file many times in quick succession — only the version after the cooldown expires is captured.' }}>
                Snapshot cooldown
              </FieldLabel>
              <p className="text-[11px] text-muted-foreground/50 mb-2 leading-relaxed">
                Prevent snapshotting the same file more than once per interval.
                Useful when a formatter or bundler rewrites files repeatedly.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {([
                  { label: 'Off', value: undefined as number | undefined },
                  { label: '10 s', value: 10 },
                  { label: '30 s', value: 30 },
                  { label: '1 min', value: 60 },
                  { label: '2 min', value: 120 },
                  { label: '5 min', value: 300 },
                ] as { label: string; value: number | undefined }[]).map(({ label, value }) => {
                  const active = (config.min_snapshot_interval_secs ?? undefined) === value;
                  return (
                    <button
                      key={label}
                      onClick={() => setConfig({ ...config, min_snapshot_interval_secs: value })}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all
                                  ${active
                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                    : 'bg-secondary/30 border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground'
                                  }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs text-muted-foreground/50">Custom (seconds):</span>
                <NumberInput
                  value={config.min_snapshot_interval_secs ?? ''}
                  onChange={(v) => setConfig({ ...config, min_snapshot_interval_secs: v ? parseInt(v) : undefined })}
                  placeholder="No limit"
                  className="w-28"
                />
              </div>
            </div>

            <div>
              <FieldLabel tooltip={{ title: 'Watcher debounce', body: 'Milliseconds to wait after the last file-change event before snapshotting. Bundles a rapid sequence of writes into one snapshot. Default: 2000ms.' }}>
                Watcher debounce (ms)
              </FieldLabel>
              <p className="text-[11px] text-muted-foreground/50 mb-2 leading-relaxed">
                Wait this long after the last change before capturing.
                Coalesces rapid saves from editors that write on every keystroke.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-1">
                {[
                  { label: '500 ms', value: 500 },
                  { label: '1 s', value: 1000 },
                  { label: '2 s', value: 2000 },
                  { label: '5 s', value: 5000 },
                  { label: '10 s', value: 10000 },
                ].map(({ label, value }) => {
                  const active = (config.debounce_ms ?? 2000) === value;
                  return (
                    <button
                      key={label}
                      onClick={() => setConfig({ ...config, debounce_ms: value })}
                      className={`px-2.5 py-1 rounded-lg border text-xs transition-all
                                  ${active
                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                    : 'bg-secondary/30 border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground'
                                  }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-xs text-muted-foreground/50">Custom (ms):</span>
                <NumberInput
                  value={config.debounce_ms ?? ''}
                  onChange={(v) => setConfig({ ...config, debounce_ms: v ? parseInt(v) : undefined })}
                  placeholder="2000"
                  className="w-28"
                />
              </div>
            </div>

            <div>
              <FieldLabel tooltip={{ title: 'Max folder depth', body: 'Maximum directory nesting depth to watch. Prevents runaway recursion in deep or circular folder structures. Leave blank for unlimited.' }}>
                Max folder depth
              </FieldLabel>
              <NumberInput
                value={config.max_depth ?? ''}
                onChange={(v) => setConfig({ ...config, max_depth: v ? parseInt(v) : undefined })}
                placeholder="Unlimited"
                className="w-36"
              />
            </div>

            <div>
              <FieldLabel tooltip={{ title: 'zstd compression', body: 'Compresses snapshot blobs with zstd level 3 before storing them. Typically cuts storage 2–5× for text files. New snapshots are compressed; existing blobs are unaffected.' }}>
                zstd compression
              </FieldLabel>
              <label className="flex items-center gap-3 cursor-pointer select-none mt-1.5">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={config.compressionEnabled ?? false}
                    onChange={(e) => setConfig({ ...config, compressionEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-[18px] rounded-full border border-border bg-secondary
                                  peer-checked:bg-primary peer-checked:border-primary transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white/60
                                  peer-checked:translate-x-3.5 peer-checked:bg-white
                                  transition-transform shadow-sm" />
                </div>
                <span className="text-xs text-muted-foreground/80">
                  {config.compressionEnabled ? 'Enabled — new snapshots will be compressed' : 'Disabled — snapshots stored as raw bytes'}
                </span>
              </label>
            </div>
          </SettingsCard>
        </div>
      );
    }

    if (activeSection === 'rules') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<Filter size={15} />}
            title="Ignore Rules"
            subtitle="Files and folders matching these patterns are completely skipped."
          />
          <SettingsCard footer={<SaveBtn onClick={() => void save()} pending={isPending} />}>
            <div className="flex items-center gap-1.5">
              <p className="text-xs text-muted-foreground/70">
                Uses gitignore-style glob patterns. Matching files produce no snapshots and don't appear in the file list.
              </p>
              <InfoTooltip
                title="Ignore rules"
                body={<>Uses <strong className="text-foreground/80">gitignore-style glob patterns</strong>. Examples: <code className="font-mono bg-secondary px-1 rounded">node_modules</code> skips the whole folder, <code className="font-mono bg-secondary px-1 rounded">*.log</code> skips all log files.</>}
              />
            </div>
            <IgnoreRulesEditor
              globs={config.ignore_globs}
              onChange={(globs) => setConfig({ ...config, ignore_globs: globs })}
            />
          </SettingsCard>
        </div>
      );
    }

    if (activeSection === 'storage') {
      return (
        <div className="p-6 max-w-2xl animate-fade-in">
          <SectionHeader
            icon={<Database size={15} />}
            title="Storage"
            subtitle="Analyze per-file snapshot storage usage for this folder."
          />
          <SettingsCard>
            <div>
              <FieldLabel tooltip={{
                title: 'Storage breakdown',
                body: 'Shows how much space each file\'s snapshots use. Click "Analyze storage" to load the data on demand.',
              }}>
                Per-file breakdown
              </FieldLabel>
              <p className="text-xs text-muted-foreground/60 mb-3">
                Click below to load the storage usage for each tracked file.
              </p>
              <StorageBreakdownSection folderId={folderId} />
            </div>
          </SettingsCard>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border/60 px-5 py-3.5 flex items-center gap-3 shrink-0 bg-card/40">
        <Link
          to={`/folder/${folderId}`}
          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Back"
        >
          <ArrowLeft size={15} />
        </Link>
        {config && (
          <div className={`w-6 h-6 rounded-md ${colorDef.bgClass} flex items-center justify-center`}>
            <FolderIcon name={config.icon} size={13} className={colorDef.iconClass} />
          </div>
        )}
        <h1 className="font-semibold text-sm">{folder?.displayName}</h1>
        <span className="text-[10px] text-muted-foreground/30 ml-1">settings</span>
        <span className="ml-auto text-[11px] text-muted-foreground/40 font-mono truncate max-w-[200px]">
          {folder?.path}
        </span>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <nav className="w-46 shrink-0 border-r border-border/40 p-2 space-y-0.5 bg-card/20">
          {FOLDER_SECTIONS.map((s) => (
            <NavItem key={s.id} icon={s.icon} label={s.label} active={activeSection === s.id} onClick={() => setActiveSection(s.id)} />
          ))}
        </nav>
        <div className="flex-1 overflow-auto">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}


export function Settings() {
  const { id } = useParams<{ id?: string }>();
  const folderId = id ? parseInt(id, 10) : undefined;
  return folderId ? <FolderSettingsPage folderId={folderId} /> : <GlobalSettingsPage />;
}
