export const fmt = (n) => (n === null || n === undefined ? 'N/A' : new Intl.NumberFormat('en-US').format(n));

export const na = (v) => (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) ? 'N/A' : v);

export const yearRange = (min, max) => (min && max ? (min === max ? `${min}` : `${min} – ${max}`) : 'N/A');

export const pct = (v) => `${Math.round(v * 100)}%`;

export function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function pluralize(n, word, plural = `${word}s`) {
  return `${fmt(n)} ${n === 1 ? word : plural}`;
}
