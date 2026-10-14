import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Search } from 'lucide-react';
import logoUrl from '@/assets/logo.png';


export const IS_MAC = /Mac/i.test(navigator.userAgent);

function WindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const sync = () => { win.isMaximized().then(setMaximized).catch(() => {}); };
    sync();
    win.onResized(sync).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => unlisten?.();
  }, [win]);

  const btn =
    'h-full w-[46px] flex items-center justify-center text-muted-foreground ' +
    'hover:text-foreground hover:bg-foreground/[0.07] active:bg-foreground/[0.11] ' +
    'focus-visible:outline-none focus-visible:bg-foreground/[0.09] [&:not(:disabled):active]:scale-100';

  return (
    <div className="flex h-full shrink-0">
      <button className={btn} onClick={() => void win.minimize()} aria-label="Minimize" title="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M0.5 5h9" stroke="currentColor" /></svg>
      </button>
      <button
        className={btn}
        onClick={() => void win.toggleMaximize()}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" />
            <path d="M2.5 2.5V1.5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-1" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        className={`${btn} hover:!bg-[#e5484d] hover:!text-white active:!bg-[#c93c40]`}
        onClick={() => void win.close()}
        aria-label="Close"
        title="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function TitleBar({ onOpenSearch }: { onOpenSearch: () => void }) {
  return (
    <header
      data-tauri-drag-region
      className="relative h-10 shrink-0 flex items-center bg-chrome select-none"
    >

      <div
        data-tauri-drag-region
        className={`flex items-center gap-2.5 h-full shrink-0 ${IS_MAC ? 'pl-[84px]' : 'pl-3'}`}
      >
        {!IS_MAC && (
          <img src={logoUrl} alt="" draggable={false} className="w-6 h-6 rounded-md pointer-events-none" />
        )}
        <span data-tauri-drag-region className="text-[13px] font-medium text-foreground/90 tracking-tight">
          ZFileTimeMachine
        </span>
        <span
          data-tauri-drag-region
          className="text-[10px] font-medium px-1.5 py-px rounded-full bg-amber-400/10 text-amber-400/90 ring-1 ring-inset ring-amber-400/20"
        >
          beta
        </span>
      </div>


      <div data-tauri-drag-region className="absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center">
        <button
          onClick={onOpenSearch}
          className="group flex items-center gap-2 h-7 w-[320px] max-w-[34vw] pl-2.5 pr-1.5 rounded-lg
                     bg-foreground/[0.04] ring-1 ring-inset ring-border text-muted-foreground
                     hover:bg-foreground/[0.07] hover:text-foreground transition-colors
                     [&:not(:disabled):active]:scale-100"
        >
          <Search size={13} className="shrink-0" />
          <span className="text-xs flex-1 text-left truncate">Search folders and commands…</span>
          <kbd className="text-[10px] font-sans px-1.5 py-0.5 rounded bg-foreground/[0.06] text-muted-foreground">
            {IS_MAC ? '⌘ K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full" />

      {!IS_MAC && <WindowControls />}
    </header>
  );
}
