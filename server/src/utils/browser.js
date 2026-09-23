import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import puppeteer from 'puppeteer';
import { crawlerConfig } from '../config/crawler.js';
import { Semaphore, sleep, throwIfAborted } from './concurrency.js';
import { createLogger } from './logger.js';
import { hostRateLimiter } from './rateLimiter.js';
import { isAllowedByRobots } from './robots.js';
import { hostOf, isPublicHttpUrl } from './urlValidator.js';

const log = createLogger('browser');
const IDLE_CLOSE_MS = 5 * 60 * 1000;

let browserPromise = null;
let idleTimer = null;
let activePages = 0;
const pageSlots = new Semaphore(crawlerConfig.maxOpenPages);

// Hosts that refused us (403 / challenge). We stop asking for a while instead of retrying.
const refusals = new Map(); // host -> { count, until }

export function hostStatus(host) {
  const r = refusals.get(host);
  return { blocked: Boolean(r && r.until > Date.now()), refusals: r?.count ?? 0 };
}

function noteRefusal(host) {
  const r = refusals.get(host) || { count: 0, until: 0 };
  r.count += 1;
  if (r.count >= crawlerConfig.blockedHostThreshold) {
    r.until = Date.now() + crawlerConfig.blockedHostCooldownMs;
    log.warn(`${host} refused ${r.count} requests; pausing it for ${crawlerConfig.blockedHostCooldownMs / 60000} min`);
  }
  refusals.set(host, r);
}

export class CrawlError extends Error {
  constructor(message, { code = 'CRAWL_ERROR', status = null, url = null, retryable = false } = {}) {
    super(message);
    this.name = 'CrawlError';
    this.code = code;
    this.status = status;
    this.url = url;
    this.retryable = retryable;
  }
}

/** One shared Chromium for the whole process; relaunched if it crashes. */
export async function getBrowser() {
  if (!browserPromise) {
    log.info('Launching headless Chromium');
    browserPromise = puppeteer
      .launch({
        headless: crawlerConfig.headless,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run'],
      })
      .then((browser) => {
        browser.on('disconnected', () => {
          log.warn('Chromium disconnected; it will be relaunched on the next request');
          browserPromise = null;
        });
        return browser;
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

function scheduleIdleClose() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    if (activePages === 0 && browserPromise) {
      log.info('Closing idle Chromium');
      const b = await browserPromise.catch(() => null);
      browserPromise = null;
      await b?.close().catch(() => {});
    }
  }, IDLE_CLOSE_MS);
  idleTimer.unref?.();
}

export async function closeBrowser() {
  clearTimeout(idleTimer);
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

const CHALLENGE_PATTERNS = [
  /g-recaptcha|hcaptcha|cf-challenge|challenge-platform|cf_chl_/i,
  /<title>\s*(just a moment|attention required|access denied)/i,
];

async function loadOnce(url, { timeoutMs, javaScript }) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  activePages += 1;
  try {
    await page.setUserAgent(crawlerConfig.userAgent);
    await page.setJavaScriptEnabled(javaScript);
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.isInterceptResolutionHandled()) return;
      const blocked =
        crawlerConfig.blockedResourceTypes.includes(req.resourceType()) ||
        // Never let a page pull us onto private network addresses.
        !isPublicHttpUrl(req.url());
      if (blocked && !req.url().startsWith('data:')) req.abort('blockedbyclient');
      else req.continue();
    });

    let response;
    try {
      response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } catch (err) {
      throw new CrawlError(`Navigation failed: ${err.message}`, { code: 'NETWORK', url, retryable: true });
    }
    const status = response?.status() ?? 0;
    const html = await page.content();

    if (CHALLENGE_PATTERNS.some((re) => re.test(html))) {
      // We never try to solve or bypass challenges; the source is simply unavailable.
      throw new CrawlError('Source presented a CAPTCHA / bot challenge', { code: 'BLOCKED', status, url });
    }
    checkStatus(status, url);
    return { status, html, finalUrl: page.url() };
  } finally {
    activePages -= 1;
    await page.close().catch(() => {});
    scheduleIdleClose();
  }
}

/**
 * Crawl policy shared by every request: URL validation, robots.txt, per-host
 * rate limit, host circuit breaker, timeout and retry with exponential backoff.
 * `load()` performs the actual request and throws CrawlError on bad statuses.
 */
