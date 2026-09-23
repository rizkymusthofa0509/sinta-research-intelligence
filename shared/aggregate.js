// Pure aggregation over an in-memory article list. Runs on the server (initial
// response) and in the browser (re-aggregation after filters change, so no
// re-crawl is needed). No I/O, no randomness.

const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);
const top = (map, n) =>
  [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));

export const RANKS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'];

/** Headline numbers for a set of articles. */
export function summarize(articles) {
  const journals = new Set();
  const authors = new Set();
  const publishers = new Set();
  const ranks = new Map();
  const categories = new Map();
  const sources = new Map();
  const years = new Map();
  let yearMin = null;
  let yearMax = null;

  for (const a of articles) {
    if (a.journalName) journals.add(a.journalName.toLowerCase());
    if (a.publisherName) publishers.add(a.publisherName.toLowerCase());
    for (const au of a.authors || []) authors.add(au.toLowerCase());
    inc(ranks, a.sintaRank || 'Unranked');
    if (a.categories?.length) a.categories.forEach((c) => inc(categories, c));
    else inc(categories, 'unknown');
    inc(sources, a.source || 'Unknown');
    if (a.publicationYear) {
      inc(years, a.publicationYear);
      yearMin = yearMin === null ? a.publicationYear : Math.min(yearMin, a.publicationYear);
      yearMax = yearMax === null ? a.publicationYear : Math.max(yearMax, a.publicationYear);
    }
  }

  return {
    articles: articles.length,
    journals: journals.size,
    authors: authors.size,
    publishers: publishers.size,
    yearMin,
    yearMax,
    byRank: Object.fromEntries([...RANKS, 'Unranked'].map((r) => [r, ranks.get(r) || 0])),
    byCategory: Object.fromEntries(categories),
    bySource: Object.fromEntries(sources),
    byYear: Object.fromEntries([...years.entries()].sort((a, b) => a[0] - b[0])),
  };
}

/**
 * Keyword statistics + co-occurrence network.
 * count = number of articles containing the keyword (document frequency).
 * A link's weight = number of articles containing both keywords.
 */
export function aggregateKeywords(articles, labels, { maxKeywords, maxLinks = 180, minLinkWeight = 2, rootKey = null } = {}) {
  // Fewer bubbles for small result sets keeps the map readable (25 → 60).
  const keywordCap = maxKeywords ?? Math.max(25, Math.min(60, Math.round(15 + articles.length * 0.4)));
  const stats = new Map();
  for (const a of articles) {
    for (const k of a.keywordIds || []) {
      let s = stats.get(k);
      if (!s) {
        s = { id: k, count: 0, journals: new Map(), publishers: new Map(), years: new Map(), ranks: new Map(), articleIds: [] };
        stats.set(k, s);
      }
      s.count += 1;
      s.articleIds.push(a.id);
      if (a.journalName) inc(s.journals, a.journalName);
      if (a.publisherName) inc(s.publishers, a.publisherName);
      if (a.publicationYear) inc(s.years, a.publicationYear);
      inc(s.ranks, a.sintaRank || 'Unranked');
    }
  }

  const minCount = articles.length >= 15 ? 2 : 1;
  const ranked = [...stats.values()]
    .filter((s) => s.count >= minCount || s.id === rootKey)
    .sort((a, b) => b.count - a.count || b.id.split(' ').length - a.id.split(' ').length || a.id.localeCompare(b.id))
    .slice(0, keywordCap);
  const selected = new Set(ranked.map((s) => s.id));

  // Co-occurrence among the selected keywords.
  const pairCounts = new Map();
  for (const a of articles) {
    const ks = (a.keywordIds || []).filter((k) => selected.has(k)).sort();
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) inc(pairCounts, `${ks[i]}\u0000${ks[j]}`);
    }
  }
  const countOf = new Map(ranked.map((s) => [s.id, s.count]));
  const allLinks = [...pairCounts.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('\u0000');
      const union = countOf.get(source) + countOf.get(target) - weight;
      return { source, target, weight, jaccard: union ? weight / union : 0 };
    })
    .filter((l) => l.weight >= Math.min(minLinkWeight, articles.length < 15 ? 1 : minLinkWeight));

  const related = new Map();
  for (const l of allLinks) {
    if (!related.has(l.source)) related.set(l.source, []);
    if (!related.has(l.target)) related.set(l.target, []);
    related.get(l.source).push({ id: l.target, weight: l.weight, jaccard: l.jaccard });
    related.get(l.target).push({ id: l.source, weight: l.weight, jaccard: l.jaccard });
  }

  const links = allLinks.sort((a, b) => b.jaccard - a.jaccard || b.weight - a.weight).slice(0, maxLinks);

  const keywords = ranked.map((s) => {
    const years = [...s.years.keys()];
    return {
      id: s.id,
      name: labels?.[s.id] ?? s.id,
      count: s.count,
      journals: s.journals.size,
      publishers: s.publishers.size,
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
      byYear: Object.fromEntries([...s.years.entries()].sort((a, b) => a[0] - b[0])),
      byRank: Object.fromEntries(s.ranks),
      topPublishers: top(s.publishers, 5),
      topJournals: top(s.journals, 5),
      related: (related.get(s.id) || [])
        .sort((a, b) => b.weight - a.weight || b.jaccard - a.jaccard)
        .slice(0, 8)
        .map((r) => ({ id: r.id, name: labels?.[r.id] ?? r.id, weight: r.weight })),
      articleIds: s.articleIds,
      isRoot: s.id === rootKey,
    };
  });

  return { keywords, links };
}

/** Build the full dashboard model from articles. */
export function buildResult(articles, labels, options = {}) {
  const { keywords, links } = aggregateKeywords(articles, labels, options);
  return { summary: summarize(articles), keywords, links };
}

/** Apply dashboard filters in memory. */
export function filterArticles(articles, filters = {}) {
  const { yearFrom, yearTo, rank, publisher, journal, category, source, keyword } = filters;
  return articles.filter((a) => {
    if (yearFrom && (!a.publicationYear || a.publicationYear < yearFrom)) return false;
    if (yearTo && (!a.publicationYear || a.publicationYear > yearTo)) return false;
    if (rank && rank !== 'all') {
      if (rank === 'Unranked' ? a.sintaRank : a.sintaRank !== rank) return false;
    }
    if (publisher && publisher !== 'all' && a.publisherName !== publisher) return false;
    if (journal && journal !== 'all' && a.journalName !== journal) return false;
    if (category && category !== 'all') {
      if (category === 'unknown' ? a.categories?.length : !a.categories?.includes(category)) return false;
    }
    if (source && source !== 'all' && a.source !== source) return false;
    if (keyword && !a.keywordIds?.includes(keyword)) return false;
    return true;
  });
}
