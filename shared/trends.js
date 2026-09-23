// Trend and gap analytics over the in-memory result set. Pure, deterministic,
// and computed from the crawled articles only.

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

// Very small language guess (Indonesian vs other) from function words in title + abstract.
const ID_WORDS = new Set('yang dan di dengan untuk pada dari dalam ini itu adalah terhadap sebagai oleh atau serta berbasis menggunakan penelitian'.split(' '));
const EN_WORDS = new Set('the of and in for with on from this that is are by as using based study research to an'.split(' '));
const langCache = new WeakMap();
export function articleLanguage(a) {
  if (langCache.has(a)) return langCache.get(a);
  const words = `${a.title || ''} ${(a.abstract || '').slice(0, 400)}`.toLowerCase().match(/\p{L}+/gu) || [];
  let id = 0;
  let en = 0;
  for (const w of words) {
    if (ID_WORDS.has(w)) id += 1;
    else if (EN_WORDS.has(w)) en += 1;
  }
  const lang = id > en ? 'id' : 'en';
  langCache.set(a, lang);
  return lang;
}

/**
 * Expected co-occurrence of keyword sets if they were unrelated, computed within each
 * language: an English-only keyword and an Indonesian-only keyword are expected to
 * meet ~0 times, so their absence together is not reported as a research gap.
 */
function expectedTogether(articles, ids) {
  const groups = new Map();
  for (const a of articles) {
    const l = articleLanguage(a);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l).push(a);
  }
  let expected = 0;
  for (const group of groups.values()) {
    const n = group.length;
    const p = ids.reduce((acc, id) => acc * (group.filter((a) => a.keywordIds?.includes(id)).length / n), 1);
    expected += p * n;
  }
  return expected;
}

function yearsOf(articles) {
  const ys = articles.map((a) => a.publicationYear).filter(Boolean);
  return ys.length ? { min: Math.min(...ys), max: Math.max(...ys) } : null;
}

/**
 * Emerging topics: keywords whose share of recent articles grows faster than the corpus.
 *   recent window  = last `window` years present in the data (default 2)
 *   earlier window = the `window` years before that
 *   growth         = (recent share of the keyword) / (earlier share), with +1 smoothing
 * "New" = the keyword has no article before the recent window.
 * Note: sources return results by relevance, not as a census, so this describes the
 * crawled sample; the UI states that.
 */
export function emergingTopics(articles, keywords, { window = 2, minRecent = 2, limit = 15 } = {}) {
  const y = yearsOf(articles);
  if (!y || y.max - y.min < 1) return { window: null, topics: [] };
  const recentFrom = y.max - window + 1;
  const earlierFrom = recentFrom - window;
  const recentTotal = articles.filter((a) => a.publicationYear >= recentFrom).length;
  const earlierTotal = articles.filter((a) => a.publicationYear >= earlierFrom && a.publicationYear < recentFrom).length;
  if (!recentTotal) return { window: null, topics: [] };

  const topics = [];
  for (const k of keywords) {
    if (k.isRoot) continue;
    let recent = 0;
    let earlier = 0;
    let before = 0;
    for (const [yr, c] of Object.entries(k.byYear || {})) {
      const year = Number(yr);
      if (year >= recentFrom) recent += c;
      else if (year >= earlierFrom) earlier += c;
      if (year < recentFrom) before += c;
    }
    if (recent < minRecent) continue;
    const recentShare = recent / recentTotal;
    const earlierShare = (earlier + 1) / (earlierTotal + 1);
    const growth = recentShare / earlierShare;
    topics.push({
      id: k.id,
      name: k.name,
      recent,
      earlier,
      total: k.count,
      isNew: before === 0,
      growth: Math.round(growth * 100) / 100,
      score: Math.log(1 + recent) * (before === 0 ? growth * 1.25 : growth),
      byYear: k.byYear,
    });
  }
  topics.sort((a, b) => b.score - a.score);
  return {
    window: { recentFrom, recentTo: y.max, earlierFrom, earlierTo: recentFrom - 1, recentTotal, earlierTotal },
    topics: topics.filter((t) => t.isNew || t.growth > 1.1).slice(0, limit),
  };
}

/**
 * Heatmap matrix: rows = top keywords, columns = years | SINTA ranks | categories.
 * Returns { rows, columns, cells[r][c] = count, max }.
 */
