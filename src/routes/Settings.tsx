import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, Palette, HardDrive, Wrench, Filter, Database, CheckCircle2, XCircle,
  FlaskConical, RefreshCw, ScanSearch, MonitorDot, Trash2, History, Code2, BookOpen, Camera, TriangleAlert,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DevPanel } from '@/components/DevPanel';
import { Group, Row } from '@/components/settings/Group';
import { CopyPath } from '@/components/ui/CopyPath';
import { FolderIcon } from '@/components/FolderIcon';
import { IgnoreRulesEditor } from '@/components/IgnoreRulesEditor';
import { FolderContentPicker } from '@/components/FolderContentPicker';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Switch } from '@/components/ui/Switch';
import { Segmented } from '@/components/ui/Segmented';
import { Button, IconButton } from '@/components/ui/Button';
import { useFolders, useUpdateFolderConfig, useRenameFolder } from '@/hooks/useFolders';
import { useGlidePill } from '@/hooks/useGlidePill';
import {
  getGlobalSettings, updateGlobalSettings, runGc, getDedupStats, cleanupOrphanedFiles, getStorageBreakdown, runIntegrityCheck,
} from '@/lib/tauri';
import { useToast } from '@/context/ToastContext';
import { useOnboardingContext } from '@/context/OnboardingContext';
import { ACCENT_COLOR, FOLDER_COLORS, FOLDER_ICON_NAMES, folderHex, folderTint, followsAccent } from '@/lib/folderAppearance';
import { useAppearance } from '@/hooks/useAppearance';
import { ColorWell } from '@/components/ui/ColorWell';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { gsap, dur } from '@/lib/motion';
import type { FolderConfig, GlobalSettings, DedupStats, IntegrityResult, BackupTrigger, RetentionRule } from '@/lib/types';

