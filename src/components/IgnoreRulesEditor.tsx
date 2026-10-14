import { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface Props {
  globs: string[];
  onChange: (globs: string[]) => void;
}

export function IgnoreRulesEditor({ globs, onChange }: Props) {
  const [input, setInput] = useState('');

  function add() {
    const val = input.trim();
    if (val && !globs.includes(val)) {
      onChange([...globs, val]);
    }
    setInput('');
  }

  function remove(glob: string) {
    onChange(globs.filter((g) => g !== glob));
  }

  return (
    <div className="space-y-3">
      {globs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {globs.map((g) => (
            <span
              key={g}
              className="group flex items-center gap-1 text-xs font-mono bg-secondary/60 border border-border
                         text-foreground/80 px-2 py-1 rounded-md hover:border-border/80 transition-colors"
            >
              {g}
              <button
                onClick={() => remove(g)}
                className="text-muted-foreground/70 hover:text-destructive transition-colors ml-0.5"
                title={`Remove ${g}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/50 italic">No ignore rules. All files are tracked.</p>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="e.g. node_modules/ or *.tmp"
          className="flex-1 bg-secondary/60 border border-border rounded-lg px-3 py-1.5 text-sm font-mono
                     focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary/50
                     placeholder:text-muted-foreground/70 transition-colors"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-secondary border border-border
                     hover:bg-secondary/80 hover:border-border/80 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus size={13} />
          Add
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/70 mt-1.5">
        Prefix with <code className="font-mono bg-secondary/40 px-1 rounded">!</code> to un-ignore a pattern (e.g. <code className="font-mono bg-secondary/40 px-1 rounded">!important.log</code>)
      </p>
    </div>
  );
}
