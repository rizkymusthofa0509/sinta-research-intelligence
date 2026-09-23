// Research landscape: group articles into themes and place them on a 2D map.
// Pure functions (deterministic: fixed seed, no Math.random) so results are reproducible.

/** Tiny deterministic PRNG (mulberry32). */
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
const norm = (v) => {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
};

/** Keyword bag-of-words vectors (TF-IDF over keywordIds), used when no embedding model is available. */
export function keywordVectors(articles) {
  const df = new Map();
  for (const a of articles) for (const k of new Set(a.keywordIds || [])) df.set(k, (df.get(k) || 0) + 1);
  const vocab = [...df.entries()].filter(([, n]) => n >= 2).map(([k]) => k);
  const index = new Map(vocab.map((k, i) => [k, i]));
  const N = articles.length;
  return articles.map((a) => {
    const v = new Array(vocab.length).fill(0);
    for (const k of a.keywordIds || []) if (index.has(k)) v[index.get(k)] = Math.log(1 + N / df.get(k));
    return norm(v);
  });
}

/** First two principal components via power iteration (fine for n ≤ ~1000, d ≤ ~1000). */
export function pca2(vectors) {
  const n = vectors.length;
  const d = vectors[0]?.length || 0;
  if (!n || !d) return vectors.map(() => [0, 0]);
  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
  const rand = rng(7);
  const components = [];
  for (let c = 0; c < 2; c++) {
    let w = norm(Array.from({ length: d }, () => rand() - 0.5));
    for (let iter = 0; iter < 60; iter++) {
      // w ← Xᵀ X w, deflated by earlier components
      const scores = X.map((x) => dot(x, w));
      const next = new Array(d).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) next[j] += X[i][j] * scores[i];
      for (const prev of components) {
        const p = dot(next, prev);
        for (let j = 0; j < d; j++) next[j] -= p * prev[j];
      }
      w = norm(next);
    }
    components.push(w);
  }
  return X.map((x) => [dot(x, components[0]), dot(x, components[1])]);
}

/** Cosine k-means with k-means++ seeding (deterministic). Vectors must be L2-normalised. */
export function kmeans(vectors, k, { iterations = 25, seed = 11 } = {}) {
  const n = vectors.length;
  if (n <= k) return { labels: vectors.map((_, i) => i), centroids: vectors.map((v) => [...v]) };
  const rand = rng(seed);
  const centroids = [vectors[Math.floor(rand() * n)]];
  while (centroids.length < k) {
    const dist = vectors.map((v) => Math.min(...centroids.map((c) => 1 - dot(v, c))) ** 2);
    const total = dist.reduce((s, x) => s + x, 0) || 1;
    let r = rand() * total;
    let idx = 0;
    while (idx < n - 1 && (r -= dist[idx]) > 0) idx++;
    centroids.push(vectors[idx]);
  }
  let labels = new Array(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    const next = vectors.map((v) => {
      let best = 0;
      let bestSim = -Infinity;
      centroids.forEach((c, ci) => {
        const s = dot(v, c);
        if (s > bestSim) {
          bestSim = s;
          best = ci;
        }
      });
      return best;
    });
    const changed = next.some((l, i) => l !== labels[i]);
    labels = next;
    for (let ci = 0; ci < k; ci++) {
      const members = vectors.filter((_, i) => labels[i] === ci);
      if (!members.length) continue;
      const sum = new Array(members[0].length).fill(0);
      for (const m of members) for (let j = 0; j < sum.length; j++) sum[j] += m[j];
      centroids[ci] = norm(sum);
    }
    if (!changed && it > 0) break;
  }
  return { labels, centroids };
}

/**
 * Theme layout that stays readable:
 *  1. theme centres = 2D projection of the cluster centroids (similar themes stay near),
 *  2. each theme is a disc sized by its paper count; discs are pushed apart until they
 *     no longer overlap,
 *  3. papers sit inside their disc at their position in the theme's own 2D projection.
 */
