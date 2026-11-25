import { useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderPlus, Eye, History, RotateCcw, Check, X, ArrowRight, FolderCheck } from 'lucide-react';
import logoUrl from '../assets/logo.png';
import { useAddFolder } from '@/hooks/useFolders';
import { DEFAULT_CONFIG, DEFAULT_GLOBS } from '@/lib/folderDefaults';
import { FolderContentPicker } from './FolderContentPicker';
import { pickFolder, formatPath } from '@/lib/tauri';
import { useToast } from '@/context/ToastContext';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import SplitText from './reactbits/SplitText';
import { gsap, dur } from '@/lib/motion';
import type { Folder } from '@/lib/types';

interface Props {
  open: boolean;
  onComplete: () => void;
}

type Step = 'welcome' | 'intro' | 'add-folder' | 'ignore' | 'done';
const STEPS: Step[] = ['welcome', 'intro', 'add-folder', 'ignore', 'done'];


function Progress({ step }: { step: Step }) {
  const idx = STEPS.indexOf(step);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${idx + 1} of ${STEPS.length}`}>
      {STEPS.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-[width,background-color] duration-500 ease-zftm
                      ${i === idx ? 'w-6 bg-primary' : i < idx ? 'w-1.5 bg-primary/45' : 'w-1.5 bg-foreground/15'}`}
        />
      ))}
    </div>
  );
}

