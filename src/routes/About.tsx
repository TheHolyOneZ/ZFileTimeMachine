import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { Github, Globe, ArrowUpRight, Bug } from 'lucide-react';
import logoUrl from '@/assets/logo.png';
import { gsap, dur } from '@/lib/motion';

function openUrl(url: string) {
  void invoke('open_path', { path: url });
}

function LinkRow({ icon, label, sub, url }: { icon: React.ReactNode; label: string; sub: string; url: string }) {
  return (
    <button onClick={() => openUrl(url)} className="group w-full flex items-center gap-3.5 px-4 h-14 text-left hover:bg-foreground/[0.035]">
      <span className="w-8 h-8 rounded-[calc(9px*var(--rs))] bg-foreground/[0.055] text-muted-foreground grid place-items-center shrink-0 group-hover:text-foreground transition-colors">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-faint truncate">{sub}</span>
      </span>
      <ArrowUpRight size={15} className="text-faint group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-[color,transform] duration-300 ease-zftm shrink-0" />
    </button>
  );
}

const STACK = ['Rust', 'Tauri 2', 'React 18', 'TypeScript', 'SQLite', 'zstd', 'GSAP'];

export function About() {
  const [version, setVersion] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const tl = gsap.timeline({ defaults: { ease: 'zftm' } });
    tl.fromTo(el.querySelector('[data-logo]'), { autoAlpha: 0, scale: 0.8, y: 8 }, { autoAlpha: 1, scale: 1, y: 0, duration: dur(0.8) })
      .fromTo(el.querySelectorAll('[data-reveal]'), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: dur(0.6), stagger: 0.06 }, '-=0.55');
    return () => { tl.kill(); };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div data-tauri-drag-region className="h-12 shrink-0" />
      <div ref={rootRef} className="flex-1 overflow-y-auto scroll-fade-y">
        <div className="max-w-[520px] mx-auto px-6 pt-6 pb-14">
          <div className="flex flex-col items-center text-center">
            <div data-logo className="relative">
              <div className="absolute inset-0 rounded-[calc(26px*var(--rs))] bg-primary/30 blur-3xl" aria-hidden />
              <img src={logoUrl} alt="" draggable={false} className="relative w-24 h-24 drop-shadow-[0_14px_22px_hsl(var(--shadow)/0.45)]" />
            </div>
            <h1 data-reveal className="text-3xl font-semibold tracking-tight mt-7">ZFileTimeMachine</h1>
            <p data-reveal className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
              {version && <span className="tabular-nums">Version {version}</span>}
              <span className="h-5 px-1.5 rounded-[calc(5px*var(--rs))] grid place-items-center text-2xs font-medium bg-foreground/[0.07] text-muted-foreground">Beta</span>
            </p>
            <p data-reveal className="text-base text-foreground/85 leading-relaxed mt-6 text-pretty">
              An undo button for your files. Point it at a folder and each file in it is kept every time it changes,
              so you can bring back any earlier version. Everything stays on your computer. No git, no cloud, nothing to remember.
            </p>
          </div>

          <div data-reveal className="mt-9 flex flex-wrap justify-center gap-1.5">
            {STACK.map((s) => (
              <span key={s} className="h-7 px-2.5 rounded-full grid place-items-center text-xs text-muted-foreground bg-foreground/[0.045] shadow-[inset_0_0_0_1px_hsl(var(--line))]">{s}</span>
            ))}
          </div>

          <section data-reveal className="mt-9">
            <h2 className="text-sm font-semibold px-1 mb-2">Made by TheHolyOneZ</h2>
            <div className="rounded-xl bg-card shadow-card divide-y divide-[hsl(var(--line))] overflow-hidden">
              <LinkRow icon={<Github size={16} />} label="TheHolyOneZ on GitHub" sub="github.com/TheHolyOneZ" url="https://github.com/TheHolyOneZ" />
              <LinkRow icon={<Globe size={16} />} label="zsync.eu" sub="More tools and projects" url="https://zsync.eu" />
            </div>
            <p className="text-xs text-faint mt-2 px-1">Lightweight, local-first tools that respect your privacy and your time.</p>
          </section>

          <section data-reveal className="mt-7">
            <h2 className="text-sm font-semibold px-1 mb-2">This project</h2>
            <div className="rounded-xl bg-card shadow-card divide-y divide-[hsl(var(--line))] overflow-hidden">
              <LinkRow icon={<Github size={16} />} label="Source code" sub="github.com/TheHolyOneZ/ZFileTimeMachine" url="https://github.com/TheHolyOneZ/ZFileTimeMachine" />
              <LinkRow icon={<Bug size={16} />} label="Report a problem" sub="Open an issue on GitHub" url="https://github.com/TheHolyOneZ/ZFileTimeMachine/issues" />
              <LinkRow icon={<Globe size={16} />} label="Project page" sub="zsync.eu/zftm" url="https://zsync.eu/zftm" />
            </div>
          </section>

          <p data-reveal className="text-xs text-faint text-center mt-10">Free and open source under the GPL-3.0. Copyright © 2026 TheHolyOneZ.</p>
        </div>
      </div>
    </div>
  );
}
