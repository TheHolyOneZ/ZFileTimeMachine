import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad(n: number) { return String(n).padStart(2, '0'); }

function toLocalInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseValue(v: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function formatDisplay(d: Date) {
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function DateTimePicker({ value, onChange, placeholder = 'Pick a date & time…' }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);


  const parsed = parseValue(value);
  const [viewYear, setViewYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.getMonth() ?? new Date().getMonth());
  const [selDay, setSelDay] = useState<number | null>(() => parsed?.getDate() ?? null);
  const [selYear, setSelYear] = useState<number | null>(() => parsed?.getFullYear() ?? null);
  const [selMonth, setSelMonth] = useState<number | null>(() => parsed?.getMonth() ?? null);
  const [hour, setHour] = useState(() => parsed?.getHours() ?? 0);
  const [minute, setMinute] = useState(() => parsed?.getMinutes() ?? 0);


  function openPicker() {
    const d = parseValue(value) ?? new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelYear(parseValue(value)?.getFullYear() ?? null);
    setSelMonth(parseValue(value)?.getMonth() ?? null);
    setSelDay(parseValue(value)?.getDate() ?? null);
    setHour(parseValue(value)?.getHours() ?? 0);
    setMinute(parseValue(value)?.getMinutes() ?? 0);
    setOpen(true);
  }


  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);


  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
      if (e.key === 'Enter' && selDay !== null && selMonth !== null && selYear !== null) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);

  }, [open, selDay, selMonth, selYear, hour, minute]);

  function commit() {
    if (selDay === null || selMonth === null || selYear === null) return;
    const d = new Date(selYear, selMonth, selDay, hour, minute, 0, 0);
    onChange(toLocalInputValue(d));
    setOpen(false);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);


  const cells = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [viewYear, viewMonth, firstDay, daysInMonth]);

  const isSelectedDay = (d: number) =>
    d === selDay && viewMonth === selMonth && viewYear === selYear;

  const isToday = (d: number) => {
    const t = new Date();
    return d === t.getDate() && viewMonth === t.getMonth() && viewYear === t.getFullYear();
  };

  const displayValue = parsed ? formatDisplay(parsed) : null;
  const hasSelection = selDay !== null && selMonth !== null && selYear !== null;

  return (
    <div ref={containerRef} className="relative">

      <button
        onClick={() => open ? setOpen(false) : openPicker()}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left
                    bg-secondary/60 border transition-all
                    ${open
                      ? 'border-primary/40 ring-2 ring-primary/20'
                      : 'border-border/50 hover:border-border hover:bg-secondary/80'
                    }`}
      >
        <Calendar size={13} className={displayValue ? 'text-primary/60' : 'text-muted-foreground/60'} />
        <span className={`flex-1 text-[12px] truncate ${displayValue ? 'text-foreground/80' : 'text-muted-foreground/60'}`}>
          {displayValue ?? placeholder}
        </span>
        {displayValue && (
          <button
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="p-0.5 rounded hover:bg-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <X size={11} />
          </button>
        )}
      </button>


      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 w-72 rounded-2xl
                        bg-card border border-border/60 shadow-overlay
                        animate-fade-in overflow-hidden">


          <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-sm font-semibold text-foreground/90">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground/60 hover:text-foreground transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>


          <div className="grid grid-cols-7 px-3 pt-2.5 pb-1">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-medium text-muted-foreground/70 py-1">
                {d}
              </div>
            ))}
          </div>


          <div className="grid grid-cols-7 px-3 pb-2">
            {cells.map((day, i) => (
              <div key={i} className="flex items-center justify-center p-0.5">
                {day !== null ? (
                  <button
                    onClick={() => { setSelDay(day); setSelYear(viewYear); setSelMonth(viewMonth); }}
                    className={`w-8 h-8 rounded-xl text-[12px] font-medium transition-all
                                ${isSelectedDay(day)
                                  ? 'bg-primary text-primary-foreground shadow-button'
                                  : isToday(day)
                                    ? 'text-primary border border-primary/30 hover:bg-primary/15'
                                    : 'text-foreground/60 hover:bg-secondary hover:text-foreground'
                                }`}
                  >
                    {day}
                  </button>
                ) : null}
              </div>
            ))}
          </div>


          <div className="flex items-center gap-3 px-4 py-3 border-t border-border/30 bg-secondary/10">
            <Clock size={13} className="text-muted-foreground/70 shrink-0" />
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={0} max={23} value={pad(hour)}
                onChange={(e) => setHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-12 text-center px-1.5 py-1.5 rounded-lg bg-secondary/60 border border-border/50
                           text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <span className="text-muted-foreground/70 font-mono font-bold">:</span>
              <input
                type="number" min={0} max={59} value={pad(minute)}
                onChange={(e) => setMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                className="w-12 text-center px-1.5 py-1.5 rounded-lg bg-secondary/60 border border-border/50
                           text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </div>
            <span className="text-[10px] text-muted-foreground/60 ml-auto">HH : MM</span>
          </div>


          <div className="flex items-center gap-2 px-4 py-3 border-t border-border/30">
            {hasSelection && (
              <span className="text-[11px] text-muted-foreground/50 font-mono flex-1 truncate">
                {MONTHS[selMonth!].slice(0, 3)} {selDay}, {selYear} {pad(hour)}:{pad(minute)}
              </span>
            )}
            <div className="flex gap-2 ml-auto">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={commit}
                disabled={!hasSelection}
                className="px-3 py-1.5 rounded-lg text-xs font-medium
                           bg-primary text-primary-foreground shadow-button hover:bg-primary/90
                           disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
