/**
 * Contract every source crawler implements. A new source (Crossref, OpenAlex, ...)
 * only needs to extend this class and register itself in crawlers/index.js.
 *
 * search() resolves to:
 *   {
 *     source: string,              // source id, e.g. "garuda"
 *     totalAvailable: number|null, // how many results the source reports
 *     articles: RawArticle[],      // source-shaped records, normalised later
 *     journals?: RawJournal[],     // optional journal-level records
 *   }
 */
export class SourceCrawler {
  constructor({ id, label, baseUrl }) {
    this.id = id;
    this.label = label;
    this.baseUrl = baseUrl;
  }

  // eslint-disable-next-line no-unused-vars
  async search(keyword, { limit, signal, onProgress } = {}) {
    throw new Error(`${this.constructor.name}.search() is not implemented`);
  }
}