function layoutThemes(vectors, labels, centroids, k) {
  const n = vectors.length;
  const members = Array.from({ length: k }, (_, c) => labels.map((l, i) => (l === c ? i : -1)).filter((i) => i >= 0));
  const discs = pca2(centroids).map(([x, y], c) => ({ x, y, r: 0.07 + 0.2 * Math.sqrt(members[c].length / n) }));
  const cxs = discs.map((d) => d.x);
  const cys = discs.map((d) => d.y);
  const midX = (Math.max(...cxs) + Math.min(...cxs)) / 2;
  const midY = (Math.max(...cys) + Math.min(...cys)) / 2;
  const span = Math.max(Math.max(...cxs) - Math.min(...cxs), Math.max(...cys) - Math.min(...cys)) || 1;
  for (const d of discs) {
    d.x = 0.5 + ((d.x - midX) / span) * 0.5;
    d.y = 0.5 + ((d.y - midY) / span) * 0.5;
  }
  for (let iter = 0; iter < 300; iter++) {
    let moved = false;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        const A = discs[a];
        const B = discs[b];
        let dx = B.x - A.x;
        let dy = B.y - A.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
          dx = Math.cos(a + b);
          dy = Math.sin(a + b);
          dist = 1;
        }
        const overlap = A.r + B.r + 0.04 - dist;
        if (overlap > 0) {
          A.x -= (dx / dist) * (overlap / 2);
          A.y -= (dy / dist) * (overlap / 2);
          B.x += (dx / dist) * (overlap / 2);
          B.y += (dy / dist) * (overlap / 2);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  const xy = new Array(n);
  members.forEach((idx, c) => {
    if (!idx.length) return;
    const local = idx.length > 2 ? pca2(idx.map((i) => vectors[i])) : idx.map((_, j) => [j - (idx.length - 1) / 2, 0]);
    const ext = Math.max(...local.flat().map(Math.abs)) || 1;
    idx.forEach((i, j) => {
      xy[i] = [discs[c].x + (local[j][0] / ext) * discs[c].r * 0.85, discs[c].y + (local[j][1] / ext) * discs[c].r * 0.85];
    });
  });
  return xy;
}

/**
 * Build the landscape: themes (clusters) labelled by their most distinctive keywords
 * (class-based TF-IDF: frequent in the theme, rare elsewhere) and 2D positions in [0, 1].
 */
export function buildLandscape(articles, vectors, labelsById, { method }) {
  const n = articles.length;
  if (n < 6) return null;
  const k = Math.max(2, Math.min(8, Math.round(Math.sqrt(n / 3))));
  const { labels, centroids } = kmeans(vectors, k);
  const xy = layoutThemes(vectors, labels, centroids, k);

  // Fit into [0, 1] keeping the aspect ratio.
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0) || 1;
  const sx = (v) => 0.5 + (v - (x0 + x1) / 2) / size;
  const sy = (v) => 0.5 + (v - (y0 + y1) / 2) / size;

  const df = new Map();
  for (const a of articles) for (const kw of new Set(a.keywordIds || [])) df.set(kw, (df.get(kw) || 0) + 1);

  const clusters = [];
  for (let c = 0; c < k; c++) {
    const members = articles.map((a, i) => ({ a, i })).filter(({ i }) => labels[i] === c);
    if (!members.length) continue;
    const tf = new Map();
    for (const { a } of members) for (const kw of new Set(a.keywordIds || [])) tf.set(kw, (tf.get(kw) || 0) + 1);
    const scored = [...tf.entries()]
      .filter(([, t]) => t >= Math.min(2, members.length))
      .map(([kw, t]) => [kw, (t / members.length) * Math.log(1 + n / df.get(kw))])
      .sort((a, b) => b[1] - a[1]);
    const top = scored.slice(0, 5).map(([kw]) => ({ id: kw, name: labelsById[kw] || kw, articles: tf.get(kw) }));
    const years = members.map(({ a }) => a.publicationYear).filter(Boolean);
    clusters.push({
      id: c,
      label: top.slice(0, 2).map((t) => t.name).join(' · ') || `Theme ${c + 1}`,
      keywords: top,
      size: members.length,
      x: members.reduce((s, { i }) => s + sx(xy[i][0]), 0) / members.length,
      y: members.reduce((s, { i }) => s + sy(xy[i][1]), 0) / members.length,
      yearMin: years.length ? Math.min(...years) : null,
      yearMax: years.length ? Math.max(...years) : null,
    });
  }

  return {
    method, // 'embedding' | 'keywords'
    clusters: clusters.sort((a, b) => b.size - a.size),
    points: Object.fromEntries(articles.map((a, i) => [a.id, { x: sx(xy[i][0]), y: sy(xy[i][1]), cluster: labels[i] }])),
  };
}
