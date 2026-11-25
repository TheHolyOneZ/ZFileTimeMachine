import { useLayoutEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from './ui/Button';
import { gsap, dur } from '@/lib/motion';

interface Props {
  globs: string[];
  onChange: (globs: string[]) => void;
}

export function IgnoreRulesEditor({ globs, onChange }: Props) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const prev = useRef(globs.length);

  useLayoutEffect(() => {
    if (globs.length > prev.current && listRef.current?.lastElementChild) {
      gsap.fromTo(listRef.current.lastElementChild, { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: dur(0.35), ease: 'zftm' });
    }
    prev.current = globs.length;
  }, [globs.length]);

  function add() {
    const val = input.trim();
    if (val && !globs.includes(val)) onChange([...globs, val]);
    setInput('');
  }

  return (
    <div className="space-y-3">
      {globs.length > 0 ? (
        <div ref={listRef} className="flex flex-wrap gap-1.5">
          {globs.map((g) => (
            <span key={g} className="group inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full text-xs font-mono bg-foreground/[0.06] shadow-[inset_0_0_0_1px_hsl(var(--line))]">
              {g}
              <button
                onClick={() => onChange(globs.filter((x) => x !== g))}
                aria-label={`Remove ${g}`}
                className="w-5 h-5 grid place-items-center rounded-full text-faint hover:text-foreground hover:bg-foreground/[0.1]"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No rules yet, so every file is kept.</p>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="node_modules/ or *.tmp"
          spellCheck={false}
          aria-label="New rule"
          className="field font-mono text-xs"
        />
        <Button icon={<Plus size={14} />} onClick={add} disabled={!input.trim()}>Add</Button>
      </div>
      <div className="text-xs text-faint leading-relaxed space-y-1">
        <p>
          End a rule with <code className="font-mono text-muted-foreground">/</code> to skip a folder and everything in it, at any depth, like <code className="font-mono text-muted-foreground">Cache/</code>.
          Start one with <code className="font-mono text-muted-foreground">!</code> to bring a file back, like <code className="font-mono text-muted-foreground">!important.log</code>.
        </p>
        <p>ZFileTimeMachine's own data folder is always skipped, so it needs no rule.</p>
      </div>
    </div>
  );
}
