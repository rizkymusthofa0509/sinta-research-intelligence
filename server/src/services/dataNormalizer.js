import { createHash } from 'node:crypto';
import { journalKey } from './journalResolver.js';
import { doiToUrl, extractDoi } from '../utils/urlValidator.js';

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() || null : s ?? null);

const SOURCE_LABELS = {
  garuda: 'Garuda',
  sinta: 'SINTA',
  sintaJournal: 'SINTA (journal profile)',
  articlePage: 'Journal website (article page)',
  openalex: 'OpenAlex',
  openalexKeywords: 'OpenAlex (machine-assigned keywords)',
};

export function titleKey(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 160);
}

function idFor(raw) {
  // DOI first, so the same paper found by Garuda and OpenAlex gets the same id.
  const basis = (raw.doi && raw.doi.toLowerCase()) || raw.garudaId || raw.openalexId || raw.articleUrl || raw.title;
  return createHash('sha1').update(String(basis)).digest('hex').slice(0, 12);
}

function parseYear(value) {
  const m = String(value ?? '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

/** Some Garuda author names are "Surname, Given"; show them as "Given Surname". */
function normaliseAuthor(name) {
  const n = clean(name);
  if (!n) return null;
  const parts = n.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && !/\s/.test(parts[0]) && parts[1].length > 1 && parts[0] !== parts[1]) {
    return `${parts[1]} ${parts[0]}`;
  }
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0]; // "Suherman, Suherman"
  return n;
}

/**
 * Convert a source-specific record into the public Article shape.
 * Every field is either real data from a named source or null — nothing is invented.
 * `provenance` records which source supplied each field.
 */
export function normalizeArticle(raw, journal) {
  const provenance = {};
  const set = (field, value, source) => {
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
    provenance[field] = SOURCE_LABELS[source] || source;
    return value;
  };
  const page = raw.pageMeta && !raw.pageMeta.error ? raw.pageMeta : null;
  const src = raw.source;

  const authorsRaw = raw.authors?.length ? raw.authors : page?.authors || [];
  const authors = [...new Set(authorsRaw.map(normaliseAuthor).filter(Boolean))];
  const doi = extractDoi(raw.doi) || extractDoi(page?.doi);

  const article = {
    id: idFor(raw),
    title: set('title', clean(raw.title), src),
    authors: set('authors', authors, raw.authors?.length ? src : 'articlePage') || [],
    abstract: set('abstract', clean(raw.abstract) || clean(page?.abstract), raw.abstract ? src : 'articlePage'),
    keywords:
      set('keywords', page?.keywords?.length ? page.keywords : raw.openalexKeywords || [], page?.keywords?.length ? 'articlePage' : 'openalexKeywords') || [],
    journalName: set('journalName', clean(raw.journalName) || clean(journal?.name) || clean(page?.journalTitle), raw.journalName ? src : 'sinta'),
    issue: set('issue', clean(raw.issue), src),
    publisherName: set('publisherName', clean(raw.publisherName) || clean(journal?.publisherName), raw.publisherName ? src : 'sinta'),
    publicationYear: set('publicationYear', raw.publicationYear || parseYear(page?.date), raw.publicationYear ? src : 'articlePage'),
    sintaRank: set('sintaRank', journal?.sintaRank ?? null, journal?.rankSource || 'sinta'),
    accreditation: journal?.accreditation ?? null,
    issn: set('issn', journal?.issn ?? null, 'sinta'),
    eissn: set('eissn', journal?.eissn ?? null, 'sinta'),
    doi: set('doi', doi, raw.doi ? src : 'articlePage'),
    doiUrl: doiToUrl(doi),
    articleUrl: set('articleUrl', raw.articleUrl ?? null, src),
    downloadUrl: set('downloadUrl', raw.downloadUrl ?? null, src),
    journalUrl: set('journalUrl', journal?.journalUrl ?? null, 'sinta'),
    sintaUrl: set('sintaUrl', journal?.sintaUrl ?? null, 'sinta'),
    garudaUrl: set('garudaUrl', raw.garudaUrl ?? null, src),
    openalexUrl: set('openalexUrl', raw.openalexUrl ?? null, src),
    topic: raw.topic ?? null,
    countries: raw.countries ?? null,
    garudaJournalUrl: journal?.garudaUrl ?? null,
    publisherSintaUrl: journal?.publisherSintaUrl ?? null,
    categories: set('categories', journal?.categories ?? [], 'sinta') || [],
    subjectAreas: journal?.subjectAreas ?? [],
    scopusIndexed: journal ? Boolean(journal.scopusIndexed) : null,
    matchedQuery: raw.matchedQuery ?? null,
    source: SOURCE_LABELS[src] ?? src,
    sourceId: src,
    sourceUrl: raw.sourceUrl ?? null,
    journalKey: journalKey(raw.journalName || journal?.name),
    enrichedFromPage: Boolean(page?.keywords?.length),
    provenance,
  };
  return article;
}

/** Merge duplicates (same DOI or same title), keeping the most complete record. */
export function dedupeArticles(articles) {
  const byKey = new Map();
  const score = (a) => Object.values(a).filter((v) => v !== null && !(Array.isArray(v) && v.length === 0)).length;
  for (const a of articles) {
    const keys = [a.doi && `doi:${a.doi.toLowerCase()}`, `t:${titleKey(a.title)}`].filter(Boolean);
    const existingKey = keys.find((k) => byKey.has(k));
    if (!existingKey) {
      keys.forEach((k) => byKey.set(k, a));
      continue;
    }
    const existing = byKey.get(existingKey);
    const winner = score(a) > score(existing) ? a : existing;
    const loser = winner === a ? existing : a;
    for (const [field, value] of Object.entries(loser)) {
      const empty = winner[field] === null || winner[field] === undefined || (Array.isArray(winner[field]) && winner[field].length === 0);
      if (empty && value !== null) {
        winner[field] = value;
        if (loser.provenance?.[field]) winner.provenance[field] = loser.provenance[field];
      }
    }
    winner.alsoFoundIn = [...new Set([...(winner.alsoFoundIn || []), loser.source])].filter((s) => s !== winner.source);
    keys.forEach((k) => byKey.set(k, winner));
  }
  return [...new Set(byKey.values())];
}