export function OnboardingModal({ open, onComplete }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('welcome');
  const [addedFolder, setAddedFolder] = useState<Folder | null>(null);
  const [pickedPath, setPickedPath] = useState<string | null>(null);
  const [globs, setGlobs] = useState<string[]>(DEFAULT_GLOBS);
  const [picking, setPicking] = useState(false);
  const addFolder = useAddFolder();
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef<number | null>(null);
  const lastIndex = useRef(0);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;
    const h = inner.offsetHeight;
    const idx = STEPS.indexOf(step);
    const forward = idx >= lastIndex.current;
    if (lastHeight.current != null && lastHeight.current !== h) {
      gsap.fromTo(frame, { height: lastHeight.current }, { height: h, duration: dur(0.55), ease: 'zftm', clearProps: 'height' });
    }
    if (lastHeight.current != null) {
      gsap.fromTo(inner.children, { autoAlpha: 0, x: forward ? 18 : -18 }, { autoAlpha: 1, x: 0, duration: dur(0.5), stagger: 0.04, ease: 'zftm', clearProps: 'transform' });
    }
    lastHeight.current = h;
    lastIndex.current = idx;
  }, [step]);

  async function handlePickFolder() {
    setPicking(true);
    try {
      const path = await pickFolder();
      if (path) { setPickedPath(path); setGlobs(DEFAULT_GLOBS); }
    } catch (e) {
      toast('error', `Could not open the folder picker: ${String(e)}`);
    } finally {
      setPicking(false);
    }
  }

  function startWatching() {
    if (!pickedPath) { setStep('done'); return; }
    addFolder.mutate({ path: pickedPath, config: { ...DEFAULT_CONFIG, ignore_globs: globs } }, {
      onSuccess: (folder) => { setAddedFolder(folder); setStep('done'); },
      onError: (e) => toast('error', String(e)),
    });
  }

  function finish() {
    onComplete();
    if (addedFolder) navigate(`/folder/${addedFolder.id}`);
  }

  const busy = picking || addFolder.isPending;

  return (
    <Sheet open={open} onClose={onComplete} width={620} label="Welcome to ZFileTimeMachine" dismissible={!busy}>
      <div ref={frameRef} className="overflow-hidden">
        <div ref={innerRef} className="px-8 pt-7 pb-7">
          {step !== 'welcome' && (
            <div className="flex items-center justify-between mb-6">
              <Progress step={step} />
              <button onClick={onComplete} aria-label="Skip the guide" data-tip="Skip the guide"
                className="press w-7 h-7 -mr-2 rounded-full grid place-items-center text-faint hover:text-foreground hover:bg-foreground/[0.07]">
                <X size={14} />
              </button>
            </div>
          )}

          {step === 'welcome' && (
            <div className="text-center">
              <div className="relative w-20 h-20 mx-auto mb-7">
                <div className="absolute inset-0 rounded-[calc(24px*var(--rs))] bg-primary/25 blur-2xl" aria-hidden />
                <img src={logoUrl} alt="" draggable={false} className="relative w-20 h-20 drop-shadow-[0_10px_18px_hsl(var(--shadow)/0.45)]" />
              </div>
              <SplitText
                text="Welcome to ZFileTimeMachine"
                tag="h1"
                className="text-2xl font-semibold tracking-tight"
                splitType="words"
                effect="blur"
                trigger="load"
                delay={60}
                duration={0.8}
              />
              <p className="text-base text-muted-foreground mt-3 leading-relaxed max-w-[380px] mx-auto [text-wrap:balance]">
                Every time a file in a folder you choose is saved, a copy is kept on this computer. You can go back to any of them.
              </p>
              <div className="mt-8 flex flex-col gap-2">
                <Button variant="primary" size="lg" onClick={() => setStep('intro')} trailing={<ArrowRight size={15} />} data-autofocus>
                  Show me how it works
                </Button>
                <Button variant="ghost" size="lg" onClick={onComplete}>
                  Skip, I'll find my way
                </Button>
              </div>
              <p className="text-xs text-faint mt-4">You can replay this guide from Settings.</p>
            </div>
          )}

          {step === 'intro' && (
            <div>
              <h2 className="text-xl font-semibold">Three things to know</h2>
              <div className="mt-5 space-y-1">
                {[
                  { Icon: Eye, title: 'It watches folders you pick', desc: 'Nothing else on your computer is touched. It runs quietly in the background.' },
                  { Icon: History, title: 'Every save becomes a version', desc: 'No button to press. Versions stay on this computer, never in a cloud.' },
                  { Icon: RotateCcw, title: 'Any version comes back in one click', desc: 'Open a file, pick the version you want, and restore it. Your current file is kept first.' },
                ].map(({ Icon, title, desc }) => (
                  <div key={title} className="flex gap-4 py-3">
                    <div className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-foreground/[0.055] shadow-[inset_0_0_0_1px_hsl(var(--line))] grid place-items-center shrink-0 text-foreground/80">
                      <Icon size={18} />
                    </div>
                    <div className="pt-0.5">
                      <p className="text-md font-medium">{title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep('welcome')}>Back</Button>
                <Button variant="primary" onClick={() => setStep('add-folder')} trailing={<ArrowRight size={14} />} data-autofocus>Set it up</Button>
              </div>
            </div>
          )}

          {step === 'add-folder' && (
            <div>
              <h2 className="text-xl font-semibold">Pick your first folder</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                A project, your writing, or config files work well. Start with something specific rather than your whole home folder.
              </p>
              {!pickedPath ? (
                <button
                  onClick={handlePickFolder}
                  disabled={busy}
                  className="press group mt-5 w-full flex flex-col items-center justify-center gap-3 py-10 rounded-xl
                             bg-foreground/[0.03] shadow-[inset_0_0_0_1.5px_hsl(var(--line-strong))]
                             hover:bg-primary/[0.06] hover:shadow-[inset_0_0_0_1.5px_hsl(var(--primary)/0.45)] disabled:opacity-60"
                >
                  <span className="w-12 h-12 rounded-[calc(14px*var(--rs))] bg-surface-raised shadow-card grid place-items-center text-muted-foreground group-hover:text-primary transition-colors">
                    <FolderPlus size={22} />
                  </span>
                  <span className="text-sm font-medium">Choose a folder</span>
                </button>
              ) : (
                <div className="mt-5 flex items-center gap-3 p-3.5 rounded-xl bg-primary/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]">
                  <div className="w-10 h-10 rounded-[calc(11px*var(--rs))] bg-primary/15 text-primary grid place-items-center shrink-0">
                    <FolderCheck size={19} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{pickedPath.split(/[\\/]/).filter(Boolean).pop()}</p>
                    <p className="text-xs text-faint font-mono truncate">{formatPath(pickedPath)}</p>
                  </div>
                  <button
                    onClick={handlePickFolder}
                    className="press text-xs text-muted-foreground hover:text-foreground px-2 h-7 rounded-md hover:bg-foreground/[0.06]"
                  >
                    Change
                  </button>
                </div>
              )}
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => (pickedPath ? setStep('intro') : setStep('done'))}>{pickedPath ? 'Back' : "I'll add one later"}</Button>
                <Button variant="primary" onClick={() => setStep('ignore')} disabled={!pickedPath} trailing={<ArrowRight size={14} />}>Next</Button>
              </div>
            </div>
          )}

          {step === 'ignore' && pickedPath && (
            <div>
              <h2 className="text-xl font-semibold">Choose what to watch</h2>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                Untick folders and files you don't need versions of. Build folders change all the time, so skipping them keeps the history small and readable.
              </p>
              <div className="mt-5">
                <FolderContentPicker root={pickedPath} globs={globs} onChange={setGlobs} height={250} />
              </div>
              <div className="mt-6 flex justify-between">
                <Button variant="ghost" onClick={() => setStep('add-folder')} disabled={addFolder.isPending}>Back</Button>
                <Button variant="primary" onClick={startWatching} loading={addFolder.isPending} icon={<Check size={14} />}>
                  Start watching
                </Button>
              </div>
            </div>
          )}

          {step === 'done' && (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-[calc(18px*var(--rs))] bg-positive/12 text-positive grid place-items-center mb-5 shadow-[inset_0_0_0_1px_hsl(var(--positive)/0.25)]">
                <Check size={30} strokeWidth={2.2} />
              </div>
              <h2 className="text-xl font-semibold">You're set</h2>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-[360px] mx-auto">
                {addedFolder
                  ? `${addedFolder.displayName} is being watched. Change any file in it and its first version appears within a few seconds.`
                  : 'Add a folder from the sidebar whenever you are ready.'}
              </p>
              <Button variant="primary" size="lg" className="mt-7 w-full" onClick={finish} trailing={<ArrowRight size={15} />} data-autofocus>
                {addedFolder ? `Open ${addedFolder.displayName}` : 'Start using ZFileTimeMachine'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
