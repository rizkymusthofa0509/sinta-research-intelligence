import { sources } from '../config/crawler.js';
import { parseSintaJournalArticles, parseSintaJournalSearch } from '../parsers/sintaParser.js';
import { fetchHtml } from '../utils/browser.js';
import { createLogger } from '../utils/logger.js';
import { SourceCrawler } from './SourceCrawler.js';

const log = createLogger('sinta');

/**
 * SINTA exposes a public journal directory (/journals?q=) with accreditation
 * rank, ISSN, publisher (affiliation) and links. SINTA's article search
 * requires login, so this crawler works at journal level only:
 *   - search(): journals whose name matches the keyword + their recent articles
 *   - lookupJournals(): resolve a journal name/ISSN to its SINTA record
 */
export class SintaCrawler extends SourceCrawler {
  constructor() {
    super(sources.sinta);
  }

  journalSearchUrl(query, page = 1) {
    const url = new URL('/journals', this.baseUrl);
    url.searchParams.set('q', query);
    if (page > 1) url.searchParams.set('page', String(page));
    return url.toString();
  }

  async lookupJournals(query, { signal } = {}) {
    const url = this.journalSearchUrl(query);
    const { html } = await fetchHtml(url, { signal });
    return parseSintaJournalSearch(html, url);
  }

  async journalArticles(sintaUrl, { signal } = {}) {
    const { html } = await fetchHtml(sintaUrl, { signal });
    return parseSintaJournalArticles(html);
  }

  /**
   * Journals whose title matches the keyword, plus the recent Garuda-indexed
   * articles listed on the top journals' SINTA profiles.
   */
  async search(keyword, { limit = 100, signal, onProgress, maxJournalPages = 2, profileJournals = 5 } = {}) {
    const journals = [];
    let totalAvailable = 0;
    for (let page = 1; page <= maxJournalPages; page++) {
      const url = this.journalSearchUrl(keyword, page);
      const { html } = await fetchHtml(url, { signal });
      const parsed = parseSintaJournalSearch(html, url);
      if (page === 1) totalAvailable = parsed.total;
      journals.push(...parsed.journals);
      if (parsed.journals.length === 0 || journals.length >= parsed.total) break;
    }
    onProgress?.({ stage: 'journals', message: `Found ${journals.length} SINTA journals matching the topic`, current: journals.length });

    const articles = [];
    for (const journal of journals.slice(0, profileJournals)) {
      if (articles.length >= limit) break;
      try {
        const list = await this.journalArticles(journal.sintaUrl, { signal });
        for (const a of list) {
          articles.push({
            ...a,
            journalName: journal.name,
            publisherName: a.publisherName || journal.publisherName,
            sintaJournal: journal,
            source: this.id,
            sourceUrl: journal.sintaUrl,
          });
        }
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        log.warn(`Could not read profile ${journal.sintaUrl}: ${err.message}`);
      }
    }
    return { source: this.id, totalAvailable, journals, articles: articles.slice(0, limit) };
  }
}
