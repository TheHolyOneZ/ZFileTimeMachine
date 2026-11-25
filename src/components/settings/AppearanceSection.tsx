import { Check, Moon, Sun, MonitorSmartphone, RotateCcw } from 'lucide-react';
import { Group, Row } from './Group';
import { Segmented } from '../ui/Segmented';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';
import { ColorWell } from '../ui/ColorWell';
import { useAppearance } from '@/hooks/useAppearance';
import { usePref, PREF_WHOLE_FILE } from '@/lib/prefs';
import { ACCENTS, PALETTES, RADII, DEFAULT_APPEARANCE, accentCss, previewColors, resolveMode, type FolderIconColors, type Mode, type Theme } from '@/lib/appearance';

function MiniWindow({ palette, theme, accent, radius }: { palette: string; theme: Theme; accent: string; radius: number }) {
  const c = previewColors(palette, theme);
  const r = (n: number) => `${n * radius}px`;
  return (
    <div className="h-full w-full flex overflow-hidden" style={{ background: c.canvas, borderRadius: r(7) }}>
      <div className="w-[28%] p-1.5 space-y-1">
        <div className="h-1.5 w-full" style={{ background: accent, opacity: 0.55, borderRadius: r(2) }} />
        <div className="h-1.5 w-3/4" style={{ background: c.faint, opacity: 0.35, borderRadius: r(2) }} />
        <div className="h-1.5 w-2/3" style={{ background: c.faint, opacity: 0.35, borderRadius: r(2) }} />
      </div>
      <div className="flex-1 my-1 mr-1 p-1.5 space-y-1.5" style={{ background: c.surface, borderRadius: r(5), boxShadow: `0 0 0 1px ${c.line}` }}>
        <div className="h-1.5 w-1/2" style={{ background: c.text, opacity: 0.7, borderRadius: r(2) }} />
        <div className="h-4 w-full" style={{ background: c.card, boxShadow: `0 0 0 1px ${c.line}`, borderRadius: r(3) }} />
        <div className="h-1.5 w-1/3" style={{ background: accent, borderRadius: r(2) }} />
      </div>
    </div>
  );
}

function ModeCard({ mode, active, onPick, palette, accent, radius }: { mode: Mode; active: boolean; onPick: (e: React.MouseEvent) => void; palette: string; accent: string; radius: number }) {
  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : MonitorSmartphone;
  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'Match system';
  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      className={`press group text-left rounded-xl p-2 transition-shadow duration-300
                  ${active ? 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]' : 'shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]'}`}
    >
      <div className="h-[72px] relative">
        {mode === 'system' ? (
          <div className="absolute inset-0 flex overflow-hidden rounded-[calc(7px*var(--rs))]">
            <div className="w-1/2 overflow-hidden"><div className="w-[200%] h-full"><MiniWindow palette={palette} theme="dark" accent={accentCss(accent, 'dark')} radius={radius} /></div></div>
            <div className="w-1/2 overflow-hidden relative"><div className="w-[200%] h-full -ml-[100%]"><MiniWindow palette={palette} theme="light" accent={accentCss(accent, 'light')} radius={radius} /></div></div>
          </div>
        ) : (
          <MiniWindow palette={palette} theme={mode} accent={accentCss(accent, mode)} radius={radius} />
        )}
      </div>
      <div className="flex items-center gap-2 px-1 pt-2.5 pb-0.5">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
        {active && <Check size={14} className="ml-auto text-primary" />}
      </div>
    </button>
  );
}

