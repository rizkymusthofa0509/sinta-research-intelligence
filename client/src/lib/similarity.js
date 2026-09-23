/**
 * Closeness of an article to the user's query, 0..1.
 * With the semantic model: 0.6 × semantic similarity (scaled to the best match in the
 * result set) + 0.4 × key-term score. Without it: the key-term score alone.
 */
export function closeness(articles) {
  const maxSemantic = Math.max(0, ...articles.map((a) => a.semantic ?? 0));
  return (a) => {
    const terms = a.relevance ?? 0;
    if (a.semantic == null || !maxSemantic) return terms;
    return Math.round((0.6 * (a.semantic / maxSemantic) + 0.4 * terms) * 100) / 100;
  };
}
