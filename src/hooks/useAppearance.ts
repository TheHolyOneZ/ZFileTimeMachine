import { useEffect, useState } from 'react';
import { getAppearance, setAppearance, subscribeAppearance, type Appearance } from '@/lib/appearance';

export function useAppearance(): [Appearance, typeof setAppearance] {
  const [value, setValue] = useState(getAppearance);
  useEffect(() => subscribeAppearance(setValue), []);
  return [value, setAppearance];
}
