import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FolderDown } from 'lucide-react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useAddFolder } from '@/hooks/useFolders';
import { pickFolder } from '@/lib/tauri';
import { useToast } from './ToastContext';
import { AddFolderDialog } from '@/components/AddFolderDialog';
import { gsap, dur } from '@/lib/motion';
import { DEFAULT_CONFIG } from '@/lib/folderDefaults';

interface Ctx {
  startAddFolder: () => void;
  isAdding: boolean;
}

const AddFolderCtx = createContext<Ctx>({ startAddFolder: () => {}, isAdding: false });

export const useAddFolderFlow = () => useContext(AddFolderCtx);

function nameOf(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function DropOverlay({ visible }: { visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(visible);

  useEffect(() => { if (visible) setMounted(true); }, [visible]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !mounted) return;
    if (visible) {
      gsap.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur(0.25), overwrite: true });
      gsap.fromTo(el.querySelector('[data-card]'), { scale: 0.94, y: 10 }, { scale: 1, y: 0, duration: dur(0.55), ease: 'zftm' });
    } else {
      gsap.to(el, { autoAlpha: 0, duration: dur(0.2), overwrite: true, onComplete: () => setMounted(false) });
    }
  }, [visible, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-[70] pointer-events-none invisible bg-[hsl(var(--scrim))] backdrop-blur-[6px] grid place-items-center">
      <div data-card className="bezel">
        <div className="bezel-core px-12 py-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/14 text-primary grid place-items-center shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)] mb-4">
            <FolderDown size={26} />
          </div>
          <p className="text-lg font-semibold">Drop to start watching</p>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px]">Common build folders like node_modules and target are skipped.</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AddFolderProvider({ children }: { children: ReactNode }) {
  const addFolder = useAddFolder();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const recentDrops = useRef(new Set<string>());

  const startAddFolder = useCallback(async () => {
    try {
      const path = await pickFolder();
      if (path) setPendingPath(path);
    } catch (e) {
      toast('error', `Could not open the folder picker: ${String(e)}`);
    }
  }, [toast]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebviewWindow().onDragDropEvent((event) => {
      const t = event.payload.type;
      if (t === 'enter') setDragging(true);
      else if (t === 'leave') setDragging(false);
      else if (t === 'drop') {
        setDragging(false);
        const dropped = event.payload.paths;
        if (dropped.length === 1 && !recentDrops.current.has(dropped[0])) {
          setPendingPath(dropped[0]);
          return;
        }
        for (const path of dropped) {
          if (recentDrops.current.has(path)) continue;
          recentDrops.current.add(path);
          setTimeout(() => recentDrops.current.delete(path), 3000);
          addFolder.mutate(
            { path, config: DEFAULT_CONFIG },
            {
              onError: (e) => toast('error', String(e)),
              onSuccess: (folder) => {
                toast('success', `Watching ${nameOf(path)}. Common build folders are skipped.`, {
                  action: { label: 'Settings', onClick: () => navigate(`/folder/${folder.id}/settings`) },
                });
                navigate(`/folder/${folder.id}`);
              },
            },
          );
        }
      }
    }).then((fn) => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, []);

  function confirm(ignoreGlobs: string[]) {
    if (!pendingPath) return;
    const path = pendingPath;
    addFolder.mutate(
      { path, config: { ...DEFAULT_CONFIG, ignore_globs: ignoreGlobs } },
      {
        onError: (e) => toast('error', String(e)),
        onSuccess: (folder) => {
          toast('success', `Watching ${nameOf(path)}.`);
          setPendingPath(null);
          navigate(`/folder/${folder.id}`);
        },
      },
    );
  }

  return (
    <AddFolderCtx.Provider value={{ startAddFolder: () => void startAddFolder(), isAdding: addFolder.isPending }}>
      {children}
      <AddFolderDialog
        path={pendingPath}
        isLoading={addFolder.isPending}
        onConfirm={confirm}
        onCancel={() => setPendingPath(null)}
      />
      <DropOverlay visible={dragging} />
    </AddFolderCtx.Provider>
  );
}
