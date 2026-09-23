import { sources } from '../config/crawler.js';
import { fetchJson } from '../utils/browser.js';
import { createLogger } from '../utils/logger.js';
import { SourceCrawler } from './SourceCrawler.js';

const log = createLogger('openalex');

const SELECT = [
  'id', 'doi', 'title', 'publication_year', 'authorships', 'primary_location',
  'abstract_inverted_index', 'keywords', 'primary_topic', 'language',
].join(',');

/** OpenAlex stores abstracts as an inverted index; rebuild the plain text. */
export function rebuildAbstract(index) {
  if (!index || typeof index !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(index)) for (const p of positions) words[p] = word;
  const text = words.filter(Boolean).join(' ').trim();
  return text || null;
}

// OpenAlex field / subfield → SINTA's 10 subject areas (see shared/categories.js).
const FIELD_TO_CATEGORY = {
  'Computer Science': 'engineering', Engineering: 'engineering', Energy: 'engineering', 'Materials Science': 'engineering',
  'Chemical Engineering': 'engineering', Mathematics: 'science', 'Physics and Astronomy': 'science', Chemistry: 'science',
  'Earth and Planetary Sciences': 'science', 'Environmental Science': 'science', 'Biochemistry, Genetics and Molecular Biology': 'science',
  'Immunology and Microbiology': 'science', Neuroscience: 'science', Medicine: 'health', Nursing: 'health', 'Health Professions': 'health',
  Dentistry: 'health', 'Pharmacology, Toxicology and Pharmaceutics': 'health', Veterinary: 'agriculture',
  'Agricultural and Biological Sciences': 'agriculture', 'Economics, Econometrics and Finance': 'economy',
  'Business, Management and Accounting': 'economy', 'Decision Sciences': 'economy', 'Social Sciences': 'social',
  Psychology: 'social', 'Arts and Humanities': 'humanities',
};
const SUBFIELD_TO_CATEGORY = {
  Education: 'education', 'Religious studies': 'religion', 'Visual Arts and Performing Arts': 'art', Law: 'social',
};

export function categoryFromTopic(topic) {
  if (!topic) return [];
  const sub = SUBFIELD_TO_CATEGORY[topic.subfield?.display_name];
  const field = FIELD_TO_CATEGORY[topic.field?.display_name];
  return [...new Set([sub, field].filter(Boolean))].slice(0, 1);
}

const fmtIssn = (v) => (v && /^\d{4}-?\d{3}[\dXx]$/.test(v) ? `${v.replace('-', '').slice(0, 4)}-${v.replace('-', '').slice(4)}`.toUpperCase() : null);

// Discipline names OpenAlex attaches to almost everything; too broad to be topics.
const DISCIPLINE_KEYWORDS = new Set(
  ['computer science', 'mathematics', 'engineering', 'medicine', 'biology', 'physics', 'chemistry', 'psychology', 'business', 'economics',
    'political science', 'geography', 'sociology', 'philosophy', 'art', 'history', 'materials science', 'environmental science', 'geology',
    'mathematics education', 'computer network', 'world wide web', 'data science', 'operating system', 'programming language'],
);

