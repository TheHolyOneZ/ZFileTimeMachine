import { format, isToday, isYesterday } from 'date-fns';

export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24 && isToday(new Date(ts))) return `${h} h ago`;
  if (isYesterday(new Date(ts))) return `yesterday ${format(new Date(ts), 'HH:mm')}`;
  const d = new Date(ts);
  return format(d, d.getFullYear() === new Date(now).getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

export function agoShort(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} d`;
  return format(new Date(ts), 'MMM d');
}
