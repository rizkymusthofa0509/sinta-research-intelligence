import net from 'node:net';
import { trustedSourceHosts } from '../config/crawler.js';

const PRIVATE_HOST_PATTERNS = [/^localhost$/i, /\.local$/i, /\.internal$/i, /^metadata\./i];

function isPrivateIp(host) {
  const type = net.isIP(host);
  if (type === 4) {
    const [a, b] = host.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (type === 6) {
    const h = host.toLowerCase();
    return h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80');
  }
  return false;
}

/** Parse and normalise a URL; returns null when it is not a usable http(s) URL. */
export function toHttpUrl(value, base) {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '#' || trimmed.startsWith('#') || /^javascript:/i.test(trimmed)) {
    return null;
  }
  try {
    const url = new URL(trimmed, base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** True when the URL points to a public host we may crawl (no private/loopback targets). */
export function isPublicHttpUrl(value) {
  const normalized = toHttpUrl(value);
  if (!normalized) return false;
  const { hostname } = new URL(normalized);
  const host = hostname.replace(/^\[|\]$/g, '');
  if (PRIVATE_HOST_PATTERNS.some((re) => re.test(host))) return false;
  if (isPrivateIp(host)) return false;
  return true;
}

export function isTrustedSourceUrl(value) {
  const normalized = toHttpUrl(value);
  if (!normalized) return false;
  const { hostname } = new URL(normalized);
  return trustedSourceHosts.includes(hostname.toLowerCase());
}

export function hostOf(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Turn a raw DOI (or doi.org URL) into a canonical https://doi.org/... link. */
export function doiToUrl(doi) {
  if (!doi) return null;
  const match = String(doi).match(/10\.\d{4,9}\/[^\s"<>]+/);
  if (!match) return null;
  const clean = match[0].replace(/[.,;)\]]+$/, '');
  return `https://doi.org/${clean}`;
}

export function extractDoi(value) {
  if (!value) return null;
  const match = String(value).match(/10\.\d{4,9}\/[^\s"<>]+/);
  return match ? match[0].replace(/[.,;)\]]+$/, '') : null;
}
