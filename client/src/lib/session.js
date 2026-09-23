// The current result is kept in sessionStorage so an accidental reload or Back
// navigation does not force a re-crawl. sessionStorage is per tab and is cleared
// when the tab closes — nothing is persisted beyond the browsing session.
const KEY = 'okm:current-result';

export function saveSession(payload) {
  try {
    const text = JSON.stringify(payload);
    if (text.length < 4_500_000) sessionStorage.setItem(KEY, text);
  } catch {
    /* storage unavailable or full: ignore */
  }
}

export function loadSession() {
  try {
    const text = sessionStorage.getItem(KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
