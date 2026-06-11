import { invoke } from '@tauri-apps/api/core';
import logoUrl from '@/assets/logo.png';
import {
  Github, Globe, Shield, Layers, Code2, Heart,
} from 'lucide-react';

function openUrl(url: string) {
  void invoke('open_path', { path: url });
}

function LinkBtn({
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
      className="flex items-center gap-3.5 p-4 rounded-xl border border-border/40 bg-card/50
                 hover:bg-card/90 hover:border-border/70 transition-all text-left group w-full"
    >
      <div className="w-9 h-9 rounded-lg bg-secondary/70 border border-border/50 flex items-center justify-center shrink-0 text-muted-foreground/60 group-hover:text-foreground transition-colors">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground/80 group-hover:text-foreground transition-colors">{label}</p>
        <p className="text-[11px] text-muted-foreground/45 font-mono truncate mt-0.5">{sub}</p>
      </div>
      <Globe size={12} className="text-muted-foreground/20 group-hover:text-primary/50 transition-colors shrink-0" />
    </button>
  );
}

const STACK = [
  { label: 'Rust',       color: 'bg-orange-500/15 text-orange-400 border-orange-500/20' },
  { label: 'Tauri 2',    color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20'       },
  { label: 'React 18',   color: 'bg-sky-500/15 text-sky-400 border-sky-500/20'          },
  { label: 'TypeScript', color: 'bg-blue-500/15 text-blue-400 border-blue-500/20'       },
  { label: 'SQLite',     color: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20' },
  { label: 'Vite',       color: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
  { label: 'zstd',       color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
];

export function About() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-xl mx-auto px-6 py-10 space-y-6 animate-fade-in">


        <div className="flex flex-col items-center text-center gap-4 py-6">

          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 rounded-2xl blur-2xl scale-150" />
            <img
              src={logoUrl}
              alt="ZFileTimeMachine"
              className="relative w-20 h-20 rounded-2xl object-cover shadow-lg"
            />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">ZFileTimeMachine</h1>
            <p className="text-sm text-muted-foreground/60 mt-1 italic">
              "An undo button for your filesystem."
            </p>
          </div>


          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-secondary/40 text-muted-foreground/60">
              <Shield size={10} />GPL-3.0
            </span>
            <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-secondary/40 text-muted-foreground/60">
              <Layers size={10} />v0.1.0
            </span>
            <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-400/80 font-semibold">
              BETA
            </span>
            <span className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-primary/30 bg-primary/8 text-primary/70">
              <Heart size={10} />Free & Open Source
            </span>
          </div>
        </div>


        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <p className="text-sm text-muted-foreground/80 leading-relaxed">
            A local-first, private file version history tool for your desktop. Watches any folder
            and automatically snapshots every file as it changes — so you can rewind any file to any
            moment, instantly, without git, without the cloud, and without thinking about it.
          </p>
        </div>


        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Code2 size={12} className="text-primary/70" />
            </div>
            <h2 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Tech Stack</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {STACK.map((t) => (
              <span key={t.label} className={`text-xs px-2.5 py-1 rounded-lg border font-medium ${t.color}`}>
                {t.label}
              </span>
            ))}
          </div>
        </div>


        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <Heart size={12} className="text-violet-400/70" />
            </div>
            <h2 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Made by</h2>
          </div>

          <div className="flex items-center gap-4 mb-5">

            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/30 via-primary/20 to-cyan-500/20 border border-violet-500/20 flex items-center justify-center">
                <span className="text-xl font-bold text-violet-300/90">Z</span>
              </div>
              <div className="absolute inset-0 rounded-2xl bg-violet-500/10 blur-lg scale-110 pointer-events-none" />
            </div>
            <div>
              <p className="font-semibold text-foreground">TheHolyOneZ</p>
              <p className="text-xs text-muted-foreground/50 mt-0.5 leading-relaxed">
                Building lightweight, local-first tools<br />that respect your privacy and your time.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <LinkBtn
              icon={<Github size={16} />}
              label="TheHolyOneZ"
              sub="github.com/TheHolyOneZ"
              url="https://github.com/TheHolyOneZ"
            />
            <LinkBtn
              icon={<Globe size={16} />}
              label="zsync.eu"
              sub="More tools &amp; projects"
              url="https://zsync.eu"
            />
          </div>
        </div>


        <div className="rounded-xl border border-border/40 bg-card/50 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Globe size={12} className="text-primary/70" />
            </div>
            <h2 className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Project</h2>
          </div>
          <div className="space-y-2">
            <LinkBtn
              icon={<Github size={16} />}
              label="ZFileTimeMachine"
              sub="github.com/TheHolyOneZ/ZFileTimeMachine"
              url="https://github.com/TheHolyOneZ/ZFileTimeMachine"
            />
            <LinkBtn
              icon={<Globe size={16} />}
              label="Project page"
              sub="zsync.eu/zftm"
              url="https://zsync.eu/zftm"
            />
          </div>
        </div>


        <p className="text-center text-[11px] text-muted-foreground/25 pb-4">
          GPL-3.0 · Copyright © 2026 TheHolyOneZ
        </p>

      </div>
    </div>
  );
}
