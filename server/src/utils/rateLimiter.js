import { crawlerConfig } from '../config/crawler.js';
import { Semaphore, sleep } from './concurrency.js';

/**
 * Per-host politeness: one request at a time per host (configurable) and a
 * minimum delay between consecutive requests. A robots.txt Crawl-delay, when
 * present, overrides the default delay if it is longer.
 */
class HostRateLimiter {
  constructor() {
    this.hosts = new Map();
  }

  #state(host) {
    let state = this.hosts.get(host);
    if (!state) {
      const override = crawlerConfig.hostOverrides?.[host] || {};
      state = {
        semaphore: new Semaphore(override.concurrency ?? crawlerConfig.perHostConcurrency),
        lastRequestAt: 0,
        delayMs: override.delayMs ?? crawlerConfig.defaultHostDelayMs,
      };
      this.hosts.set(host, state);
    }
    return state;
  }

  setCrawlDelay(host, seconds) {
    if (!seconds || Number.isNaN(seconds)) return;
    const state = this.#state(host);
    // Cap absurd values so one site cannot stall a search forever.
    state.delayMs = Math.max(state.delayMs, Math.min(seconds * 1000, 10000));
  }

  /** Wait for a slot on this host, respecting the delay, then run fn. */
  async schedule(host, fn, signal) {
    const state = this.#state(host);
    return state.semaphore.run(async () => {
      // Reserve the next start slot before sleeping so parallel waiters stay spaced out.
      const startAt = Math.max(Date.now(), state.lastRequestAt + state.delayMs);
      state.lastRequestAt = startAt;
      if (startAt > Date.now()) await sleep(startAt - Date.now(), signal);
      return fn();
    }, signal);
  }
}

export const hostRateLimiter = new HostRateLimiter();
