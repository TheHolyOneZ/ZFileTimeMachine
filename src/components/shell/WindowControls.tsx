import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function WindowControls() {
  const [win] = useState(() => getCurrentWindow());
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    const sync = () => { win.isMaximized().then(setMaximized).catch(() => {}); };
    sync();
    win.onResized(sync).then((fn) => { if (cancelled) fn(); else unlisten = fn; }).catch(() => {});
    return () => { cancelled = true; unlisten?.(); };
  }, [win]);

  const btn =
    'h-full w-[42px] flex items-center justify-center text-muted-foreground ' +
    'hover:text-foreground hover:bg-foreground/[0.07] active:bg-foreground/[0.11] ' +
    'focus-visible:outline-none focus-visible:bg-foreground/[0.09]';

  return (
    <div className="fixed top-2 right-2 z-50 h-8 flex rounded-tr-[calc(14px*var(--rs))] overflow-hidden">
      <button className={btn} onClick={() => void win.minimize()} aria-label="Minimize" data-tip="Minimize" data-tip-side="bottom">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M0.5 5h9" stroke="currentColor" /></svg>
      </button>
      <button
        className={btn}
        onClick={() => void win.toggleMaximize()}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        data-tip={maximized ? 'Restore' : 'Maximize'}
        data-tip-side="bottom"
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="2.5" width="7" height="7" rx="1.5" stroke="currentColor" />
            <path d="M2.5 2.5V2a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 9.5 2v4A1.5 1.5 0 0 1 8 7.5h-.5" stroke="currentColor" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <rect x="0.5" y="0.5" width="9" height="9" rx="2" stroke="currentColor" />
          </svg>
        )}
      </button>
      <button
        className={`${btn} hover:!bg-[#e5484d] hover:!text-white active:!bg-[#c93c40]`}
        onClick={() => void win.close()}
        aria-label="Close"
        data-tip="Close"
        data-tip-side="bottom"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
