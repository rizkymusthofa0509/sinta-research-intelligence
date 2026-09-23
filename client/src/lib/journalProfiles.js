import { useEffect, useSyncExternalStore } from 'react';

// On-demand Garuda journal profiles (website, SINTA link) kept in memory for this tab only.
const profiles = new Map(); // url -> { status: 'loading'|'done'|'error', data }
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

export function loadJournalProfile(url) {
  if (!url || profiles.has(url)) return;
  profiles.set(url, { status: 'loading' });
  emit();
  fetch(`/api/journal-profile?url=${encodeURIComponent(url)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
    .then((data) => profiles.set(url, { status: 'done', data }))
    .catch(() => profiles.set(url, { status: 'error' }))
    .finally(emit);
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * Journal links for a record, filling missing website/SINTA URL from the Garuda
 * profile. `auto` fetches immediately when something is missing.
 */
export function useJournalLinks(record, { auto = false } = {}) {
  const url = record?.garudaJournalUrl || null;
  const entry = useSyncExternalStore(subscribe, () => (url ? profiles.get(url) : undefined));
  const missing = Boolean(url) && (!record.journalUrl || !record.sintaUrl);
  useEffect(() => {
    if (auto && missing) loadJournalProfile(url);
  }, [auto, missing, url]);
  return {
    journalUrl: record?.journalUrl || entry?.data?.journalUrl || null,
    sintaUrl: record?.sintaUrl || entry?.data?.sintaUrl || null,
    status: entry?.status || (missing ? 'idle' : 'done'),
    canLoad: missing && !entry,
    load: () => loadJournalProfile(url),
  };
}
