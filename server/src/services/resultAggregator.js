import { buildResult } from '../../../shared/aggregate.js';
import { analyzeKeywords } from '../../../shared/keywordAnalyzer.js';
import { analysisQueryFor, relevanceModel, relevanceTo } from '../../../shared/queryPlanner.js';
import { dedupeArticles, normalizeArticle } from './dataNormalizer.js';
import { journalKey } from './journalResolver.js';

/** Journal info for a raw article (SINTA-profile articles carry their own journal record). */
export function journalFor(raw, journalsByKey) {
  if (raw.sintaJournal) return { ...raw.sintaJournal, ...(journalsByKey.get(journalKey(raw.sintaJournal.name)) || {}) };
  return journalsByKey.get(journalKey(raw.journalName)) || raw.openalexJournal || null;
}

/**
 * Raw crawl output → API response.
 * journalsByKey: Map(journalKey → resolved SINTA/Garuda journal info | null)
 */
export function aggregateResults({ query, rawArticles, journalsByKey, sintaJournals = [], plan = null, meta = {} }) {
  const normalized = rawArticles.map((raw) => normalizeArticle(raw, journalFor(raw, journalsByKey)));
  const articles = dedupeArticles(normalized);

  // Similarity of every article to the user's query (share of its key terms present).
  const model = relevanceModel(query, plan);
  for (const a of articles) {
    const r = relevanceTo(a, model);
    a.relevance = r.score;
    a.matchedTerms = r.matched;
  }

  // For title-like queries the map is centred on the concept that found the most articles.
  const analysisQuery = analysisQueryFor(plan, articles, query);
  const { perArticle, labels, aliases, queryKey } = analyzeKeywords(articles, { query: analysisQuery });
  for (const a of articles) a.keywordIds = perArticle.get(a.id) || [];

  const rootKey = labels[queryKey] ? queryKey : null;
  const { summary, keywords, links } = buildResult(articles, labels, { rootKey });

  return {
    query,
    analysisQuery,
    queryTerms: model.terms,
    generatedAt: new Date().toISOString(),
    summary,
    keywords,
    links,
    labels,
    acronyms: aliases,
    rootKey,
    articles,
    topicJournals: sintaJournals,
    meta,
  };
}
