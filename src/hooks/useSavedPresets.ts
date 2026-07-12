import { useEffect, useMemo, useState } from 'react';

export function useSavedPresets(key: string, defaults: string[]) {
  const defaultKey = defaults.join('\u0000');
  const stableDefaults = useMemo(() => defaults, [defaultKey]);
  const [presets, setPresets] = useState<string[]>(defaults);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        setPresets(Array.from(new Set([...parsed, ...stableDefaults])).filter(Boolean));
      }
    } catch (error) {
      console.warn('Failed to load presets:', error);
    }
  }, [key, stableDefaults]);

  const savePreset = (value: string) => {
    const nextValue = value.trim();
    if (!nextValue) return;

    setPresets((current) => {
      const next = [nextValue, ...current.filter((item) => item !== nextValue)].slice(
        0,
        24
      );
      window.localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  const deletePreset = (value: string) => {
    setPresets((current) => {
      const next = current.filter((item) => item !== value);
      window.localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  };

  return { presets, savePreset, deletePreset };
}
