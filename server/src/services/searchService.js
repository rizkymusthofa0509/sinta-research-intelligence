import { getCategory } from '../../../shared/categories.js';
import { planQuery } from '../../../shared/queryPlanner.js';
import { crawlerConfig } from '../config/crawler.js';
import { GarudaCrawler } from '../crawlers/GarudaCrawler.js';
import { OpenAlexCrawler } from '../crawlers/OpenAlexCrawler.js';
import { ArjunaCrawler } from '../crawlers/ArjunaCrawler.js';
import { SintaCrawler } from '../crawlers/SintaCrawler.js';
import { enrichFromArticlePages } from '../crawlers/journalCrawler.js';
import { mapLimit, throwIfAborted } from '../utils/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { normalizeArticle } from './dataNormalizer.js';
import { JournalResolver, journalKey, mergeProfile } from './journalResolver.js';
import { aggregateResults, journalFor } from './resultAggregator.js';
import { buildLandscape, keywordVectors } from './landscape.js';
import { articleText, cosine, embed, semanticStatus } from './semantic.js';

const log = createLogger('search');

const garuda = new GarudaCrawler();
const sinta = new SintaCrawler();
const arjuna = new ArjunaCrawler();
const openalex = new OpenAlexCrawler();
const resolver = new JournalResolver({ sinta, garuda, arjuna });

export class SearchError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** How many documents each source reports for a query (used to verify research gaps). */
export async function countDocuments(query, { scope = 'id', signal } = {}) {
  const [g, o] = await Promise.allSettled([
    garuda.search(query, { limit: 1, signal }).then((r) => r.totalAvailable ?? 0),
    openalex.count(query, { scope, signal }),
  ]);
  return {
    query,
    garuda: g.status === 'fulfilled' ? g.value : null,
    openalex: o.status === 'fulfilled' ? o.value : null,
    scope,
  };
}

/** On-demand journal profile for the UI (website, SINTA link, subjects). */
export async function getJournalProfile(garudaJournalUrl, { signal } = {}) {
  const profile = await garuda.fetchJournalProfile(garudaJournalUrl, { signal });
  return mergeProfile({}, profile, sinta.baseUrl);
}

/**
 * Search → Crawl → Analyze, streamed.
 *
 * Everything stays in memory for the duration of the request; nothing is persisted.
 *  - onProgress({ stage, message, current?, total? })   stage: sinta | articles | journals | enrich | keywords | map
 *  - onArticles(normalizedArticles[])  new or updated articles as soon as they are known,
 *    so the client can grow the bubble map while crawling continues.
 *
 * Each stage is isolated: a failure after articles were collected becomes a
 * warning and the search still returns everything gathered so far.
 */