function fmtMB(bytes: number) {
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

function NumberField({ value, onChange, placeholder, suffix, id, min = 0, width = 'w-24' }: {
  value: number | '' | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  suffix?: string;
  id?: string;
  min?: number;
  width?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        min={min}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => { const n = parseInt(e.target.value); onChange(Number.isFinite(n) ? Math.max(min, n) : undefined); }}
        className={`field !h-8 ${width} text-right tabular-nums`}
      />
      {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

function Chips<T>({ value, options, onChange }: { value: T; options: { label: string; value: T }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.label}
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className={`press h-7 px-2.5 rounded-full text-xs tabular-nums transition-colors duration-200
                        ${on ? 'bg-primary text-primary-foreground font-medium' : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.09]'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SaveBar({ dirty, saving, onSave, onRevert }: { dirty: boolean; saving: boolean; onSave: () => void; onRevert: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (dirty && !shown.current) {
      gsap.fromTo(el, { autoAlpha: 0, y: 24, scale: 0.96 }, { autoAlpha: 1, y: 0, scale: 1, duration: dur(0.5), ease: 'zftm', overwrite: true });
      shown.current = true;
    } else if (!dirty && shown.current) {
      gsap.to(el, { autoAlpha: 0, y: 16, scale: 0.97, duration: dur(0.25), ease: 'zftm-in', overwrite: true });
      shown.current = false;
    }
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); onSave(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dirty, onSave]);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center z-20">
      <div ref={ref} className="invisible pointer-events-auto glass flex items-center gap-3 pl-4 pr-1.5 h-12 rounded-full shadow-overlay" role="status">
        <span className="text-sm">You have unsaved changes</span>
        <Button size="sm" variant="ghost" onClick={onRevert} disabled={saving}>Revert</Button>
        <Button size="sm" variant="primary" onClick={onSave} loading={saving} data-tip="Ctrl S">Save</Button>
      </div>
    </div>
  );
}

interface NavSection<T extends string> { id: T; label: string; icon: React.ReactNode }

function SettingsFrame<T extends string>({ title, subtitle, leading, sections, active, onSelect, children }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leading?: React.ReactNode;
  sections: NavSection<T>[];
  active: T;
  onSelect: (id: T) => void;
  children: React.ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useGlidePill(navRef, pillRef, '[aria-current="page"]', [active]);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.scrollTop = 0;
    gsap.fromTo(el.querySelectorAll('[data-group], [data-head]'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: dur(0.5), stagger: 0.045, ease: 'zftm', clearProps: 'transform' });
  }, [active]);

  return (
    <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header
        data-tauri-drag-region
        className="shrink-0 flex items-center gap-3.5 pl-4 pt-5 pb-4"
        style={{ paddingRight: 'max(1.25rem, var(--controls-space))' }}
      >
        {leading}
        <div data-tauri-drag-region className="flex-1 min-w-0 pl-2">
          <h1 data-tauri-drag-region className="text-xl font-semibold truncate">{title}</h1>
          {subtitle && <div data-tauri-drag-region className="text-xs text-faint truncate mt-1 min-w-0">{subtitle}</div>}
        </div>
      </header>
      <div className="flex-1 min-h-0 flex border-t border-[hsl(var(--line))]">
        <nav ref={navRef} className="relative w-52 shrink-0 p-2.5 space-y-0.5 border-r border-[hsl(var(--line))]" aria-label="Sections">
          <div ref={pillRef} aria-hidden className="absolute left-0 top-0 invisible rounded-[calc(9px*var(--rs))] bg-foreground/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--line))]" />
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              aria-current={active === s.id ? 'page' : undefined}
              className={`relative w-full flex items-center gap-2.5 h-9 px-3 rounded-[calc(9px*var(--rs))] text-sm text-left transition-colors
                          ${active === s.id ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.035]'}`}
            >
              <span className={active === s.id ? 'text-primary' : ''}>{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="relative flex-1 min-w-0">
          <div ref={contentRef} className="absolute inset-0 overflow-y-auto scroll-fade-y">
            <div className="max-w-[660px] px-8 pt-6 pb-28 space-y-7">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({ icon, title, description, label, running, onClick, danger, result }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  label: string;
  running: boolean;
  onClick: () => void;
  danger?: boolean;
  result?: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <span className={`w-8 h-8 rounded-[calc(9px*var(--rs))] grid place-items-center shrink-0 ${danger ? 'bg-destructive/10 text-destructive' : 'bg-foreground/[0.055] text-muted-foreground'}`}>{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        <Button size="sm" variant={danger ? 'quiet-danger' : 'secondary'} loading={running} onClick={onClick}>{label}</Button>
      </div>
      {result && <div className="mt-3 ml-[46px] animate-fade-in">{result}</div>}
    </div>
  );
}

type GlobalSection = 'general' | 'appearance' | 'storage' | 'maintenance' | 'dev';
const GLOBAL_SECTIONS: NavSection<GlobalSection>[] = [
  { id: 'general', label: 'General', icon: <MonitorDot size={15} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'storage', label: 'Storage', icon: <HardDrive size={15} /> },
  { id: 'maintenance', label: 'Maintenance', icon: <Wrench size={15} /> },
  { id: 'dev', label: 'Self-test', icon: <FlaskConical size={15} /> },
];

function GlobalSettingsPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') as GlobalSection | null;
  const section: GlobalSection = requested && GLOBAL_SECTIONS.some((s) => s.id === requested) ? requested : 'general';
  const setSection = (s: GlobalSection) => setParams((p) => { p.set('section', s); return p; }, { replace: true });

  const [saved, setSaved] = useState<GlobalSettings | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [gcRunning, setGcRunning] = useState(false);
  const [dedupStats, setDedupStats] = useState<DedupStats | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<IntegrityResult | null>(null);
  const { toast } = useToast();
  const { resetGuide } = useOnboardingContext();
  const qc = useQueryClient();

  useEffect(() => {
    getGlobalSettings()
      .then((s) => { setSaved(s); setSettings(s); })
      .catch(() => {
        const d = { global_size_cap_mb: null, log_level: 'info', close_to_tray: true, start_on_boot: false };
        setSaved(d); setSettings(d);
      });
    getDedupStats().then(setDedupStats).catch(() => null);
  }, []);

  const dirty = !!settings && !!saved && JSON.stringify(settings) !== JSON.stringify(saved);

  async function save() {
    if (!settings) return;
    setSaving(true);
    await updateGlobalSettings(settings)
      .then(() => { setSaved(settings); toast('success', 'Settings saved.'); void qc.invalidateQueries({ queryKey: ['global-settings'] }); })
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setSaving(false));
  }

  async function gc() {
    setGcRunning(true);
    await runGc()
      .then((n) => { toast('success', n === 0 ? 'Nothing to clean up.' : `Freed ${n} unused stored ${n === 1 ? 'copy' : 'copies'}.`); void qc.invalidateQueries({ queryKey: ['cas-size'] }); })
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setGcRunning(false));
  }

  async function cleanOrphans() {
    setCleaningOrphans(true);
    await cleanupOrphanedFiles()
      .then((n) => toast('success', n === 0 ? 'Nothing to clean up.' : `Removed ${n} empty file ${n === 1 ? 'entry' : 'entries'}.`))
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setCleaningOrphans(false));
  }

  async function checkIntegrity() {
    setIntegrityRunning(true);
    setIntegrityResult(null);
    await runIntegrityCheck()
      .then((r) => {
        setIntegrityResult(r);
        if (r.dbOk && r.casMissing === 0) toast('success', 'Everything checks out.');
        else toast('error', `Found problems: ${r.casMissing} stored ${r.casMissing === 1 ? 'copy is' : 'copies are'} missing.`);
      })
      .catch((e: unknown) => toast('error', String(e)))
      .finally(() => setIntegrityRunning(false));
  }

  const healthy = integrityResult && integrityResult.dbOk && integrityResult.casMissing === 0;

  return (
    <div className="relative flex-1 min-w-0 flex">
      <SettingsFrame title="Settings" subtitle="These apply to every folder." sections={GLOBAL_SECTIONS} active={section} onSelect={setSection}>
        {!settings ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : section === 'general' ? (
          <>
            <Group
              title="Running in the background"
              description="Folders keep being watched while the window is hidden. On Linux, starting with your computer uses XDG autostart, on Windows the registry Run key, and on macOS a LaunchAgent."
            >
              <Row
                label="When you close the window"
                description={settings.close_to_tray
                  ? "The app keeps protecting your folders from the tray. Quit from the tray icon's menu."
                  : 'The app quits and your folders are no longer watched until you open it again.'}
                stacked
              >
                <Segmented<'tray' | 'quit'>
                  value={settings.close_to_tray ? 'tray' : 'quit'}
                  onChange={(v) => setSettings({ ...settings, close_to_tray: v === 'tray' })}
                  ariaLabel="When you close the window"
                  options={[{ value: 'tray', label: 'Keep running in the tray' }, { value: 'quit', label: 'Quit' }]}
                />
              </Row>
              <Row label="Start with your computer" description="Starts hidden in the tray, so your folders are protected from the moment you log in." htmlFor="boot">
                <Switch id="boot" checked={settings.start_on_boot} onChange={(v) => setSettings({ ...settings, start_on_boot: v })} label="Start with your computer" />
              </Row>
            </Group>
            <Group title="Help">
              <ActionRow icon={<Sparkles size={15} />} title="Show the welcome guide again" description="Walks through adding a folder and choosing what to skip." label="Show guide" running={false} onClick={resetGuide} />
            </Group>
          </>
        ) : section === 'appearance' ? (
          <AppearanceSection />
        ) : section === 'storage' ? (
          <>
            {dedupStats && (
              <div data-group className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Used on disk', value: fmtMB(dedupStats.physicalBytes), hint: 'What the history really takes' },
                  { label: 'Without sharing', value: fmtMB(dedupStats.logicalBytes), hint: 'If every version were a full copy' },
                  { label: 'Saved', value: fmtMB(dedupStats.savedBytes), hint: `${dedupStats.dedupRatio.toFixed(1)} times smaller`, accent: true },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl bg-card shadow-card p-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-semibold tabular-nums tracking-tight mt-2 ${s.accent ? 'text-positive' : ''}`}>{s.value}</p>
                    <p className="text-2xs text-faint mt-1">{s.hint}</p>
                  </div>
                ))}
              </div>
            )}
            <Group
              title="Limit"
              description="When the history grows past the limit, the oldest versions across all folders are removed until it fits again."
            >
              <Row label="Total space for history" description="Leave empty for no limit." htmlFor="cap">
                <NumberField
                  id="cap"
                  value={settings.global_size_cap_mb ?? ''}
                  onChange={(v) => setSettings({ ...settings, global_size_cap_mb: v ?? null })}
                  placeholder="No limit"
                  suffix="MB"
                  min={1}
                />
              </Row>
            </Group>
            <p data-group className="text-xs text-faint px-1 leading-relaxed">
              Identical content is stored only once, even when it shows up in many files or versions. That is why the space used is usually far below the total.
            </p>
          </>
        ) : section === 'maintenance' ? (
          <Group title="Tidy up" description="All of these are safe to run at any time. None of them touch the files in your folders.">
            <ActionRow
              icon={<RefreshCw size={15} />}
              title="Free unused space"
              description="Removes stored copies that no version points to any more, for example after old versions were cleared."
              label="Free space"
              running={gcRunning}
              onClick={() => void gc()}
            />
            <ActionRow
              icon={<Trash2 size={15} />}
              title="Remove empty file entries"
              description="Clears files from the lists that no longer have any versions."
              label="Clean up"
              running={cleaningOrphans}
              onClick={() => void cleanOrphans()}
            />
            <ActionRow
              icon={<ScanSearch size={15} />}
              title="Check the history for damage"
              description="Verifies the database and that every version's content is still on disk."
              label="Check"
              running={integrityRunning}
              onClick={() => void checkIntegrity()}
              result={integrityResult ? (
                <div className="space-y-1.5 text-xs">
                  <p className={`flex items-center gap-1.5 font-medium ${healthy ? 'text-positive' : 'text-negative'}`}>
                    {healthy ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                    {integrityResult.dbOk ? 'The database is healthy.' : 'The database has problems.'}
                  </p>
                  <p className="text-muted-foreground tabular-nums">
                    Checked {integrityResult.casChecked.toLocaleString()} stored copies, {integrityResult.casMissing.toLocaleString()} missing.
                  </p>
                  {integrityResult.dbMessages.length > 1 && (
                    <ul className="font-mono text-2xs text-faint space-y-0.5 selectable">{integrityResult.dbMessages.map((m, i) => <li key={i}>{m}</li>)}</ul>
                  )}
                </div>
              ) : undefined}
            />
          </Group>
        ) : (
          <DevPanel />
        )}
      </SettingsFrame>
      <SaveBar dirty={dirty} saving={saving} onSave={() => void save()} onRevert={() => setSettings(saved)} />
    </div>
  );
}

function StorageBreakdown({ folderId }: { folderId: number }) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['storage-breakdown', folderId],
    queryFn: () => getStorageBreakdown(folderId),
    enabled: false,
  });
  const listRef = useRef<HTMLDivElement>(null);
  const max = useMemo(() => Math.max(1, ...(data ?? []).map((d) => d.logicalBytes)), [data]);

  useLayoutEffect(() => {
    if (!data?.length || !listRef.current) return;
    gsap.fromTo(listRef.current.querySelectorAll('[data-bar]'), { scaleX: 0 }, { scaleX: 1, duration: dur(0.7), stagger: 0.02, ease: 'zftm' });
  }, [data]);

  return (
    <Group title="Space per file" description="How much each file's versions would take as full copies, largest first.">
      {!data ? (
        <div className="px-4 py-6 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">Add up the space each file's history takes.</p>
          <Button icon={<Database size={14} />} loading={isFetching} onClick={() => void refetch()}>Analyze</Button>
        </div>
      ) : data.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground text-center">This folder has no versions yet.</p>
      ) : (
        <div ref={listRef} className="max-h-[420px] overflow-y-auto">
          {data.map((entry) => (
            <div key={entry.relPath} className="px-4 py-2.5">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-xs truncate flex-1 min-w-0">{entry.relPath}</span>
                <span className="text-xs text-faint tabular-nums shrink-0">{entry.snapshotCount} versions</span>
                <span className="text-xs tabular-nums shrink-0 w-16 text-right">{fmtMB(entry.logicalBytes)}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-foreground/[0.06] overflow-hidden">
                <div data-bar className="h-full rounded-full bg-foreground/30 origin-left" style={{ width: `${(entry.logicalBytes / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Group>
  );
}

type TriggerKind = 'change' | 'schedule' | 'manual';
type RetentionKind = 'count' | 'age' | 'both';

function triggerKind(t: BackupTrigger): TriggerKind {
  if (t.type === 'Manual') return 'manual';
  if (t.type === 'Interval' || t.type === 'Hybrid') return 'schedule';
  return 'change';
}
function triggerMinutes(t: BackupTrigger) {
  return t.type === 'Interval' ? t.minutes : t.type === 'Hybrid' ? t.interval_minutes : 30;
}
function retentionKind(r: RetentionRule): RetentionKind {
  return r.type === 'KeepLast' ? 'count' : r.type === 'TimeBased' ? 'age' : 'both';
}
function retentionCount(r: RetentionRule) { return r.type === 'TimeBased' ? 50 : r.count; }
function retentionDays(r: RetentionRule) { return r.type === 'KeepLast' ? 30 : r.days; }

function shrinks(before: RetentionRule, after: RetentionRule): string | null {
  const bc = before.type === 'TimeBased' ? Infinity : before.count;
  const ac = after.type === 'TimeBased' ? Infinity : after.count;
  const bd = before.type === 'KeepLast' ? Infinity : before.days;
  const ad = after.type === 'KeepLast' ? Infinity : after.days;
  if (ac < bc && ad < bd) return `Files will keep at most ${ac} versions, none older than ${ad} days.`;
  if (ac < bc) return `Files will keep at most ${ac} versions instead of ${Number.isFinite(bc) ? bc : 'any number'}.`;
  if (ad < bd) return `Versions older than ${ad} days will be removed${Number.isFinite(bd) ? ` instead of after ${bd}` : ''}.`;
  return null;
}

type FolderSection = 'general' | 'versions' | 'skipped' | 'storage';
const FOLDER_SECTIONS: NavSection<FolderSection>[] = [
  { id: 'general', label: 'Look', icon: <Palette size={15} /> },
  { id: 'versions', label: 'Versions', icon: <History size={15} /> },
  { id: 'skipped', label: 'What to watch', icon: <Filter size={15} /> },
  { id: 'storage', label: 'Space used', icon: <Database size={15} /> },
];

const SWATCH_ON = 'shadow-[0_0_0_2px_hsl(var(--card)),0_0_0_4px_hsl(var(--foreground)/0.7)] scale-105';

const PRESETS = [
  { label: 'Code', Icon: Code2, icon: 'Code2', color: ACCENT_COLOR, retention: 50, debounce: 1000, hint: '50 versions, waits 1 s' },
  { label: 'Writing', Icon: BookOpen, icon: 'BookOpen', color: 'emerald', retention: 20, debounce: 3000, hint: '20 versions, waits 3 s' },
  { label: 'Media', Icon: Camera, icon: 'Camera', color: 'rose', retention: 5, debounce: 5000, hint: '5 versions, waits 5 s' },
];

function FolderSettingsPage({ folderId }: { folderId: number }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get('section') as FolderSection | null;
  const section: FolderSection = requested && FOLDER_SECTIONS.some((s) => s.id === requested) ? requested : 'general';
  const setSection = (s: FolderSection) => setParams((p) => { p.set('section', s); return p; }, { replace: true });

  const { data: folders } = useFolders();
  const folder = folders?.find((f) => f.id === folderId);
  const update = useUpdateFolderConfig();
  const rename = useRenameFolder();
  const { toast } = useToast();

  const [config, setConfig] = useState<FolderConfig | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [confirmShrink, setConfirmShrink] = useState<string | null>(null);
  const loadedFor = useRef<number | null>(null);

  useEffect(() => {
    if (folder && loadedFor.current !== folder.id) {
      loadedFor.current = folder.id;
      setConfig(folder.config);
      setDisplayName(folder.displayName);
    }
  }, [folder]);

  const dirty = !!folder && !!config && (JSON.stringify(config) !== JSON.stringify(folder.config) || displayName.trim() !== folder.displayName);
  const isPending = update.isPending || rename.isPending;

  async function commit() {
    if (!config || !folder) return;
    const ops: Promise<unknown>[] = [update.mutateAsync({ id: folderId, config })];
    if (displayName.trim() && displayName.trim() !== folder.displayName) {
      ops.push(rename.mutateAsync({ id: folderId, displayName: displayName.trim() }));
    }
    await Promise.all(ops)
      .then(() => toast('success', 'Folder settings saved.'))
      .catch((e: unknown) => toast('error', String(e)));
    setConfirmShrink(null);
  }

  function save() {
    if (!config || !folder) return;
    const warn = shrinks(folder.config.retention, config.retention);
    if (warn) { setConfirmShrink(warn); return; }
    void commit();
  }

  function revert() {
    if (!folder) return;
    setConfig(folder.config);
    setDisplayName(folder.displayName);
  }

  const tint = folderTint(config?.color);
  const [{ folderIcons }] = useAppearance();
  const tk = config ? triggerKind(config.trigger) : 'change';
  const rk = config ? retentionKind(config.retention) : 'count';

  function setTriggerKind(k: TriggerKind) {
    if (!config) return;
    const mins = triggerMinutes(config.trigger);
    const next: BackupTrigger = k === 'manual' ? { type: 'Manual' } : k === 'schedule' ? (config.trigger.type === 'Hybrid' ? config.trigger : { type: 'Interval', minutes: mins }) : { type: 'OnChange' };
    setConfig({ ...config, trigger: next });
  }
  function setMinutes(m: number) {
    if (!config) return;
    const t = config.trigger;
    setConfig({ ...config, trigger: t.type === 'Hybrid' ? { ...t, interval_minutes: m } : { type: 'Interval', minutes: m } });
  }
  function setRetention(kind: RetentionKind, count: number, days: number) {
    if (!config) return;
    const r: RetentionRule = kind === 'count' ? { type: 'KeepLast', count } : kind === 'age' ? { type: 'TimeBased', days } : { type: 'Hybrid', count, days };
    setConfig({ ...config, retention: r });
  }

  return (
    <div className="relative flex-1 min-w-0 flex">
      <SettingsFrame
        title={folder?.displayName ?? ''}
        subtitle={<span className="flex items-center gap-1.5 min-w-0"><span data-tauri-drag-region className="text-muted-foreground shrink-0">Folder settings</span><CopyPath path={folder?.path ?? ''} /></span>}
        leading={
          <>
            <IconButton label="Back to the folder" onClick={() => navigate(`/folder/${folderId}`)}><ArrowLeft size={17} /></IconButton>
            <span className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0 ml-1">
              {config && <FolderIcon name={config.icon} size={19} {...tint} />}
            </span>
          </>
        }
        sections={FOLDER_SECTIONS}
        active={section}
        onSelect={setSection}
      >
        {!config ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 rounded-xl" />)}</div>
        ) : section === 'general' ? (
          <>
            <Group title="Name">
              <div className="px-4 py-3">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={folder?.displayName}
                  aria-label="Folder name"
                  className="field"
                />
              </div>
            </Group>
            <Group title="Icon and color">
              <div className="px-4 pt-4 pb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => !followsAccent(config.color) && setConfig({ ...config, color: followsAccent(folder?.config.color) ? folder?.config.color : ACCENT_COLOR })}
                    aria-label="Accent color"
                    aria-pressed={followsAccent(config.color)}
                    data-tip="Follows the accent color"
                    className={`press w-7 h-7 rounded-full grid place-items-center bg-primary text-primary-foreground transition-[transform,box-shadow] duration-300 ease-zftm
                                ${followsAccent(config.color) ? SWATCH_ON : 'opacity-70 hover:opacity-100 hover:scale-110'}`}
                  >
                    <Palette size={13} />
                  </button>
                  <span className="w-px h-6 bg-[hsl(var(--line-strong))] mx-1" />
                  {FOLDER_COLORS.map((c) => {
                    const on = config.color === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => setConfig({ ...config, color: c.id })}
                        aria-label={c.label}
                        aria-pressed={on}
                        data-tip={c.label}
                        className={`color-swatch press w-7 h-7 rounded-full transition-[transform,box-shadow] duration-300 ease-zftm
                                    ${on ? SWATCH_ON : 'opacity-70 hover:opacity-100 hover:scale-110'}`}
                        style={folderTint(c.id).style}
                      />
                    );
                  })}
                  <span className="w-px h-6 bg-[hsl(var(--line-strong))] mx-1" />
                  <ColorWell
                    value={config.color?.startsWith('#') ? folderHex(config.color) : null}
                    fallback={folderHex(config.color) ?? '#60a5fa'}
                    onChange={(hex) => setConfig({ ...config, color: hex })}
                  />
                </div>
                {folderIcons === 'accent' && (
                  <p className="text-xs text-muted-foreground mt-3">All folder icons currently use the accent color. You can change that in Settings under Appearance.</p>
                )}
              </div>
              <div className="px-3 py-3 grid grid-cols-[repeat(auto-fill,minmax(38px,1fr))] gap-1">
                {FOLDER_ICON_NAMES.map((name) => {
                  const on = config.icon === name || (!config.icon && name === 'Folder');
                  return (
                    <button
                      key={name}
                      onClick={() => setConfig({ ...config, icon: name })}
                      aria-label={name}
                      aria-pressed={on}
                      className={`press h-9 rounded-[calc(9px*var(--rs))] grid place-items-center transition-colors
                                  ${on ? `${tint.className} folder-tile shadow-[inset_0_0_0_1px_currentColor]` : 'text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]'}`}
                      style={on ? tint.style : undefined}
                    >
                      <FolderIcon name={name} size={17} />
                    </button>
                  );
                })}
              </div>
            </Group>
            <Group title="Start from a preset" description="Sets the icon, color, how many versions to keep and how long to wait after a save.">
              <div className="p-3 grid grid-cols-3 gap-2">
                {PRESETS.map((p) => {
                  const pc = folderTint(p.color);
                  return (
                    <button
                      key={p.label}
                      onClick={() => setConfig({ ...config, icon: p.icon, color: p.color, retention: { type: 'KeepLast', count: p.retention }, debounce_ms: p.debounce })}
                      className="press flex flex-col items-start gap-2.5 p-3 rounded-lg text-left bg-foreground/[0.03] shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:bg-foreground/[0.06]"
                    >
                      <span className={`w-8 h-8 rounded-[calc(9px*var(--rs))] grid place-items-center folder-tile ${pc.className}`} style={pc.style}><p.Icon size={16} /></span>
                      <span>
                        <span className="block text-sm font-medium">{p.label}</span>
                        <span className="block text-2xs text-faint mt-0.5">{p.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Group>
          </>
        ) : section === 'versions' ? (
          <>
            <Group
              title="When to save a version"
              description={tk === 'manual'
                ? 'Nothing is saved automatically. Use the camera button on a file to save a version.'
                : tk === 'schedule'
                  ? 'Every save is kept, and changed files are also checked on a fixed schedule in case a save was missed.'
                  : 'A version is kept a moment after each time a file is saved.'}
            >
              <div className="px-4 py-3.5">
                <Segmented<TriggerKind>
                  value={tk}
                  onChange={setTriggerKind}
                  ariaLabel="When to save a version"
                  options={[{ value: 'change', label: 'Every save' }, { value: 'schedule', label: 'Every save and on a schedule' }, { value: 'manual', label: 'Only by hand' }]}
                />
              </div>
              {tk === 'schedule' && (
                <Row label="Check every" htmlFor="every">
                  <NumberField id="every" value={triggerMinutes(config.trigger)} onChange={(v) => setMinutes(Math.max(1, v ?? 1))} suffix="minutes" min={1} width="w-20" />
                </Row>
              )}
              {tk !== 'manual' && (
                <>
                  <Row label="Wait after a save" description="Several saves within this time count as one. Helps with editors that save on every keystroke." stacked>
                    <Chips<number>
                      value={config.debounce_ms ?? 2000}
                      onChange={(v) => setConfig({ ...config, debounce_ms: v })}
                      options={[{ label: '0.5 s', value: 500 }, { label: '1 s', value: 1000 }, { label: '2 s', value: 2000 }, { label: '5 s', value: 5000 }, { label: '10 s', value: 10000 }]}
                    />
                  </Row>
                  <Row label="At most one version every" description="Useful when a formatter or build tool rewrites the same file over and over." stacked>
                    <Chips<number | undefined>
                      value={config.min_snapshot_interval_secs}
                      onChange={(v) => setConfig({ ...config, min_snapshot_interval_secs: v })}
                      options={[{ label: 'No limit', value: undefined }, { label: '10 s', value: 10 }, { label: '30 s', value: 30 }, { label: '1 min', value: 60 }, { label: '2 min', value: 120 }, { label: '5 min', value: 300 }]}
                    />
                  </Row>
                </>
              )}
            </Group>

            <Group
              title="How long to keep versions"
              description={rk === 'both' ? 'A version is removed when it is too old or when there are too many, whichever comes first.' : 'The newest version of a file is always kept.'}
            >
              <div className="px-4 py-3.5">
                <Segmented<RetentionKind>
                  value={rk}
                  onChange={(k) => setRetention(k, retentionCount(config.retention), retentionDays(config.retention))}
                  ariaLabel="How long to keep versions"
                  options={[{ value: 'count', label: 'A number of versions' }, { value: 'age', label: 'A number of days' }, { value: 'both', label: 'Both' }]}
                />
              </div>
              {rk !== 'age' && (
                <Row label="Keep the newest" description="Per file. 20 to 50 suits code, 5 to 10 saves space." htmlFor="keep">
                  <NumberField id="keep" value={retentionCount(config.retention)} onChange={(v) => setRetention(rk, Math.max(1, v ?? 1), retentionDays(config.retention))} suffix="versions" min={1} width="w-20" />
                </Row>
              )}
              {rk !== 'count' && (
                <Row label="Keep versions for" htmlFor="days">
                  <NumberField id="days" value={retentionDays(config.retention)} onChange={(v) => setRetention(rk, retentionCount(config.retention), Math.max(1, v ?? 1))} suffix="days" min={1} width="w-20" />
                </Row>
              )}
            </Group>

            <Group title="Large and binary files" description="Binary files are recognized by their content, not their name.">
              <Row label="Skip binary files larger than" description="Set to 0 to skip all binary files." htmlFor="bin">
                <NumberField id="bin" value={config.binary_max_mb} onChange={(v) => setConfig({ ...config, binary_max_mb: v ?? 0 })} suffix="MB" width="w-20" />
              </Row>
              <Row label="Compress stored versions" description="Usually makes text two to five times smaller. Applies to new versions only." htmlFor="zstd">
                <Switch id="zstd" checked={config.compressionEnabled ?? false} onChange={(v) => setConfig({ ...config, compressionEnabled: v })} label="Compress stored versions" />
              </Row>
              <Row label="Watch subfolders down to" description="Leave empty to watch every level." htmlFor="depth">
                <NumberField id="depth" value={config.max_depth ?? ''} onChange={(v) => setConfig({ ...config, max_depth: v })} placeholder="All" suffix="levels" width="w-20" min={1} />
              </Row>
            </Group>
          </>
        ) : section === 'skipped' ? (
          <>
            <Group
              title="What to watch"
              description="Changes take effect when you save. Files that already have versions keep them, they just get no new ones."
            >
              <div className="p-4">
                {folder && <FolderContentPicker root={folder.path} globs={config.ignore_globs} onChange={(globs) => setConfig({ ...config, ignore_globs: globs })} height={360} />}
              </div>
            </Group>
            <Group title="All rules" description="Every rule from above in gitignore syntax, for fine-tuning by hand.">
              <div className="p-4">
                <IgnoreRulesEditor globs={config.ignore_globs} onChange={(globs) => setConfig({ ...config, ignore_globs: globs })} />
              </div>
            </Group>
          </>
        ) : (
          <StorageBreakdown folderId={folderId} />
        )}
      </SettingsFrame>
      <SaveBar dirty={dirty} saving={isPending} onSave={save} onRevert={revert} />
      <ConfirmDialog
        open={confirmShrink != null}
        title="Remove older versions?"
        icon={<TriangleAlert size={18} />}
        destructive
        confirmLabel="Save and remove"
        loading={isPending}
        onConfirm={() => void commit()}
        onCancel={() => setConfirmShrink(null)}
      >
        {confirmShrink} Versions beyond that are deleted for good the next time each file is saved.
      </ConfirmDialog>
    </div>
  );
}

export function Settings() {
  const { id } = useParams<{ id?: string }>();
  const folderId = id ? parseInt(id, 10) : undefined;
  return folderId ? <FolderSettingsPage key={folderId} folderId={folderId} /> : <GlobalSettingsPage />;
}