export function AppearanceSection() {
  const [a, set] = useAppearance();
  const [whole, setWhole] = usePref(PREF_WHOLE_FILE, false);
  const theme = resolveMode(a.mode);
  const custom = a.accent.startsWith('#');
  const at = (e: React.MouseEvent) => ({ x: e.clientX, y: e.clientY });

  return (
    <>
      <Group title="Mode">
        <div className="p-3 grid grid-cols-3 gap-3">
          {(['dark', 'light', 'system'] as Mode[]).map((m) => (
            <ModeCard key={m} mode={m} active={a.mode === m} onPick={(e) => a.mode !== m && set({ mode: m }, at(e))} palette={a.palette} accent={a.accent} radius={a.radius} />
          ))}
        </div>
      </Group>

      <Group title="Theme" description="Each theme tints the surfaces in both dark and light mode.">
        <div className="p-3 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3">
          {PALETTES.map((p) => {
            const on = a.palette === p.id;
            return (
              <button
                key={p.id}
                onClick={() => set({ palette: p.id })}
                aria-pressed={on}
                className={`press text-left rounded-xl p-1.5 transition-shadow duration-300
                            ${on ? 'shadow-[inset_0_0_0_2px_hsl(var(--primary))]' : 'shadow-[inset_0_0_0_1px_hsl(var(--line))] hover:shadow-[inset_0_0_0_1px_hsl(var(--line-strong))]'}`}
              >
                <div className="h-14"><MiniWindow palette={p.id} theme={theme} accent={accentCss(a.accent, theme)} radius={a.radius} /></div>
                <div className="flex items-center px-1 pt-2 pb-0.5">
                  <span className="text-sm">{p.label}</span>
                  {on && <Check size={13} className="ml-auto text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
      </Group>

      <Group title="Accent color" description="Used for selections, buttons and highlights.">
        <div className="px-4 py-4 flex flex-wrap items-center gap-2.5">
          {ACCENTS.map((c) => {
            const on = a.accent === c.id;
            return (
              <button
                key={c.id}
                onClick={() => set({ accent: c.id })}
                aria-label={c.label}
                aria-pressed={on}
                data-tip={c.label}
                className={`press w-7 h-7 rounded-full grid place-items-center transition-[transform,box-shadow] duration-300 ease-zftm
                            ${on ? 'shadow-[0_0_0_2px_hsl(var(--card)),0_0_0_4px_hsl(var(--foreground)/0.7)]' : 'hover:scale-110'}`}
                style={{ background: accentCss(c.id, theme) }}
              >
                {on && <Check size={13} strokeWidth={3} className="text-primary-foreground" />}
              </button>
            );
          })}
          <span className="w-px h-6 bg-[hsl(var(--line-strong))] mx-1" />
          <ColorWell value={custom ? a.accent : null} fallback="#4f8ff7" onChange={(accent) => set({ accent })} />
        </div>
      </Group>

      <Group title="Folder icons">
        <Row
          label="Color of folder icons"
          description="Use the accent color for every folder, or the color picked in each folder's own settings."
        >
          <Segmented<FolderIconColors>
            value={a.folderIcons}
            onChange={(folderIcons) => set({ folderIcons })}
            ariaLabel="Color of folder icons"
            options={[{ value: 'own', label: 'Each its own' }, { value: 'accent', label: 'Accent color' }]}
          />
        </Row>
      </Group>

      <Group title="Corners" description="How round buttons, cards, menus and dialogs are.">
        <div className="px-4 py-4 flex items-center gap-5">
          <Segmented<string>
            value={String(a.radius)}
            onChange={(v) => set({ radius: Number(v) })}
            ariaLabel="Corners"
            options={RADII.map((r) => ({ value: String(r.value), label: r.label }))}
          />
          <div className="flex items-center gap-2" aria-hidden>
            <span className="h-8 px-3 grid place-items-center text-xs font-medium bg-primary text-primary-foreground rounded-[calc(9px*var(--rs))] transition-[border-radius] duration-300">Button</span>
            <span className="w-14 h-8 bg-foreground/[0.07] shadow-[inset_0_0_0_1px_hsl(var(--line-strong))] rounded-[calc(12px*var(--rs))] transition-[border-radius] duration-300" />
          </div>
        </div>
      </Group>

      <Group title="Comparisons">
        <Row
          label="Always show the whole file"
          description="Show every line of a version, also when nothing changed, instead of only the changes. You can also switch this next to each comparison."
          htmlFor="whole"
        >
          <Switch id="whole" checked={whole} onChange={setWhole} label="Always show the whole file" />
        </Row>
      </Group>

      <div data-group className="flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw size={13} />}
          onClick={(e) => set({ ...DEFAULT_APPEARANCE, mode: a.mode }, at(e))}
          disabled={a.palette === DEFAULT_APPEARANCE.palette && a.accent === DEFAULT_APPEARANCE.accent && a.radius === DEFAULT_APPEARANCE.radius && a.folderIcons === DEFAULT_APPEARANCE.folderIcons}
        >
          Reset theme, colors and corners
        </Button>
      </div>
    </>
  );
}