export function heatmap(articles, keywords, { dimension = 'year', rows = 20 } = {}) {
  const top = keywords.slice(0, rows);
  let columns;
  let colOf;
  if (dimension === 'year') {
    const y = yearsOf(articles);
    columns = [];
    if (y) for (let yr = Math.max(y.min, y.max - 11); yr <= y.max; yr++) columns.push(String(yr));
    colOf = (a) => (a.publicationYear ? [String(a.publicationYear)] : []);
  } else if (dimension === 'rank') {
    columns = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'N/A'];
    colOf = (a) => [a.sintaRank || 'N/A'];
  } else {
    const cats = new Map();
    for (const a of articles) for (const c of a.categories?.length ? a.categories : ['unknown']) cats.set(c, (cats.get(c) || 0) + 1);
    columns = [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    colOf = (a) => (a.categories?.length ? a.categories : ['unknown']);
  }
  const colIndex = new Map(columns.map((c, i) => [c, i]));
  const rowIndex = new Map(top.map((k, i) => [k.id, i]));
  const cells = top.map(() => new Array(columns.length).fill(0));
  for (const a of articles) {
    const cols = colOf(a).filter((c) => colIndex.has(c));
    for (const kid of a.keywordIds || []) {
      const r = rowIndex.get(kid);
      if (r === undefined) continue;
      for (const c of cols) cells[r][colIndex.get(c)] += 1;
    }
  }
  const max = Math.max(1, ...cells.flat());
  return { rows: top.map((k) => ({ id: k.id, name: k.name, total: k.count })), columns, cells, max };
}

function pairCounter(articles, ids) {
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
  return (x, y) => pairs.get(x < y ? `${x}|${y}` : `${y}|${x}`) || 0;
}

/**
 * Research gaps: pairs of keywords that are each common but co-occur much less than
 * expected if they were independent (lift = observed / expected).
 *   expected = Σ over languages of count_l(A) · count_l(B) / N_l   (see expectedTogether)
 *   gapScore = popularity × (1 − lift), popularity = √(share A · share B)
 */
export function researchGaps(articles, keywords, { top = 20, limit = 20 } = {}) {
  const N = articles.length;
  if (N < 10) return [];
  const pool = keywords.filter((k) => !k.isRoot && k.count >= 3).slice(0, top);
  const co = pairCounter(articles, pool.map((k) => k.id));
  const gaps = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const A = pool[i];
      const B = pool[j];
      if (A.id.includes(B.id) || B.id.includes(A.id)) continue;
      const observed = co(A.id, B.id);
      const expected = expectedTogether(articles, [A.id, B.id]);
      if (expected < 1) continue;
      const lift = observed / expected;
      if (lift >= 0.5) continue;
      const popularity = Math.sqrt((A.count / N) * (B.count / N));
      gaps.push({
        a: { id: A.id, name: A.name, count: A.count },
        b: { id: B.id, name: B.name, count: B.count },
        observed,
        expected: Math.round(expected * 10) / 10,
        lift: Math.round(lift * 100) / 100,
        score: Math.round(popularity * (1 - clamp(lift)) * 1000) / 10,
      });
    }
  }
  return gaps.sort((x, y) => y.score - x.score).slice(0, limit);
}

/** Pairwise lift matrix for the gap-explorer grid. */
export function liftMatrix(articles, keywords, { size = 12 } = {}) {
  const pool = keywords.filter((k) => !k.isRoot).slice(0, size);
  const co = pairCounter(articles, pool.map((k) => k.id));
  const cells = pool.map((A) =>
    pool.map((B) => {
      if (A.id === B.id) return null;
      const observed = co(A.id, B.id);
      const expected = expectedTogether(articles, [A.id, B.id]);
      return { observed, expected: Math.round(expected * 10) / 10, lift: expected >= 0.5 ? Math.round((observed / expected) * 100) / 100 : null };
    }),
  );
  return { keywords: pool.map((k) => ({ id: k.id, name: k.name, count: k.count })), cells };
}

/**
 * Topic combination: articles containing ALL chosen keywords, with how unusual the
 * combination is relative to independence.
 */
export function combination(articles, ids) {
  const N = articles.length;
  const counts = ids.map((id) => articles.filter((a) => a.keywordIds?.includes(id)).length);
  const matches = articles.filter((a) => ids.every((id) => a.keywordIds?.includes(id)));
  const expected = N ? expectedTogether(articles, ids) : 0;
  const years = matches.map((a) => a.publicationYear).filter(Boolean);
  const journals = new Map();
  for (const a of matches) if (a.journalName) journals.set(a.journalName, (journals.get(a.journalName) || 0) + 1);
  let verdict;
  if (!matches.length) verdict = 'untouched';
  else if (expected && matches.length / expected < 0.5) verdict = 'rare';
  else if (matches.length >= 5) verdict = 'established';
  else verdict = 'emerging';
  return {
    ids,
    counts,
    matches,
    observed: matches.length,
    expected: Math.round(expected * 10) / 10,
    lift: expected ? Math.round((matches.length / expected) * 100) / 100 : null,
    yearMin: years.length ? Math.min(...years) : null,
    yearMax: years.length ? Math.max(...years) : null,
    journals: [...journals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    verdict,
  };
}
