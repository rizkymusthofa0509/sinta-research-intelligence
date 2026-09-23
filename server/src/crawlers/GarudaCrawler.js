import { sources } from '../config/crawler.js';
import { parseGarudaJournal, parseGarudaJournalSearch, parseGarudaSearch } from '../parsers/garudaParser.js';
import { fetchHtml } from '../utils/browser.js';
import { createLogger } from '../utils/logger.js';
import { SourceCrawler } from './SourceCrawler.js';

const log = createLogger('garuda');

/**
 * Garuda (Garba Rujukan Digital) is the Ministry's public article index that
 * SINTA links to. Its /documents search is public and paginated (10 per page),
 * so we walk pages sequentially until the requested limit is reached.
 */
export class GarudaCrawler extends SourceCrawler {
  constructor() {
    super(sources.garuda);
    this.pageSize = sources.garuda.pageSize;
  }

  searchUrl(keyword, page) {
    const url = new URL('/documents', this.baseUrl);
    url.searchParams.set('q', keyword);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.toString();
  }

  /** Journal directory search by name or ISSN. */
  async searchJournals(query, { signal } = {}) {
    const url = new URL('/journal', this.baseUrl);
    url.searchParams.set('q', query);
    const { html } = await fetchHtml(url.toString(), { signal });
    return parseGarudaJournalSearch(html, url.toString());
  }

  /** Journal profile: core subject (SINTA area), detailed areas, ISSN, publisher. */
  async fetchJournalProfile(garudaJournalUrl, { signal } = {}) {
    const { html, finalUrl } = await fetchHtml(garudaJournalUrl, { signal });
    return parseGarudaJournal(html, finalUrl || garudaJournalUrl);
  }

  /**
   * Walk result pages until `limit` articles are collected. `accept` lets the
   * caller keep only some articles (e.g. a category focus); `maxPages` caps how
   * far we are willing to page in that case.
   */
  async search(keyword, { limit = 100, signal, onProgress, onBatch, accept, maxPages } = {}) {
    const articles = [];
    const seen = new Set();
    let totalAvailable = null;
    let totalPages = maxPages ?? Math.ceil(limit / this.pageSize);
    let failures = 0;

    for (let page = 1; page <= totalPages && articles.length < limit; page++) {
      const url = this.searchUrl(keyword, page);
      let parsed;
      try {
        const { html } = await fetchHtml(url, { signal });
        parsed = parseGarudaSearch(html, url);
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        failures += 1;
        // The first page failing means the source is down; later pages are best effort.
        if (page === 1) throw err;
        log.warn(`Page ${page} failed, stopping pagination: ${err.message}`);
        break;
      }

      if (page === 1) {
        totalAvailable = parsed.total ?? parsed.items.length;
        const sourcePages = parsed.totalPages ?? 1;
        totalPages = Math.min(totalPages, sourcePages);
      }
      if (parsed.items.length === 0) break;

      const batch = [];
      for (const item of parsed.items) {
        const key = item.garudaId || item.title.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        batch.push({ ...item, source: this.id, sourceUrl: url });
      }
      const kept = accept ? await accept(batch) : batch;
      const added = [];
      for (const item of kept) {
        if (articles.length >= limit) break;
        articles.push(item);
        added.push(item);
      }
      // Hand each page to the caller right away so the UI can grow the map live.
      if (added.length) onBatch?.(added);

      onProgress?.({
        stage: 'articles',
        message: `Extracting articles… page ${page} of ${totalPages} (${articles.length} kept)`,
        current: articles.length,
        total: Math.min(limit, totalAvailable ?? limit),
      });
    }

    log.info(`"${keyword}": ${articles.length} articles (source reports ${totalAvailable ?? '?'})`);
    return { source: this.id, totalAvailable, articles, partial: failures > 0 };
  }
}
