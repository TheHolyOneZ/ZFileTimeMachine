import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { Popover } from './ui/Popover';
import { Button } from './ui/Button';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function DateTimePicker({ value, onChange, placeholder = 'Pick a date and time' }: Props) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const parsed = parseValue(value);
  const [view, setView] = useState(() => { const d = parsed ?? new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [sel, setSel] = useState<{ y: number; m: number; d: number } | null>(null);
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);

  function openPicker() {
    const p = parseValue(value);
    const base = p ?? new Date();
    setView({ y: base.getFullYear(), m: base.getMonth() });
    setSel(p ? { y: p.getFullYear(), m: p.getMonth(), d: p.getDate() } : null);
    setHour(p?.getHours() ?? new Date().getHours());
    setMinute(p?.getMinutes() ?? 0);
    setOpen(true);
  }

  function commit() {
    if (!sel) return;
    onChange(toLocalInputValue(new Date(sel.y, sel.m, sel.d, hour, minute, 0, 0)));
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setView(({ y, m }) => { const n = m + delta; return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 }; });
  }

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1).getDay();
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < first; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [view]);

  const today = new Date();
  const now = Date.now();

  return (
    <div ref={anchorRef}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => (open ? setOpen(false) : openPicker())}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } }}
        className={`field flex items-center gap-2.5 cursor-default ${open ? '!shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.6),0_0_0_3px_hsl(var(--primary)/0.18)]' : ''}`}
      >
        <Calendar size={14} className={parsed ? 'text-primary' : 'text-faint'} />
        <span className={`flex-1 text-sm truncate ${parsed ? 'text-foreground' : 'text-faint'}`}>
          {parsed ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : placeholder}
        </span>
        {parsed && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            aria-label="Clear the date"
            className="w-5 h-5 grid place-items-center rounded-full text-faint hover:text-foreground hover:bg-foreground/[0.08]"
          >
            <X size={11} />
          </button>
        )}
      </div>

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} width={292} estimatedHeight={380}>
        <div
          onKeyDown={(e) => { if (e.key === 'Enter' && sel) { e.preventDefault(); commit(); } }}
          className="select-none"
        >
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <button onClick={() => shiftMonth(-1)} aria-label="Previous month" className="press w-7 h-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07]">
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-semibold tabular-nums">{MONTHS[view.m]} {view.y}</span>
            <button onClick={() => shiftMonth(1)} aria-label="Next month" className="press w-7 h-7 grid place-items-center rounded-full text-muted-foreground hover:text-foreground hover:bg-foreground/[0.07]">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 px-3 pt-1">
            {DAYS.map((d) => <div key={d} className="text-center text-2xs text-faint py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 px-3 pb-2 gap-y-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const selected = sel?.y === view.y && sel.m === view.m && sel.d === day;
              const isToday = day === today.getDate() && view.m === today.getMonth() && view.y === today.getFullYear();
              const future = new Date(view.y, view.m, day).getTime() > now;
              return (
                <div key={i} className="grid place-items-center">
                  <button
                    onClick={() => setSel({ y: view.y, m: view.m, d: day })}
                    className={`press w-8 h-8 rounded-full text-xs tabular-nums transition-colors duration-150
                                ${selected ? 'bg-primary text-primary-foreground font-semibold'
                                  : isToday ? 'text-primary font-semibold hover:bg-primary/10'
                                  : future ? 'text-faint hover:bg-foreground/[0.06]'
                                  : 'text-foreground/85 hover:bg-foreground/[0.07]'}`}
                  >
                    {day}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-2 px-4 py-3 border-t border-[hsl(var(--line))]">
            <span className="text-xs text-muted-foreground">Time</span>
            <div className="flex items-center gap-1 ml-auto">
              <input
                type="number" min={0} max={23} value={pad(hour)} aria-label="Hour"
                onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                className="field !h-8 !w-12 !px-1 text-center font-mono tabular-nums"
              />
              <span className="text-faint font-mono">:</span>
              <input
                type="number" min={0} max={59} value={pad(minute)} aria-label="Minute"
                onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                className="field !h-8 !w-12 !px-1 text-center font-mono tabular-nums"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-4 pb-4">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={commit} disabled={!sel}>Use this time</Button>
          </div>
        </div>
      </Popover>
    </div>
  );
}
