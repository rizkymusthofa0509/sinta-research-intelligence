import { crawlerConfig } from '../config/crawler.js';
import { createLogger } from './logger.js';
import { hostRateLimiter } from './rateLimiter.js';

const log = createLogger('robots');
const cache = new Map(); // origin -> { rules, fetchedAt }
const TTL_MS = 60 * 60 * 1000;

/** Parse the groups that apply to "*" (we do not claim a named user agent). */
export function parseRobots(text) {
  const rules = { allow: [], disallow: [], crawlDelay: null };
  let applies = false;
  let sawRuleInGroup = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (sawRuleInGroup) {
        applies = false;
        sawRuleInGroup = false;
      }
      if (value === '*') applies = true;
      continue;
    }
    sawRuleInGroup = true;
    if (!applies) continue;
    if (field === 'disallow' && value) rules.disallow.push(value);
    else if (field === 'allow' && value) rules.allow.push(value);
    else if (field === 'crawl-delay') rules.crawlDelay = Number(value) || null;
  }
  return rules;
}

function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + (escaped.endsWith('\\$') ? escaped.slice(0, -2) + '$' : escaped));
}

export function isPathAllowed(rules, pathWithQuery) {
  // Longest matching rule wins (Google semantics); allow wins ties.
  let best = { length: -1, allow: true };
  for (const p of rules.disallow) {
    if (patternToRegex(p).test(pathWithQuery) && p.length > best.length) best = { length: p.length, allow: false };
  }
  for (const p of rules.allow) {
    if (patternToRegex(p).test(pathWithQuery) && p.length >= best.length) best = { length: p.length, allow: true };
  }
  return best.allow;
}

async function loadRules(origin) {
  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.rules;

  let rules = { allow: [], disallow: [], crawlDelay: null };
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'user-agent': crawlerConfig.userAgent },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });
    const type = res.headers.get('content-type') || '';
    // Many OJS / government servers answer robots.txt with an HTML page or a 403.
    // Only a real text file counts as robots rules.
    if (res.ok && !type.includes('html')) {
      rules = parseRobots(await res.text());
    }
  } catch (err) {
    log.debug(`robots.txt unavailable for ${origin}: ${err.message}`);
  }
  cache.set(origin, { rules, fetchedAt: Date.now() });
  if (rules.crawlDelay) hostRateLimiter.setCrawlDelay(new URL(origin).hostname, rules.crawlDelay);
  return rules;
}

/** Resolve to true when robots.txt of the URL's origin allows crawling it. */
export async function isAllowedByRobots(url) {
  const u = new URL(url);
  const rules = await loadRules(u.origin);
  return isPathAllowed(rules, u.pathname + u.search);
}
