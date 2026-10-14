import { createPortal } from 'react-dom';
import { useState } from 'react';
import { FolderOpen, X, Play, Info } from 'lucide-react';

interface Props {
  path: string;
  onConfirm: (ignoreGlobs: string[]) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

const PRESET_GROUPS = [
  { label: 'JS/TS',    patterns: ['node_modules/', '.next/', 'dist/', '.nuxt/'] },
  { label: 'Rust',     patterns: ['target/'] },
  { label: 'Python',   patterns: ['.venv/', '__pycache__/', '*.pyc', '.ruff_cache/'] },
  { label: 'Build',    patterns: ['build/', 'out/', '.cache/'] },
  { label: 'Git/VCS',  patterns: ['.git/', '.svn/'] },
];

export function AddFolderDialog({ path, onConfirm, onCancel, isLoading }: Props) {
  const folderName = path.split(/[\\/]/).filter(Boolean).pop() ?? path;

  const [patterns, setPatterns] = useState(
    ['node_modules/', 'target/', '.git/', '*.tmp', '*.log'].join('\n'),
  );

  function togglePreset(preset: string) {
    const lines = patterns.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.includes(preset)) {
      setPatterns(lines.filter((l) => l !== preset).join('\n'));
    } else {
      setPatterns([...lines, preset].join('\n'));
    }
  }

  function isActive(preset: string) {
    return patterns.split('\n').map((l) => l.trim()).includes(preset);
  }

  function handleConfirm() {
    const globs = patterns.split('\n').map((l) => l.trim()).filter(Boolean);
    onConfirm(globs);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]">
      <div className="relative w-full max-w-lg mx-4 bg-card border border-border rounded-2xl shadow-overlay animate-fade-in overflow-hidden">


        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
          <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
            <FolderOpen size={15} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{folderName}</h2>
            <p className="text-[11px] font-mono text-muted-foreground/50 truncate">{path}</p>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>


        <div className="px-5 py-4 space-y-4">

          <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl bg-primary/6 border border-primary/15">
            <Info size={13} className="text-primary/70 shrink-0 mt-0.5" />
            <p className="text-xs text-primary/80 leading-relaxed">
              The app will snapshot <strong>every file</strong> in this folder once on startup,
              then keep snapshots as files change. Files matching the patterns below are skipped.
            </p>
          </div>


          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              Quick add presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_GROUPS.map((group) => (
                <div key={group.label} className="contents">
                  {group.patterns.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePreset(p)}
                      className={`px-2 py-1 rounded-lg border text-[10px] font-mono transition-all
                                  ${isActive(p)
                                    ? 'bg-primary/15 border-primary/30 text-primary'
                                    : 'bg-secondary/30 border-border/40 text-muted-foreground/60 hover:border-border hover:text-foreground'
                                  }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>


          <div>
            <p className="text-[11px] font-medium text-muted-foreground mb-2">
              Ignore patterns <span className="normal-case font-normal">(one per line, gitignore syntax)</span>
            </p>
            <textarea
              value={patterns}
              onChange={(e) => setPatterns(e.target.value)}
              rows={6}
              placeholder="node_modules/&#10;target/&#10;.git/"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-secondary/30 border border-border/50
                         text-xs font-mono text-foreground/80 focus:outline-none focus:ring-2 focus:ring-ring
                         resize-none leading-relaxed placeholder:text-muted-foreground/50"
            />
            <p className="text-[10px] text-muted-foreground/70 mt-1">
              These become the folder's permanent watch rules — you can change them later in Folder Settings.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border/40 bg-secondary/10">
          <button
            onClick={() => { setPatterns(''); }}
            className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Clear all patterns
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-border/50 bg-secondary/30
                         text-sm text-foreground/70 hover:bg-secondary hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                         bg-primary text-primary-foreground shadow-button hover:bg-primary/90
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <Play size={13} />
              )}
              Start watching
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
