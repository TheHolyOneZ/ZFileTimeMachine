import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight, FolderOpen, Shield, Clock, Eye, CheckCircle2,
  FolderPlus, Loader2, Check, X, Sparkles, ArrowRight, Info,
} from 'lucide-react';
import logoUrl from '../assets/logo.png';
import { useAddFolder, useUpdateFolderConfig } from '@/hooks/useFolders';
import { pickFolder } from '@/lib/tauri';
import { useToast } from '@/context/ToastContext';
import type { Folder, FolderConfig } from '@/lib/types';

interface Props {
  onComplete: () => void;
}

type Step = 'welcome' | 'intro' | 'add-folder' | 'ignore' | 'done';
const NEWBIE_STEPS: Step[] = ['intro', 'add-folder', 'ignore', 'done'];


const IGNORE_OPTS = [
  { glob: 'node_modules', label: 'node_modules', desc: 'Node.js packages — 100k+ files' },
  { glob: '.git',         label: '.git',         desc: 'Git internals — changes constantly' },
  { glob: '*.tmp',        label: '*.tmp',        desc: 'Temporary files' },
  { glob: '*.log',        label: '*.log',        desc: 'Log files' },
  { glob: 'dist',         label: 'dist',         desc: 'Webpack / Vite build output' },
  { glob: 'build',        label: 'build',        desc: 'Build output directory' },
  { glob: 'target',       label: 'target',       desc: 'Rust / Maven artifacts' },
  { glob: '__pycache__',  label: '__pycache__',  desc: 'Python bytecode cache' },
  { glob: '.next',        label: '.next',        desc: 'Next.js / Nuxt cache' },
  { glob: 'vendor',       label: 'vendor',       desc: 'PHP / Go vendor deps' },
  { glob: '.venv',        label: '.venv',        desc: 'Python virtual env' },
  { glob: 'coverage',     label: 'coverage',     desc: 'Test coverage reports' },
] as const;


function StepDots({ current }: { current: Step }) {
  const idx = NEWBIE_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {NEWBIE_STEPS.map((s, i) => (
        <div
          key={s}
          className={`rounded-full transition-all duration-300 ${
            i === idx
              ? 'w-6 h-1.5 bg-primary'
              : i < idx
                ? 'w-1.5 h-1.5 bg-primary/40'
                : 'w-1.5 h-1.5 bg-secondary'
          }`}
        />
      ))}
    </div>
  );
}


