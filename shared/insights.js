// Data-driven recommendations computed only from the crawled articles.
// Nothing here is a prediction from outside data: every number is derived
// from the current in-memory result set, and each item carries its evidence.

import { RANKS } from './aggregate.js';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const logNorm = (v, max) => (max > 0 ? Math.log(v + 1) / Math.log(max + 1) : 0);

/**
 * Higher SINTA tiers are more selective. This factor scales the topic-fit
 * score into a conservative "confidence" and is shown in the UI as-is.
 * It is a heuristic, NOT an official acceptance rate.
 */
export const RANK_SELECTIVITY = { S1: 0.55, S2: 0.65, S3: 0.78, S4: 0.88, S5: 0.94, S6: 0.97, Unranked: 0.8 };
export const FIT_WEIGHTS = { relevance: 0.45, overlap: 0.35, recency: 0.2 };

function recentWindow(articles) {
  const years = articles.map((a) => a.publicationYear).filter(Boolean);
  if (!years.length) return null;
  const max = Math.max(...years);
  return { from: max - 1, to: max, min: Math.min(...years), max };
}

function coOccurrence(articles, ids) {
  const wanted = new Set(ids);
  const pairs = new Map();
  for (const a of articles) {
    const ks = (a.keywordIds || []).filter((k) => wanted.has(k)).sort();
    for (let i = 0; i < ks.length; i++)
      for (let j = i + 1; j < ks.length; j++) {
        const key = `${ks[i]}|${ks[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
  }
  return (a, b) => pairs.get(a < b ? `${a}|${b}` : `${b}|${a}`) || 0;
}

const TEMPLATES = {
  application: [
    (r, k, y) => ({
      en: `Applying ${r} to ${k}: A Systematic Literature Review of SINTA-Indexed Journals${y ? ` (${y.min}–${y.max})` : ''}`,
      id: `Penerapan ${r} pada ${k}: Tinjauan Literatur Sistematis Jurnal Terindeks SINTA${y ? ` (${y.min}–${y.max})` : ''}`,
    }),
    (r, k) => ({
      en: `${k} Based on ${r}: Methods, Challenges, and Research Opportunities in Indonesia`,
      id: `${k} Berbasis ${r}: Metode, Tantangan, dan Peluang Riset di Indonesia`,
    }),
  ],
  trend: [
    (r, k, y) => ({
      en: `Emerging ${k} in ${r} Research: Evidence from Indonesian Journals${y ? ` ${y.from}–${y.to}` : ''}`,
      id: `Tren ${k} dalam Riset ${r}: Bukti dari Jurnal Indonesia${y ? ` ${y.from}–${y.to}` : ''}`,
    }),
  ],
  gap: [
    (r, a, b) => ({
      en: `Integrating ${a} and ${b} for ${r}: A Proposed Framework`,
      id: `Integrasi ${a} dan ${b} untuk ${r}: Sebuah Kerangka Usulan`,
    }),
    (r, a, b) => ({
      en: `Bridging ${a} and ${b}: An Under-Explored Direction in ${r} Research`,
      id: `Menjembatani ${a} dan ${b}: Arah Riset ${r} yang Belum Banyak Dikaji`,
    }),
  ],
  review: [
    (r, a, b) => ({
      en: `${a} and ${b} in ${r} Research: A Bibliometric Analysis of Indonesian Journals`,
      id: `${a} dan ${b} dalam Riset ${r}: Analisis Bibliometrik Jurnal Indonesia`,
    }),
  ],
};

/**
 * Recommend research titles.
 *  - application: keywords strongly tied to the query topic
 *  - trend: keywords whose share of recent articles is above the corpus average
 *  - gap: two popular keywords that rarely appear together (co-occurrence < expected)
 *  - review: two keywords that appear together often enough to review
 * Diversified greedily: a keyword may appear in at most 2 titles and each type is capped.
 */
export function recommendTitles(articles, keywords, { rootKey, queryLabel, max = 10 } = {}) {
  const N = articles.length;
  if (N < 3 || keywords.length < 3) return [];
  const label = new Map(keywords.map((k) => [k.id, k.name]));
  const root = keywords.find((k) => k.id === rootKey);
  const rootName = root?.name || queryLabel || '';
  const win = recentWindow(articles);
  const recentTotal = win ? articles.filter((a) => a.publicationYear >= win.from).length : 0;
  const baseRecent = N ? recentTotal / N : 0;

  const pool = keywords.filter((k) => k.id !== rootKey && k.count >= 2).slice(0, 30);
  const maxCount = Math.max(...pool.map((k) => k.count), 1);
  const co = coOccurrence(articles, [...pool.map((k) => k.id), rootKey].filter(Boolean));

  const info = new Map(
    pool.map((k) => {
      const recent = win ? Object.entries(k.byYear || {}).reduce((s, [y, c]) => (Number(y) >= win.from ? s + c : s), 0) : 0;
      const share = k.count ? recent / k.count : 0;
      const lift = baseRecent ? share / baseRecent : 0;
      return [k.id, { k, pop: logNorm(k.count, maxCount), recent, trend: clamp((lift - 0.8) / 1.2), lift }];
    }),
  );

  const candidates = [];
  const pct = (v) => `${Math.round(v * 100)}%`;
  for (const { k, pop, trend, recent, lift } of info.values()) {
    const withRoot = rootKey ? co(rootKey, k.id) : k.count;
    if (withRoot >= 2) {
      candidates.push({
        type: 'application',
        ids: [k.id],
        score: 0.6 * pop + 0.25 * trend + 0.15 * logNorm(withRoot, maxCount),
        evidence: [
          `"${k.name}" appears in ${k.count} of ${N} articles (${k.journals} journals).`,
          rootKey ? `Co-occurs with "${rootName}" in ${withRoot} articles.` : null,
        ],
      });
    }
    if (win && recent >= 2 && lift >= 1.15) {
      candidates.push({
        type: 'trend',
        ids: [k.id],
        score: 0.45 * trend + 0.35 * pop + 0.2,
        evidence: [
          `${recent} of its ${k.count} articles are from ${win.from}–${win.to} (${pct(recent / k.count)} vs ${pct(baseRecent)} for the whole result set).`,
        ],
      });
    }
  }

  const top = [...info.values()].sort((a, b) => b.k.count - a.k.count).slice(0, 18);
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const A = top[i].k;
      const B = top[j].k;
      if (A.id.includes(B.id) || B.id.includes(A.id)) continue;
      const together = co(A.id, B.id);
      const expected = (A.count * B.count) / N;
      if (together >= 3) {
        candidates.push({
          type: 'review',
          ids: [A.id, B.id],
          score: 0.5 * ((top[i].pop + top[j].pop) / 2) + 0.5 * logNorm(together, maxCount),
          evidence: [`"${A.name}" and "${B.name}" appear together in ${together} articles — enough published work to review.`],
        });
      } else if (A.count >= 3 && B.count >= 3 && expected >= 1.5 && together <= expected * 0.35) {
        const novelty = clamp(1 - together / expected);
        candidates.push({
          type: 'gap',
          ids: [A.id, B.id],
          score: 0.45 * ((top[i].pop + top[j].pop) / 2) + 0.35 * novelty + 0.2 * ((top[i].trend + top[j].trend) / 2),
          evidence: [
            `"${A.name}" (${A.count}) and "${B.name}" (${B.count}) are both common, but co-occur in only ${together} article${together === 1 ? '' : 's'} (≈${expected.toFixed(1)} expected if independent).`,
          ],
        });
      }
    }
  }

  // Greedy diversified selection.
  const typeCap = { application: 3, trend: 3, gap: 3, review: 2 };
  const used = new Map();
  const typeUsed = new Map();
  const picked = [];
  const sorted = candidates.sort((a, b) => b.score - a.score);
  while (picked.length < max && sorted.length) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    sorted.forEach((c, idx) => {
      if ((typeUsed.get(c.type) || 0) >= typeCap[c.type]) return;
      if (c.ids.some((id) => (used.get(id) || 0) >= 2)) return;
      const penalty = c.ids.reduce((s, id) => s + (used.get(id) || 0) * 0.25, 0);
      if (c.score - penalty > bestScore) {
        bestScore = c.score - penalty;
        bestIdx = idx;
      }
    });
    if (bestIdx < 0) break;
    const [c] = sorted.splice(bestIdx, 1);
    c.ids.forEach((id) => used.set(id, (used.get(id) || 0) + 1));
    typeUsed.set(c.type, (typeUsed.get(c.type) || 0) + 1);
    const variants = TEMPLATES[c.type];
    const tpl = variants[(typeUsed.get(c.type) - 1) % variants.length];
    const names = c.ids.map((id) => label.get(id));
    const text = c.ids.length === 1 ? tpl(rootName, names[0], win) : tpl(rootName, names[0], names[1]);
    const wanted = new Set([...c.ids, rootKey].filter(Boolean));
    const support = articles
      .map((a) => ({ a, hits: (a.keywordIds || []).filter((k) => wanted.has(k)).length }))
      .filter((x) => x.hits > 0)
      .sort((x, y) => y.hits - x.hits || (y.a.publicationYear || 0) - (x.a.publicationYear || 0))
      .slice(0, 8)
      .map((x) => x.a.id);
    picked.push({
      id: `${c.type}:${c.ids.join('+')}`,
      type: c.type,
      title: text.en,
      titleId: text.id,
      keywordIds: [...c.ids, ...(rootKey ? [rootKey] : [])],
      keywordNames: [...names, ...(rootKey ? [rootName] : [])],
      score: Math.round(c.score * 100),
      evidence: c.evidence.filter(Boolean),
      supportingArticleIds: support,
    });
  }
  return picked;
}

/**
 * Journal topic-fit confidence.
 *   fit = 0.45·relevance + 0.35·overlap + 0.20·recency   (each 0–1)
 *     relevance = log(n_j+1)/log(max n+1)   n_j = matching articles from that journal
 *     overlap   = share of target keywords that appear in the journal's matching articles
 *     recency   = share of its matching articles from the last 3 years in the data
 *   confidence = fit × selectivity(SINTA rank)
 * Not an acceptance probability: it says how well the journal's recent output matches the topic.
 */
export function rankJournals(articles, { targetKeywordIds = [], limit = 30 } = {}) {
  const groups = new Map();
  for (const a of articles) {
    if (!a.journalName) continue;
    const key = a.journalName.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { name: a.journalName, articles: [], keywords: new Set(), sample: a };
      groups.set(key, g);
    }
    g.articles.push(a);
    (a.keywordIds || []).forEach((k) => g.keywords.add(k));
    if (!g.sample.sintaUrl && a.sintaUrl) g.sample = a;
  }
  const years = articles.map((a) => a.publicationYear).filter(Boolean);
  const maxYear = years.length ? Math.max(...years) : null;
  const maxN = Math.max(0, ...[...groups.values()].map((g) => g.articles.length));
  const target = [...new Set(targetKeywordIds)];

  const rows = [...groups.values()].map((g) => {
    const s = g.sample;
    const n = g.articles.length;
    const relevance = logNorm(n, maxN);
    const overlap = target.length ? target.filter((k) => g.keywords.has(k)).length / target.length : relevance;
    const recency = maxYear ? g.articles.filter((a) => a.publicationYear && a.publicationYear >= maxYear - 2).length / n : 0;
    const fit = FIT_WEIGHTS.relevance * relevance + FIT_WEIGHTS.overlap * overlap + FIT_WEIGHTS.recency * recency;
    const rank = s.sintaRank || 'Unranked';
    const selectivity = RANK_SELECTIVITY[rank];
    const confidence = Math.round(clamp(fit * selectivity, 0.03, 0.97) * 100);
    const yrs = g.articles.map((a) => a.publicationYear).filter(Boolean);
    return {
      name: g.name,
      publisherName: s.publisherName,
      sintaRank: s.sintaRank,
      sintaUrl: s.sintaUrl,
      journalUrl: s.journalUrl,
      garudaJournalUrl: s.garudaJournalUrl,
      publisherSintaUrl: s.publisherSintaUrl,
      issn: s.issn,
      eissn: s.eissn,
      categories: s.categories || [],
      subjectAreas: s.subjectAreas || [],
      scopusIndexed: s.scopusIndexed,
      articles: n,
      yearMin: yrs.length ? Math.min(...yrs) : null,
      yearMax: yrs.length ? Math.max(...yrs) : null,
      confidence,
      breakdown: {
        relevance: Math.round(relevance * 100),
        overlap: Math.round(overlap * 100),
        recency: Math.round(recency * 100),
        selectivity,
      },
      articleIds: g.articles.map((a) => a.id),
    };
  });
  return rows.sort((a, b) => b.confidence - a.confidence || b.articles - a.articles).slice(0, limit);
}

/** Publishers: aggregate their journals' fit. */
export function rankPublishers(journalRows, { limit = 20 } = {}) {
  const groups = new Map();
  for (const j of journalRows) {
    if (!j.publisherName) continue;
    const key = j.publisherName.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { name: j.publisherName, publisherSintaUrl: j.publisherSintaUrl, journals: [], articles: 0 };
      groups.set(key, g);
    }
    g.journals.push(j);
    g.articles += j.articles;
    g.publisherSintaUrl ||= j.publisherSintaUrl;
  }
  return [...groups.values()]
    .map((g) => {
      const best = g.journals.reduce((a, b) => (b.confidence > a.confidence ? b : a));
      return {
        name: g.name,
        publisherSintaUrl: g.publisherSintaUrl,
        articles: g.articles,
        journalCount: g.journals.length,
        confidence: best.confidence,
        bestJournal: best.name,
        ranks: [...new Set(g.journals.map((j) => j.sintaRank).filter(Boolean))].sort(),
        journals: g.journals.map((j) => ({ name: j.name, sintaRank: j.sintaRank, confidence: j.confidence })),
      };
    })
    .sort((a, b) => b.confidence - a.confidence || b.articles - a.articles)
    .slice(0, limit);
}

/** Which SINTA tier is realistic for this topic, based on where the topic is actually published. */
export function recommendSintaLevel(articles, journalRows) {
  const total = articles.length;
  const tiers = [...RANKS, 'Unranked'].map((rank) => {
    const inTier = articles.filter((a) => (a.sintaRank || 'Unranked') === rank);
    const js = journalRows.filter((j) => (j.sintaRank || 'Unranked') === rank);
    const avgConfidence = js.length ? Math.round(js.reduce((s, j) => s + j.confidence, 0) / js.length) : 0;
    return {
      rank,
      articles: inTier.length,
      share: total ? inTier.length / total : 0,
      journals: js.length,
      avgConfidence,
      topJournals: js.slice(0, 3).map((j) => ({ name: j.name, confidence: j.confidence, sintaUrl: j.sintaUrl })),
    };
  });
  const ranked = tiers.filter((t) => t.rank !== 'Unranked' && t.journals > 0);
  if (!ranked.length) return { tiers, primary: null, stretch: null, safe: null };
  const primary = ranked.reduce((a, b) => (b.share * b.avgConfidence > a.share * a.avgConfidence ? b : a));
  const idx = RANKS.indexOf(primary.rank);
  const stretch = ranked.filter((t) => RANKS.indexOf(t.rank) < idx).pop() || null;
  const safe = ranked.find((t) => RANKS.indexOf(t.rank) > idx) || null;
  return { tiers, primary, stretch, safe };
}
