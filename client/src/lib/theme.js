import { useSyncExternalStore } from 'react';

// Theme preference: 'system' | 'light' | 'dark'. A per-viewer convenience kept in
// localStorage; the page renders correctly without it (falls back to the OS setting).
const KEY = 'okm-theme';
const listeners = new Set();
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function readMode() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

let mode = readMode();
const resolve = () => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode);
let snapshot = { mode, resolved: resolve() };

function publish() {
  snapshot = { mode, resolved: resolve() };
  if (mode === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', mode);
  listeners.forEach((l) => l());
}

media?.addEventListener('change', publish);

export function setThemeMode(next) {
  mode = next;
  try {
    if (next === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: preference lasts for this page only */
  }
  publish();
}

export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}
