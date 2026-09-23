import { analyzeKeywords } from '../../../shared/keywordAnalyzer.js';
import { analysisQueryFor, relevanceModel, relevanceTo } from '../../../shared/queryPlanner.js';

/**
 * Build a dashboard-ready snapshot from the articles streamed so far.
 * Same keyword analysis as the server's final pass, run in the browser so the
 * bubble map can grow while crawling continues.
 */
export function liveSnapshot(articleMap, query, plan = null, extra = {}) {
  const articles = [...articleMap.values()].map((a) => ({ ...a }));
  const model = relevanceModel(query, plan);
  for (const a of articles) {
    const r = relevanceTo(a, model);
    a.relevance = r.score;
    a.matchedTerms = r.matched;
  }
  const analysisQuery = analysisQueryFor(plan, articles, query);
  const { perArticle, labels, queryKey } = analyzeKeywords(articles, { query: analysisQuery });
  for (const a of articles) a.keywordIds = perArticle.get(a.id) || [];
  return {
    query,
    analysisQuery,
    queryTerms: model.terms,
    articles,
    labels,
    rootKey: labels[queryKey] ? queryKey : null,
    topicJournals: [],
    meta: { live: true, warnings: [], sources: null, totalAvailable: {}, plan, ...extra.meta },
  };
}
