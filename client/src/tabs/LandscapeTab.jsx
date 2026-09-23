import { polygonHull } from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import ExternalLink from '../components/ExternalLink.jsx';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { fmt, yearRange } from '../lib/format.js';
import { closeness } from '../lib/similarity.js';

/** Width of an element that may mount later (re-measures when `mountKey` changes). */
function useWidth(ref, mountKey) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref, mountKey]);
  return w;
}

/** Pad a hull outward from its centroid so points sit inside the outline. */
function paddedHull(points, pad) {
  if (points.length < 3) return null;
  const hull = polygonHull(points);
  if (!hull) return null;
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * pad, y + (dy / d) * pad];
  });
}

export default function LandscapeTab({ data, derived, actions }) {
  const wrapRef = useRef(null);
  const landscape = data?.landscape;
  const width = useWidth(wrapRef, Boolean(landscape));
  const [selected, setSelected] = useState(null);
  const [hover, setHover] = useState(null);

  const { filtered } = derived;
  const visible = useMemo(() => new Set(filtered.map((a) => a.id)), [filtered]);
  const score = useMemo(() => closeness(filtered), [filtered]);

  if (!data?.articles?.length) {
    return (
      <EmptyState icon="scatter" title="The landscape needs a search first" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        Papers are placed by meaning: similar papers end up close together and form themes.
      </EmptyState>
    );
  }
  if (!landscape) {
    return (
      <EmptyState icon="scatter" title={data.meta?.live ? 'The landscape is built when crawling finishes' : 'Not enough articles for a landscape'}>
        {data.meta?.live ? 'Keep this tab open — it appears as soon as the search completes.' : 'At least 6 articles are needed.'}
      </EmptyState>
    );
  }

  const H = Math.max(420, Math.min(680, width * 0.62));
  const pad = 36;
  const px = (x) => pad + x * (width - pad * 2);
  const py = (y) => pad + y * (H - pad * 2);
  const byId = new Map(data.articles.map((a) => [a.id, a]));
  const points = Object.entries(landscape.points)
    .filter(([id]) => visible.has(id))
    .map(([id, p]) => ({ id, a: byId.get(id), x: px(p.x), y: py(p.y), cluster: p.cluster }))
    .filter((p) => p.a);
  const clusterPoints = new Map();
  for (const p of points) {
    if (!clusterPoints.has(p.cluster)) clusterPoints.set(p.cluster, []);
    clusterPoints.get(p.cluster).push(p);
  }
  const selectedCluster = landscape.clusters.find((c) => c.id === selected) || null;
  const selectedArticles = selectedCluster
    ? (clusterPoints.get(selectedCluster.id) || []).map((p) => p.a).sort((a, b) => score(b) - score(a))
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 pb-20 sm:px-6">
      <header>
        <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Research landscape for “{data.query}”</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Themes in the literature</h1>
        <p className="mt-1 text-sm text-ink-2">
          Each dot is a paper; papers with similar {landscape.method === 'embedding' ? 'meaning (local multilingual embeddings of title + abstract)' : 'keywords'} sit close together and
          form themes. Larger dots are closer to your query. Themes are named by their most distinctive keywords.
        </p>
      </header>
      {landscape.method !== 'embedding' && (
        <Notice tone="warning" title="Built from keywords, not meaning">The local semantic model was not available for this search, so themes are grouped by shared keywords.</Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div ref={wrapRef} className="relative rounded-2xl border border-line bg-panel" style={{ height: H }}>
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label="Research landscape scatter plot" onClick={(e) => e.target.tagName === 'svg' && setSelected(null)}>
              {landscape.clusters.map((c) => {
                const pts = (clusterPoints.get(c.id) || []).map((p) => [p.x, p.y]);
                const hull = paddedHull(pts, 14);
                const active = selected === c.id;
                const dim = selected !== null && !active;
                return hull ? (
                  <path
                    key={`h${c.id}`}
                    d={`M${hull.map((p) => p.join(',')).join('L')}Z`}
                    strokeWidth={active ? 2 : 1.5}
                    strokeLinejoin="round"
                    opacity={dim ? 0.4 : 1}
                    style={{ cursor: 'pointer', fill: active ? 'var(--brand-50)' : 'transparent', stroke: active ? 'var(--brand-450)' : 'var(--line)' }}
                    onClick={() => setSelected(active ? null : c.id)}
                  />
                ) : null;
              })}
              {points.map((p) => {
                const inSel = selected === null || p.cluster === selected;
                const r = 3 + 6 * score(p.a);
                return (
                  <circle
                    key={p.id}
                    cx={p.x}
                    cy={p.y}
                    r={r}
                    fillOpacity={inSel ? 0.75 : 0.25}
                    strokeWidth={1}
                    style={{ cursor: 'pointer', fill: inSel ? 'var(--brand-450)' : 'var(--ink-3)', stroke: 'var(--panel)' }}
                    onMouseEnter={() => setHover(p)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => {
                      const url = p.a.articleUrl || p.a.garudaUrl || p.a.openalexUrl;
                      const w = url ? window.open(url, '_blank') : null;
                      if (w) w.opener = null;
                    }}
                  />
                );
              })}
              {landscape.clusters.map((c) => {
                const pts = clusterPoints.get(c.id) || [];
                if (!pts.length) return null;
                const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
                const top = Math.min(...pts.map((p) => p.y));
                const dim = selected !== null && selected !== c.id;
                const text = c.label.length > 34 ? `${c.label.slice(0, 33)}…` : c.label;
                const half = text.length * 3.7 + 6; // ≈ half the rendered width at 13px
                return (
                  <text
                    key={`l${c.id}`}
                    x={Math.min(Math.max(cx, half), width - half)}
                    y={Math.max(top - 20, 16)}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={600}
                    style={{ fill: 'var(--ink)', stroke: 'var(--panel)', strokeWidth: 4, paintOrder: 'stroke', cursor: 'pointer' }}
                    opacity={dim ? 0.35 : 1}
                    onClick={() => setSelected(selected === c.id ? null : c.id)}
                  >
                    {text}
                  </text>
                );
              })}
            </svg>
          )}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 max-w-xs rounded-xl border border-line bg-panel px-3 py-2 text-sm shadow-lg"
              style={{ left: Math.min(hover.x + 12, width - 280), top: Math.max(8, hover.y - 12) }}
            >
              <p className="line-clamp-2 font-medium">{hover.a.title}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {hover.a.journalName || 'N/A'} · {hover.a.publicationYear || 'N/A'} · {hover.a.source}
              </p>
              {hover.a.semantic != null && <p className="mt-0.5 text-xs text-brand-500">Semantic similarity to your query: {Math.round(hover.a.semantic * 100)}%</p>}
              <p className="mt-0.5 text-xs text-ink-3">Click to open the paper</p>
            </div>
          )}
        </div>

        <aside className="space-y-2" aria-label="Themes">
          <p className="label">Themes ({landscape.clusters.length})</p>
          {landscape.clusters.map((c) => {
            const shown = (clusterPoints.get(c.id) || []).length;
            const active = selected === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(active ? null : c.id)}
                aria-pressed={active}
                className={`w-full rounded-2xl border p-3 text-left transition ${active ? 'border-brand-450 bg-brand-50' : 'border-line bg-panel hover:border-brand-300'}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="shrink-0 text-xs text-ink-3 tabular-nums">{shown} papers</span>
                </div>
                <p className="mt-1 text-xs text-ink-3">
                  {c.keywords.slice(0, 5).map((k) => k.name).join(' · ')} · {yearRange(c.yearMin, c.yearMax)}
                </p>
              </button>
            );
          })}
        </aside>
      </div>

      {selectedCluster && (
        <section aria-label={`Papers in ${selectedCluster.label}`}>
          <h2 className="text-lg font-semibold">
            {selectedCluster.label} <span className="text-sm font-normal text-ink-3">· {fmt(selectedArticles.length)} papers, closest to your query first</span>
          </h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {selectedArticles.slice(0, 20).map((a) => (
              <li key={a.id} className="rounded-xl border border-line bg-panel p-3">
                <ExternalLink href={a.articleUrl || a.garudaUrl || a.openalexUrl} className="line-clamp-2 text-sm font-medium hover:text-brand-600 hover:underline">
                  {a.title}
                </ExternalLink>
                <p className="mt-0.5 text-xs text-ink-3">
                  {a.journalName || 'N/A'} · {a.publicationYear || 'N/A'} · {a.sintaRank ? `SINTA ${a.sintaRank.slice(1)}` : 'SINTA N/A'} · {a.source}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="flex items-center gap-1.5 text-xs text-ink-3">
        <Icon name="info" className="h-3.5 w-3.5" /> Positions come from a 2D projection (PCA) of the paper vectors; distances are approximate. Themes: k-means on the same vectors.
      </p>
    </div>
  );
}