function ModalShell({
  children,
  onSkip,
  wide = false,
}: {
  children: React.ReactNode;
  onSkip: () => void;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4">
      <div
        className={`bg-card border border-border rounded-2xl
                    shadow-overlay
                    w-full ${wide ? 'max-w-2xl' : 'max-w-lg'}
                    max-h-[92vh] overflow-y-auto animate-scale-in`}
      >
        <div className="p-8">
          <div className="flex justify-end -mt-2 -mr-2 mb-2">
            <button
              onClick={onSkip}
              className="p-1.5 rounded-lg text-muted-foreground/70 hover:text-muted-foreground
                         hover:bg-secondary transition-colors"
              title="Skip guide"
            >
              <X size={14} />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}


function Tip({ color, icon: Icon, children }: {
  color: 'blue' | 'amber';
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  const styles = {
    blue:  { wrap: 'bg-blue-500/8 border-blue-500/20',  icon: 'text-blue-400',  text: 'text-blue-200/80',  strong: 'text-blue-300' },
    amber: { wrap: 'bg-amber-500/8 border-amber-500/20', icon: 'text-amber-400', text: 'text-amber-200/80', strong: 'text-amber-300' },
  }[color];

  return (
    <div className={`flex gap-2.5 p-3.5 rounded-xl border mb-5 ${styles.wrap}`}>
      <Icon size={14} className={`${styles.icon} shrink-0 mt-0.5`} />
      <p className={`text-xs leading-relaxed ${styles.text} [&_strong]:${styles.strong}`}>
        {children}
      </p>
    </div>
  );
}


function PrimaryBtn({
  onClick,
  disabled,
  loading,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled ?? loading}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                 bg-primary text-primary-foreground shadow-button font-medium text-sm
                 hover:bg-primary/90 transition-colors
                 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {loading && <Loader2 size={14} className="animate-spin-slow" />}
      {children}
    </button>
  );
}


export function OnboardingModal({ onComplete }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('welcome');
  const [addedFolder, setAddedFolder] = useState<Folder | null>(null);
  const [selectedIgnores, setSelectedIgnores] = useState<Set<string>>(new Set());
  const [pickingFolder, setPickingFolder] = useState(false);

  const addFolder      = useAddFolder();
  const updateConfig   = useUpdateFolderConfig();

  async function handlePickFolder() {
    setPickingFolder(true);
    try {
      const path = await pickFolder();
      if (!path) { setPickingFolder(false); return; }
      addFolder.mutate({ path }, {
        onSuccess: (folder) => {
          setAddedFolder(folder);
          setSelectedIgnores(new Set(folder.config.ignore_globs));
          setPickingFolder(false);
        },
        onError: (e) => {
          toast('error', String(e));
          setPickingFolder(false);
        },
      });
    } catch (e) {
      toast('error', `Could not open folder picker: ${String(e)}`);
      setPickingFolder(false);
    }
  }

  function toggleIgnore(glob: string) {
    setSelectedIgnores((prev) => {
      const next = new Set(prev);
      if (next.has(glob)) next.delete(glob);
      else next.add(glob);
      return next;
    });
  }

  function applyAndFinish() {
    if (!addedFolder) { setStep('done'); return; }
    const config: FolderConfig = {
      ...addedFolder.config,
      ignore_globs: Array.from(selectedIgnores),
    };
    updateConfig.mutate({ id: addedFolder.id, config }, {
      onSuccess: () => setStep('done'),
      onError:   (e) => toast('error', String(e)),
    });
  }


  if (step === 'welcome') {
    return (
      <div className="fixed inset-0 z-[100] bg-black/65 backdrop-blur-[2px] flex items-center justify-center p-4">
        <div className="bg-card border border-border rounded-2xl shadow-overlay w-full max-w-md animate-scale-in">
          <div className="p-8">

            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-4 animate-pulse-ring">
                <img src={logoUrl} alt="ZFileTimeMachine" className="w-10 h-10 rounded-lg object-cover" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Welcome to ZFileTimeMachine</h1>
              <p className="text-sm text-muted-foreground">
                Automatic file snapshots — rewind any file to any moment.
              </p>
            </div>


            <p className="text-xs font-semibold text-muted-foreground text-center mb-4">
              How would you describe yourself?
            </p>


            <button
              onClick={() => setStep('intro')}
              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-primary/30
                         bg-primary/5 hover:border-primary/60 hover:bg-primary/10
                         transition-all text-left group mb-3"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">Show me around</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  A short walkthrough of adding a folder and rewinding a file
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-primary shrink-0 group-hover:translate-x-0.5 transition-transform"
              />
            </button>


            <button
              onClick={onComplete}
              className="w-full flex items-center gap-4 p-4 rounded-xl border border-border
                         bg-secondary/20 hover:bg-secondary/50 hover:border-border/80
                         transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary/80 flex items-center justify-center shrink-0">
                <img src={logoUrl} alt="Z" className="w-6 h-6 rounded-lg object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">Skip the tour</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Go straight to the app. You can replay the tour from Settings
                </p>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground shrink-0 group-hover:translate-x-0.5 transition-transform"
              />
            </button>
          </div>
        </div>
      </div>
    );
  }


  if (step === 'intro') {
    return (
      <ModalShell onSkip={onComplete}>
        <StepDots current="intro" />
        <h2 className="text-xl font-bold mb-1">Here's what this app does</h2>
        <p className="text-sm text-muted-foreground mb-6">Everything you need to know in 30 seconds.</p>

        <div className="space-y-3 mb-8">
          {[
            {
              Icon: Eye,
              color: 'text-blue-400 bg-blue-500/10 border-blue-500/15',
              title: 'Watches your folders silently',
              desc: 'You pick which folders to monitor. The app runs in the background — no manual action needed.',
            },
            {
              Icon: Clock,
              color: 'text-purple-400 bg-purple-500/10 border-purple-500/15',
              title: 'Snapshots every save automatically',
              desc: 'Every time you save a file, a copy is captured. No extra steps. No slowdown.',
            },
            {
              Icon: ArrowRight,
              color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15',
              title: 'Rewind any file instantly',
              desc: 'Browse a file\'s full version history and restore any past version with one click.',
            },
          ].map(({ Icon, color, title, desc }) => (
            <div
              key={title}
              className="flex gap-3.5 p-4 rounded-xl bg-secondary/20 border border-border/50"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${color}`}>
                <Icon size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <PrimaryBtn onClick={() => setStep('add-folder')}>
          Got it — let's set it up
          <ChevronRight size={16} />
        </PrimaryBtn>
      </ModalShell>
    );
  }


  if (step === 'add-folder') {
    const busy = pickingFolder || addFolder.isPending;

    return (
      <ModalShell onSkip={onComplete}>
        <StepDots current="add-folder" />
        <h2 className="text-xl font-bold mb-1">Add your first folder</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Pick a folder whose files you want to protect. Everything inside will be watched.
        </p>

        <Tip color="blue" icon={Info}>
          <strong>Good choices:</strong> a project folder, your writing directory, config files.
          <br />
          <strong>Avoid:</strong> your entire home folder or Downloads — start with something specific.
        </Tip>

        {!addedFolder ? (
          <button
            onClick={handlePickFolder}
            disabled={busy}
            className="w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl
                       border-2 border-dashed border-border/50
                       hover:border-primary/50 hover:bg-primary/5
                       text-muted-foreground hover:text-primary
                       transition-all disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {busy ? (
              <Loader2 size={28} className="animate-spin-slow" />
            ) : (
              <FolderPlus size={28} />
            )}
            <span className="text-sm font-medium">
              {busy ? 'Adding folder…' : 'Click to browse and select a folder'}
            </span>
            {!busy && (
              <span className="text-xs text-muted-foreground/50">
                A native file picker will open
              </span>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/8 mb-4">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-300">{addedFolder.displayName}</p>
              <p className="text-[11px] text-emerald-500/60 font-mono truncate">{addedFolder.path}</p>
            </div>
            <button
              onClick={() => { setAddedFolder(null); setSelectedIgnores(new Set()); }}
              className="p-1.5 text-emerald-600/50 hover:text-emerald-400 transition-colors shrink-0"
              title="Pick a different folder"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <PrimaryBtn onClick={() => setStep('ignore')} disabled={!addedFolder}>
          Next — set up filters
          <ChevronRight size={16} />
        </PrimaryBtn>

        {!addedFolder && (
          <button
            onClick={() => setStep('ignore')}
            className="mt-2.5 w-full text-center text-xs text-muted-foreground/70
                       hover:text-muted-foreground transition-colors py-1"
          >
            Skip — I'll add a folder later
          </button>
        )}
      </ModalShell>
    );
  }


  if (step === 'ignore') {
    return (
      <ModalShell onSkip={() => { applyAndFinish(); }} wide>
        <StepDots current="ignore" />
        <h2 className="text-xl font-bold mb-1">What should we skip?</h2>
        <p className="text-sm text-muted-foreground mb-5">
          Some folders contain thousands of auto-generated files. Watching them wastes disk space
          and makes the file list noisy.
        </p>

        <Tip color="amber" icon={Shield}>
          <strong>If this is a development project</strong>, definitely ignore{' '}
          <code className="font-mono bg-amber-500/15 px-1 rounded">node_modules</code>,{' '}
          <code className="font-mono bg-amber-500/15 px-1 rounded">.git</code>, and any
          build output directories. These can contain millions of auto-generated files that
          change on every build.
        </Tip>


        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {IGNORE_OPTS.map(({ glob, label, desc }) => {
            const on = selectedIgnores.has(glob);
            return (
              <button
                key={glob}
                onClick={() => toggleIgnore(glob)}
                className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                  on
                    ? 'border-primary/40 bg-primary/8'
                    : 'border-border/40 bg-secondary/20 hover:border-border hover:bg-secondary/40'
                }`}
              >

                <div
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 border transition-colors ${
                    on ? 'bg-primary border-primary' : 'border-border/60 bg-transparent'
                  }`}
                >
                  {on && <Check size={10} className="text-primary-foreground" />}
                </div>

                <div className="min-w-0">
                  <p className={`text-xs font-mono font-semibold truncate ${on ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {label}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-tight">{desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground/70 text-center mb-5">
          {selectedIgnores.size} pattern{selectedIgnores.size !== 1 ? 's' : ''} selected
          &nbsp;·&nbsp; you can edit these anytime in Settings
        </p>

        <PrimaryBtn onClick={applyAndFinish} loading={updateConfig.isPending}>
          {!updateConfig.isPending && <Check size={14} />}
          Apply &amp; finish setup
        </PrimaryBtn>
      </ModalShell>
    );
  }


  if (step === 'done') {
    return (
      <ModalShell onSkip={onComplete}>
        <StepDots current="done" />
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/20
                          flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">You're all set!</h2>
          <p className="text-sm text-muted-foreground">
            {addedFolder
              ? `ZFileTimeMachine is now watching "${addedFolder.displayName}". Edit any file and a snapshot will appear within seconds.`
              : 'ZFileTimeMachine is ready. Add a folder from the main screen to start tracking.'}
          </p>
        </div>

        {addedFolder && (
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 mb-6 space-y-2.5">
            <p className="text-xs font-semibold text-muted-foreground mb-3">
              What was set up
            </p>
            <div className="flex items-center gap-2.5 text-sm">
              <FolderOpen size={14} className="text-primary shrink-0" />
              <span className="text-foreground/80">
                Watching <strong className="text-foreground">{addedFolder.displayName}</strong>
              </span>
            </div>
            {selectedIgnores.size > 0 && (
              <div className="flex items-start gap-2.5 text-sm">
                <Shield size={14} className="text-emerald-400 shrink-0 mt-px" />
                <span className="text-foreground/80">
                  Ignoring{' '}
                  <span className="font-mono text-xs text-foreground/60">
                    {Array.from(selectedIgnores).slice(0, 5).join(', ')}
                    {selectedIgnores.size > 5 ? ` +${selectedIgnores.size - 5} more` : ''}
                  </span>
                </span>
              </div>
            )}
          </div>
        )}

        <PrimaryBtn
          onClick={() => {
            onComplete();
            if (addedFolder) navigate(`/folder/${addedFolder.id}`);
          }}
        >
          {addedFolder ? 'Go to my folder' : 'Start using ZFileTimeMachine'}
          <ArrowRight size={15} />
        </PrimaryBtn>
      </ModalShell>
    );
  }

  return null;
}