export async function runSearch({
  query,
  limit,
  category,
  deep,
  sources = ['garuda', 'openalex'],
  scope = 'id',
  signal,
  onProgress = () => {},
  onArticles = () => {},
  onPlan = () => {},
}) {
  const started = Date.now();
  const warnings = [];
  const sourceStatus = {};
  const focus = category ? getCategory(category) : null;
  const journalsByKey = new Map();
  const rawArticles = [];

  const emit = (raws) => {
    if (!raws.length) return;
    try {
      onArticles(raws.map((raw) => normalizeArticle(raw, journalFor(raw, journalsByKey))));
    } catch (err) {
      log.warn(`Could not stream articles: ${err.message}`);
    }
  };
  /** Stage runner: aborts propagate, other errors become warnings. */
  const stage = async (name, fn, warning) => {
    try {
      return await fn();
    } catch (err) {
      if (err.code === 'ABORTED') throw err;
      // Crawl errors (403, timeouts) are expected operational events; only bugs need a stack.
      log.warn(`Stage "${name}" failed: ${err.name === 'CrawlError' ? err.message : err.stack || err.message}`);
      const text = typeof warning === 'function' ? warning(err) : warning;
      if (text) warnings.push(text);
      return null;
    }
  };

  // 1. SINTA: journals whose title matches the topic (journal-level source).
  onProgress({ stage: 'sinta', message: 'Searching SINTA…' });
  const sintaResult =
    (await stage(
      'sinta',
      async () => {
        const r = await sinta.search(query, { limit: Math.min(30, limit), signal, onProgress, profileJournals: 3 });
        sourceStatus.sinta = { ok: true, journals: r.journals.length, articles: r.articles.length };
        return r;
      },
      (err) => {
        sourceStatus.sinta = { ok: false, error: err.code || 'ERROR' };
        // SINTA refusing us is expected: ranks come from ARJUNA's accreditation decrees instead.
        return null;
      },
    )) || { journals: [], articles: [] };
  onProgress({ stage: 'sinta', message: `SINTA: ${sintaResult.journals.length} journals titled with this topic`, done: true });
  if (!focus && sintaResult.articles.length) {
    rawArticles.push(...sintaResult.articles);
    emit(sintaResult.articles);
  }
  throwIfAborted(signal);

  // 2. Article sources, run in parallel (different hosts): Garuda (Indonesian journals)
  //    and OpenAlex (global index, optionally only works with Indonesian authors).
  //    Every page is streamed immediately. Title-like queries are planned into concepts.
  onProgress({ stage: 'articles', message: 'Finding journals & extracting articles…', current: 0, total: limit });
  const plan = planQuery(query);
  onPlan(plan);
  const useGaruda = sources.includes('garuda');
  const useOpenAlex = sources.includes('openalex');
  const garudaBudget = useGaruda ? (useOpenAlex ? Math.ceil(limit * 0.6) : limit) : 0;
  const openalexBudget = useOpenAlex ? limit - garudaBudget : 0;

  // One paper found by both sources (same DOI or title) is kept once.
  const seen = new Set();
  const dedupeKey = (a) => (a.doi ? `doi:${a.doi.toLowerCase()}` : `t:${(a.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()}`);
  const conceptStats = [];
  const take = (batch, concept) => {
    const fresh = batch.filter((a) => {
      const key = dedupeKey(a);
      if (seen.has(key)) return false;
      seen.add(key);
      a.matchedQuery = concept.query;
      return true;
    });
    rawArticles.push(...fresh);
    emit(fresh);
  };

  const garudaAccept = focus
    ? async (batch) => {
        const resolved = await resolver.resolveMany(batch.map((a) => a.journalName), { signal });
        for (const [k, v] of resolved) journalsByKey.set(k, v);
        return batch.filter((a) => journalsByKey.get(journalKey(a.journalName))?.categories?.includes(focus.id));
      }
    : undefined;

  /** Run one source over the query plan: full phrase first, then concepts if it found too little. */
  const runSource = async (id, budget, searchOne) => {
    let first = null;
    let ok = false;
    let lastError = null;
    const count = () => rawArticles.filter((a) => a.source === id).length;
    for (const [i, concept] of plan.concepts.entries()) {
      const remaining = budget - count();
      if (remaining <= 0) break;
      const conceptsLeft = plan.concepts.length - i;
      const conceptLimit = i === 0 ? remaining : Math.max(10, Math.ceil(remaining / conceptsLeft));
      if (i > 0) onProgress({ stage: 'articles', message: `Title-like keyword: ${id === 'garuda' ? 'Garuda' : 'OpenAlex'} also searching “${concept.query}”…` });
      try {
        const before = count();
        const r = await searchOne(concept, conceptLimit);
        ok = true;
        if (i === 0) first = r;
        conceptStats.push({ ...concept, source: id, totalAvailable: r.totalAvailable ?? 0, collected: count() - before });
        if (r.partial) warnings.push(`Some ${id === 'garuda' ? 'Garuda' : 'OpenAlex'} pages for “${concept.query}” could not be loaded; results are partial.`);
        if (i === 0 && (r.totalAvailable ?? 0) >= Math.min(budget, 30)) break;
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        lastError = err;
        conceptStats.push({ ...concept, source: id, error: err.code || 'ERROR' });
        log.warn(`${id} failed for "${concept.query}": ${err.message}`);
      }
    }
    sourceStatus[id] = ok
      ? { ok: true, articles: count(), totalAvailable: first?.totalAvailable ?? null }
      : { ok: false, error: lastError?.code || 'ERROR', articles: count() };
    return first;
  };

  const [garudaFirst, openalexFirst] = await Promise.all([
    useGaruda
      ? runSource('garuda', garudaBudget, (concept, conceptLimit) =>
          garuda.search(concept.query, {
            limit: conceptLimit,
            signal,
            onProgress,
            accept: garudaAccept,
            maxPages: focus ? Math.min(Math.ceil(conceptLimit / 10) * 4, 80) : undefined,
            onBatch: (batch) => take(batch, concept),
          }),
        )
      : null,
    useOpenAlex
      ? runSource('openalex', openalexBudget, (concept, conceptLimit) =>
          openalex.search(concept.query, {
            limit: conceptLimit,
            signal,
            scope,
            onProgress,
            // OpenAlex topics carry a field, so a category focus filters directly.
            onBatch: (batch) => take(focus ? batch.filter((a) => a.categoriesHint?.includes(focus.id)) : batch, concept),
          }),
        )
      : null,
  ]);
  const garudaResult = garudaFirst || { totalAvailable: null };
  for (const id of ['garuda', 'openalex']) {
    const st = sourceStatus[id];
    if (st && !st.ok && st.articles === 0 && rawArticles.length) {
      warnings.push(`${id === 'garuda' ? 'Garuda' : 'OpenAlex'} is currently unavailable; showing results from the other source.`);
    }
  }

  if (focus && sintaResult.articles.length) {
    const kept = sintaResult.articles.filter((a) => journalsByKey.get(journalKey(a.journalName))?.categories?.includes(focus.id));
    rawArticles.push(...kept);
    emit(kept);
  }
  if (!rawArticles.length && !sourceStatus.garuda?.ok && !sourceStatus.openalex?.ok) {
    throw new SearchError('SOURCE_UNAVAILABLE', 'SINTA source is currently unavailable.', 503);
  }
  throwIfAborted(signal);

  // OpenAlex articles bring their journal record (ISSN, publisher, field) with them.
  for (const a of rawArticles) {
    if (a.openalexJournal && !journalsByKey.has(journalKey(a.journalName))) journalsByKey.set(journalKey(a.journalName), { ...a.openalexJournal });
  }

  // 3. Resolve journals (Garuda directory → category, ISSN, publisher; SINTA → rank).
  //    Articles of each resolved journal are re-streamed with the new fields.
  const byJournal = new Map();
  for (const a of rawArticles) {
    const k = journalKey(a.journalName);
    if (!byJournal.has(k)) byJournal.set(k, []);
    byJournal.get(k).push(a);
  }
  // Garuda's directory only knows Indonesian journals: look up journals of Garuda/SINTA articles.
  const names = [...new Set(rawArticles.filter((a) => a.source !== 'openalex').map((a) => a.journalName).filter(Boolean))].filter(
    (n) => !journalsByKey.has(journalKey(n)),
  );
  if (names.length) {
    onProgress({ stage: 'journals', message: `Looking up ${names.length} journals (Garuda directory + SINTA rank)…`, current: 0, total: names.length });
    await stage(
      'journals',
      async () => {
        await resolver.resolveMany(names, {
          signal,
          deadline: Date.now() + crawlerConfig.sintaResolve.timeBudgetMs,
          onProgress: ({ done, total, name, info }) => {
            const k = journalKey(name);
            journalsByKey.set(k, info);
            if (info) emit(byJournal.get(k) || []);
            onProgress({ stage: 'journals', message: `Looking up journals… ${done}/${total}`, current: done, total });
          },
        });
      },
      'Some journals could not be looked up; their category and rank are shown as N/A.',
    );
  }
  throwIfAborted(signal);

  // 3b. Journal profile pages (website, SINTA link, core subject) for the journals
  //     with the most articles; the UI fetches the rest on demand.
  const topJournals = [...journalsByKey.entries()]
    .filter(([, info]) => info?.garudaUrl && !info.profileLoaded)
    .sort((a, b) => (byJournal.get(b[0])?.length || 0) - (byJournal.get(a[0])?.length || 0))
    .slice(0, crawlerConfig.eagerProfiles);
  if (topJournals.length) {
    let done = 0;
    onProgress({ stage: 'journals', message: `Reading ${topJournals.length} journal profiles…`, current: 0, total: topJournals.length });
    await stage('profiles', () =>
      mapLimit(
        topJournals,
        2,
        async ([k, info]) => {
          try {
            await resolver.loadProfile(info, { signal });
            emit(byJournal.get(k) || []);
          } catch (err) {
            if (err.code === 'ABORTED') throw err;
          }
          done += 1;
          onProgress({ stage: 'journals', message: `Reading journal profiles… ${done}/${topJournals.length}`, current: done, total: topJournals.length });
        },
        { signal, deadline: Date.now() + 25000 },
      ),
    );
  }
  throwIfAborted(signal);

  // 3c. Accreditation rank (S1–S6) from ARJUNA decrees, streamed per journal.
  const toRank = [...journalsByKey.entries()].filter(([, info]) => info && !info.rankLoaded);
  if (toRank.length) {
    let done = 0;
    let ranked = 0;
    let failed = 0;
    onProgress({ stage: 'ranks', message: `Reading accreditation (SINTA level) for ${toRank.length} journals…`, current: 0, total: toRank.length });
    await stage('ranks', () =>
      mapLimit(
        toRank,
        crawlerConfig.accreditation.concurrency,
        async ([k, info]) => {
          try {
            await resolver.loadRank(info, { signal });
            if (info.sintaRank) {
              ranked += 1;
              emit(byJournal.get(k) || []);
            }
          } catch (err) {
            if (err.code === 'ABORTED') throw err;
            failed += 1;
          }
          done += 1;
          onProgress({ stage: 'ranks', message: `Accreditation ${done}/${toRank.length} · ${ranked} ranked`, current: done, total: toRank.length });
        },
        { signal, deadline: Date.now() + crawlerConfig.accreditation.timeBudgetMs },
      ),
    );
    sourceStatus.arjuna = { ok: failed < toRank.length, journals: toRank.length, ranked, failed };
    if (failed === toRank.length) warnings.push('ARJUNA (journal accreditation) is unavailable; SINTA levels are shown as N/A.');
  }
  throwIfAborted(signal);

  // 4. Optional: author keywords from the article pages on journal websites.
  let enrichment = null;
  if (deep && rawArticles.length) {
    onProgress({ stage: 'enrich', message: 'Reading author keywords from article pages…', current: 0, total: rawArticles.length });
    enrichment = await stage(
      'enrich',
      () =>
        enrichFromArticlePages(rawArticles, {
          signal,
          onArticle: (raw) => emit([raw]),
          onProgress: ({ done, total, enriched }) =>
            onProgress({ stage: 'enrich', message: `Article pages ${done}/${total} · ${enriched} with author keywords`, current: done, total }),
        }),
      'Reading article pages failed part-way; some author keywords are missing.',
    );
    if (enrichment?.timedOut) warnings.push(`Article-page keyword reading stopped at the time limit (${enrichment.visited}/${enrichment.total} pages).`);
  }
  throwIfAborted(signal);

  // 5–6. Normalise, dedupe, extract keywords, aggregate — the authoritative final result.
  onProgress({ stage: 'keywords', message: 'Analyzing keywords…' });
  const result = aggregateResults({
    query,
    rawArticles,
    journalsByKey,
    sintaJournals: sintaResult.journals,
    plan,
    meta: {
      plan: { ...plan, concepts: plan.concepts.map((c) => conceptStats.find((s) => s.query === c.query) || { ...c, skipped: true }) },
      limit,
      category: focus ? { id: focus.id, label: focus.label } : null,
      deep: Boolean(deep),
      durationMs: Date.now() - started,
      sources: sourceStatus,
      enrichment,
      journalsResolved: [...journalsByKey.values()].filter(Boolean).length,
      journalsLookedUp: journalsByKey.size,
      warnings,
      totalAvailable: {
        garuda: garudaResult.totalAvailable ?? null,
        openalex: openalexFirst?.totalAvailable ?? null,
        sintaJournals: sintaResult.totalAvailable ?? null,
      },
    },
  });
  // 7. Semantic similarity (local embedding model) and the research landscape.
  //    Falls back to keyword vectors when the model is not available.
  onProgress({
    stage: 'semantic',
    message:
      semanticStatus() === 'loading' || semanticStatus() === 'idle'
        ? 'Loading the local semantic model (first run downloads ~130 MB)…'
        : 'Computing semantic similarity & research landscape…',
  });
  await stage(
    'semantic',
    async () => {
      const vectors = result.articles.length ? await embed([query, ...result.articles.map(articleText)], { signal }) : null;
      throwIfAborted(signal);
      if (vectors) {
        const [queryVector, ...articleVectors] = vectors;
        result.articles.forEach((a, i) => {
          a.semantic = Math.round(Math.max(0, cosine(queryVector, articleVectors[i])) * 100) / 100;
        });
        result.landscape = buildLandscape(result.articles, articleVectors, result.labels, { method: 'embedding' });
      } else {
        if (semanticStatus() !== 'disabled') warnings.push('The semantic model is not available yet; similarity uses key terms and the landscape uses keywords.');
        result.landscape = buildLandscape(result.articles, keywordVectors(result.articles), result.labels, { method: 'keywords' });
      }
      result.meta.semantic = { status: semanticStatus(), method: result.landscape?.method ?? null };
    },
    'Semantic analysis failed; similarity uses key terms only.',
  );

  onProgress({ stage: 'map', message: 'Building topic map…' });
  result.meta.durationMs = Date.now() - started;
  log.info(`"${query}" → ${result.articles.length} articles, ${result.keywords.length} keywords in ${result.meta.durationMs}ms`);
  return result;
}