/** Map one OpenAlex work to the raw-article shape the normalizer understands. */
export function mapWork(w) {
  const src = w.primary_location?.source || null;
  const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, '') : null;
  const issns = (src?.issn || []).map(fmtIssn).filter(Boolean);
  const topic = w.primary_topic || null;
  const categories = categoryFromTopic(topic);
  return {
    openalexId: w.id,
    title: w.title || null,
    authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean),
    abstract: rebuildAbstract(w.abstract_inverted_index),
    // OpenAlex keywords are machine-assigned; keep only confident ones and say so in provenance.
    openalexKeywords: (w.keywords || [])
      .filter((k) => k.score >= 0.5 && !DISCIPLINE_KEYWORDS.has(String(k.display_name).toLowerCase()))
      .map((k) => k.display_name),
    journalName: src?.display_name || null,
    publisherName: src?.host_organization_name || null,
    publicationYear: w.publication_year || null,
    doi,
    articleUrl: w.primary_location?.landing_page_url || (doi ? `https://doi.org/${doi}` : null),
    downloadUrl: w.primary_location?.pdf_url || null,
    openalexUrl: w.id ? w.id.replace('https://openalex.org/', 'https://openalex.org/works/') : null,
    countries: [...new Set((w.authorships || []).flatMap((a) => (a.institutions || []).map((i) => i.country_code)).filter(Boolean))],
    topic: topic ? { name: topic.display_name, field: topic.field?.display_name || null, domain: topic.domain?.display_name || null } : null,
    openalexJournal: src
      ? {
          name: src.display_name,
          issn: issns[0] || null,
          eissn: issns[1] || null,
          publisherName: src.host_organization_name || null,
          journalUrl: null,
          openalexSourceUrl: src.id || null,
          categories,
          subjectAreas: topic?.field?.display_name ? [topic.field.display_name] : [],
          coreSubjects: [],
          fromOpenAlex: true,
        }
      : null,
    categoriesHint: categories,
    source: 'openalex',
  };
}

/**
 * OpenAlex (openalex.org) — free, CC0 index of the world's scholarly works with an
 * official API. Used as a second article source; `scope: 'id'` limits results to
 * works with at least one author at an Indonesian institution.
 */
export class OpenAlexCrawler extends SourceCrawler {
  constructor() {
    super(sources.openalex);
    this.apiBase = sources.openalex.apiBase;
  }

  searchUrl(query, { scope, cursor, perPage }) {
    const url = new URL('/works', this.apiBase);
    url.searchParams.set('search', query);
    if (scope === 'id') url.searchParams.set('filter', 'authorships.institutions.country_code:ID');
    url.searchParams.set('per-page', String(perPage));
    url.searchParams.set('cursor', cursor);
    url.searchParams.set('select', SELECT);
    if (sources.openalex.mailto) url.searchParams.set('mailto', sources.openalex.mailto);
    return url.toString();
  }

  async count(query, { scope = 'id', signal } = {}) {
    const url = new URL('/works', this.apiBase);
    url.searchParams.set('search', query);
    if (scope === 'id') url.searchParams.set('filter', 'authorships.institutions.country_code:ID');
    url.searchParams.set('per-page', '1');
    url.searchParams.set('select', 'id');
    const { json } = await fetchJson(url.toString(), { signal });
    return json?.meta?.count ?? 0;
  }

  async search(keyword, { limit = 100, signal, onProgress, onBatch, scope = 'id' } = {}) {
    const articles = [];
    let cursor = '*';
    let totalAvailable = null;
    const perPage = Math.min(50, Math.max(10, limit));
    let partial = false;
    while (cursor && articles.length < limit) {
      let json;
      try {
        ({ json } = await fetchJson(this.searchUrl(keyword, { scope, cursor, perPage }), { signal }));
      } catch (err) {
        if (err.code === 'ABORTED' || articles.length === 0) throw err;
        partial = true;
        log.warn(`Stopped paging "${keyword}": ${err.message}`);
        break;
      }
      totalAvailable ??= json?.meta?.count ?? 0;
      const batch = (json?.results || []).map(mapWork).filter((a) => a.title).slice(0, limit - articles.length);
      if (!batch.length) break;
      articles.push(...batch);
      onBatch?.(batch);
      onProgress?.({ stage: 'articles', message: `OpenAlex: ${articles.length} works`, current: articles.length, total: Math.min(limit, totalAvailable) });
      cursor = json?.meta?.next_cursor || null;
    }
    log.info(`"${keyword}" (${scope}): ${articles.length} works (source reports ${totalAvailable ?? '?'})`);
    return { source: this.id, totalAvailable, articles, partial };
  }
}
