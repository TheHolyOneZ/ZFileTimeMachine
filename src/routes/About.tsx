import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import logoUrl from '@/assets/logo.png';
import { Github, Globe, ArrowUpRight } from 'lucide-react';

function openUrl(url: string) {
  void invoke('open_path', { path: url });
}

function LinkRow({
  icon,
  label,
  sub,
  url,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  url: string;
}) {
  return (
    <button
      onClick={() => openUrl(url)}
      className="group flex items-center gap-3 w-full px-3 py-2.5 -mx-3 rounded-lg text-left
                 hover:bg-secondary/60 transition-colors"
    >
      <span className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground font-mono truncate">{sub}</span>
      </span>
      <ArrowUpRight size={14} className="text-muted-foreground/60 group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}

const STACK = ['Rust', 'Tauri 2', 'React 18', 'TypeScript', 'SQLite', 'zstd'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="py-5 border-t border-border/60">
      <h2 className="text-xs font-medium text-muted-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function About() {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-lg mx-auto px-6 py-12 animate-fade-in">

        <div className="flex items-center gap-4 mb-6">
          <img src={logoUrl} alt="" className="w-14 h-14 rounded-xl object-cover" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ZFileTimeMachine</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {version ? `Version ${version} ` : ''}<span className="text-amber-400">beta</span> · GPL-3.0 · Free and open source
            </p>
          </div>
        </div>

        <p className="text-[15px] text-foreground/85 leading-relaxed pb-6 text-pretty">
          An undo button for your filesystem. Point it at a folder and every file in it is
          snapshotted each time it changes, so you can rewind any file to an earlier version.
          Everything stays on your machine — no git, no cloud, nothing to remember.
        </p>

        <Section title="Built with">
          <p className="text-sm text-foreground/85">{STACK.join(' · ')}</p>
        </Section>

        <Section title="Made by TheHolyOneZ">
          <p className="text-sm text-muted-foreground mb-3">
            Lightweight, local-first tools that respect your privacy and your time.
          </p>
          <LinkRow icon={<Github size={16} />} label="TheHolyOneZ" sub="github.com/TheHolyOneZ" url="https://github.com/TheHolyOneZ" />
          <LinkRow icon={<Globe size={16} />} label="zsync.eu" sub="More tools and projects" url="https://zsync.eu" />
        </Section>

        <Section title="Project">
          <LinkRow
            icon={<Github size={16} />}
            label="Source code and issue tracker"
            sub="github.com/TheHolyOneZ/ZFileTimeMachine"
            url="https://github.com/TheHolyOneZ/ZFileTimeMachine"
          />
          <LinkRow icon={<Globe size={16} />} label="Project page" sub="zsync.eu/zftm" url="https://zsync.eu/zftm" />
        </Section>

        <p className="text-xs text-muted-foreground/70 pt-5 border-t border-border/60">
          GPL-3.0 · Copyright © 2026 TheHolyOneZ
        </p>
      </div>
    </div>
  );
}
