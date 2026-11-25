import { useCallback, useEffect, useState } from 'react';

const EVENT = 'zftm-pref';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  useEffect(() => {
    const sync = (e: Event) => {
      if (e instanceof CustomEvent && e.detail !== key) return;
      setValue(read(key, fallback));
    };
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, [key]);
  const update = useCallback((next: T) => {
    localStorage.setItem(key, JSON.stringify(next));
    setValue(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  }, [key]);
  return [value, update];
}

export const PREF_WHOLE_FILE = 'zftm-whole-file';
