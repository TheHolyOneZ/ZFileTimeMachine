import { useState, useCallback } from 'react';

const KEY = 'zftm:onboarding:seen';

export function useOnboarding() {
  const [seen, setSeen] = useState(() => localStorage.getItem(KEY) === '1');

  const complete = useCallback(() => {
    localStorage.setItem(KEY, '1');
    setSeen(true);
  }, []);

  const resetGuide = useCallback(() => {
    localStorage.removeItem(KEY);
    setSeen(false);
  }, []);

  return { seen, complete, resetGuide };
}