async function politely(url, load, { signal, retries = crawlerConfig.retries } = {}) {
  if (!isPublicHttpUrl(url)) throw new CrawlError('Refusing to crawl a non-public URL', { code: 'INVALID_URL', url });
  throwIfAborted(signal);

  let allowed = true;
  try {
    allowed = await isAllowedByRobots(url);
  } catch {
    allowed = true;
  }
  if (!allowed) throw new CrawlError('Disallowed by robots.txt', { code: 'ROBOTS_DISALLOWED', url });

  const host = hostOf(url);
  const refuseIfBlocked = () => {
    if (hostStatus(host).blocked) {
      throw new CrawlError(`${host} is refusing automated access; skipped`, { code: 'HOST_BLOCKED', url });
    }
  };
  refuseIfBlocked();
  let attempt = 0;
  for (;;) {
    throwIfAborted(signal);
    try {
      const started = Date.now();
      const result = await hostRateLimiter.schedule(
        host,
        () => {
          // Requests queued before the host refused us must not go out either.
          refuseIfBlocked();
          return load();
        },
        signal,
      );
      log.debug(`GET ${url} → ${result.status} (${Date.now() - started}ms)`);
      refusals.delete(host);
      return result;
    } catch (err) {
      if (err.code === 'ABORTED') throw err;
      if (err.code === 'FORBIDDEN' || err.code === 'BLOCKED') noteRefusal(host);
      const retryable = err instanceof CrawlError ? err.retryable : true;
      if (!retryable || attempt >= retries) {
        log.warn(`Failed ${url}: ${err.message}`);
        throw err instanceof CrawlError ? err : new CrawlError(err.message, { url });
      }
      attempt += 1;
      const backoff = crawlerConfig.retryBaseDelayMs * 2 ** (attempt - 1) * (err.code === 'RATE_LIMITED' ? 3 : 1);
      log.info(`Retry ${attempt}/${retries} for ${url} in ${backoff}ms (${err.message})`);
      await sleep(backoff, signal);
    }
  }
}

function checkStatus(status, url) {
  if (status === 429) throw new CrawlError('Rate limited by source', { code: 'RATE_LIMITED', status, url, retryable: true });
  if (status >= 500) throw new CrawlError(`Source error ${status}`, { code: 'HTTP_ERROR', status, url, retryable: true });
  if (status === 401 || status === 403) throw new CrawlError(`Access denied (${status})`, { code: 'FORBIDDEN', status, url });
  if (status >= 400) throw new CrawlError(`HTTP ${status}`, { code: 'HTTP_ERROR', status, url });
}

/** Fetch a public page's server-rendered HTML through the shared browser. */
export function fetchHtml(url, { signal, timeoutMs = crawlerConfig.navigationTimeoutMs, retries = crawlerConfig.retries, javaScript = false } = {}) {
  return politely(url, () => pageSlots.run(() => loadOnce(url, { timeoutMs, javaScript }), signal), { signal, retries });
}

/**
 * Fetch a public JSON API (no browser needed). Same crawl policy as fetchHtml.
 * Official APIs are preferred over scraping HTML wherever they exist.
 */
// Some government API hosts omit their intermediate certificate. Browsers fetch it
// automatically (AIA); Node does not. We add those public intermediates to Node's
// root store — certificates are still fully verified against a trusted root.
const EXTRA_INTERMEDIATES = fs.readFileSync(new URL('../../certs/intermediates.pem', import.meta.url), 'utf8');
const tlsAgent = new https.Agent({ keepAlive: true, ca: [...tls.rootCertificates, EXTRA_INTERMEDIATES] });

function httpsGetJson(url, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { agent: tlsAgent, headers: { 'user-agent': crawlerConfig.userAgent, accept: 'application/json' }, signal, timeout: timeoutMs },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 5_000_000) req.destroy(new Error('Response too large'));
        });
        res.on('end', () => resolve({ status: res.statusCode, body }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

export function fetchJson(url, { signal, timeoutMs = crawlerConfig.navigationTimeoutMs, retries = crawlerConfig.retries } = {}) {
  return politely(
    url,
    async () => {
      let res;
      try {
        res = await httpsGetJson(url, { signal, timeoutMs });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new CrawlError(`Request failed: ${err.message}`, { code: 'NETWORK', url, retryable: true });
      }
      checkStatus(res.status, url);
      try {
        return { status: res.status, json: JSON.parse(res.body) };
      } catch {
        throw new CrawlError('Response was not JSON', { code: 'BAD_RESPONSE', status: res.status, url });
      }
    },
    { signal, retries },
  );
}
