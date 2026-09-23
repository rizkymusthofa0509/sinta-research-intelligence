import { useMemo } from 'react';
import { RANKS } from '../../../shared/aggregate.js';
import { categoryLabel } from '../lib/categories.js';
import Icon from './Icon.jsx';

export const EMPTY_FILTERS = { yearFrom: '', yearTo: '', rank: 'all', category: 'all', publisher: 'all', journal: 'all', source: 'all' };

function optionsFrom(articles, key) {
  const counts = new Map();
  for (const a of articles) {
    const v = a[key];
    if (v) counts.set(v, (counts.get(v) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** In-memory filters. Changing them re-aggregates the map without re-crawling. */
export default function FilterBar({ articles, filters, onChange, activeKeyword, onClearKeyword, shown }) {
  const years = useMemo(() => [...new Set(articles.map((a) => a.publicationYear).filter(Boolean))].sort((a, b) => a - b), [articles]);
  const publishers = useMemo(() => optionsFrom(articles, 'publisherName'), [articles]);
  const journals = useMemo(() => optionsFrom(articles, 'journalName'), [articles]);
  const sources = useMemo(() => optionsFrom(articles, 'source'), [articles]);
  const categories = useMemo(() => {
    const counts = new Map();
    for (const a of articles) (a.categories?.length ? a.categories : ['unknown']).forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [articles]);
  const rankCounts = useMemo(() => {
    const m = new Map();
    for (const a of articles) m.set(a.sintaRank || 'Unranked', (m.get(a.sintaRank || 'Unranked') || 0) + 1);
    return m;
  }, [articles]);

  const set = (patch) => onChange({ ...filters, ...patch });
  const active = Object.entries(filters).some(([k, v]) => v !== EMPTY_FILTERS[k]) || activeKeyword;

  return (
    <section className="card p-4 sm:p-5" aria-label="Filters">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="filter" className="h-4 w-4 text-ink-3" /> Filter results
          <span className="font-normal text-ink-3">· {shown} shown · no re-crawl needed</span>
        </h2>
        {active && (
          <button
            className="text-sm text-brand-500 hover:underline"
            onClick={() => {
              onChange(EMPTY_FILTERS);
              onClearKeyword();
            }}
          >
            Reset all
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <label>
          <span className="label">Year from</span>
          <select className="field" value={filters.yearFrom} onChange={(e) => set({ yearFrom: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Year to</span>
          <select className="field" value={filters.yearTo} onChange={(e) => set({ yearTo: e.target.value ? Number(e.target.value) : '' })}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">SINTA</span>
          <select className="field" value={filters.rank} onChange={(e) => set({ rank: e.target.value })}>
            <option value="all">All</option>
            {RANKS.map((r) => (
              <option key={r} value={r} disabled={!rankCounts.get(r)}>
                {r} ({rankCounts.get(r) || 0})
              </option>
            ))}
            <option value="Unranked">N/A ({rankCounts.get('Unranked') || 0})</option>
          </select>
        </label>
        <label>
          <span className="label">Category</span>
          <select className="field" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="all">All</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {categoryLabel(c)} ({n})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Publisher</span>
          <select className="field" value={filters.publisher} onChange={(e) => set({ publisher: e.target.value })}>
            <option value="all">All ({publishers.length})</option>
            {publishers.map(([p, n]) => (
              <option key={p} value={p}>
                {p.length > 48 ? `${p.slice(0, 46)}…` : p} ({n})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Journal</span>
          <select className="field" value={filters.journal} onChange={(e) => set({ journal: e.target.value })}>
            <option value="all">All ({journals.length})</option>
            {journals.map(([j, n]) => (
              <option key={j} value={j}>
                {j.length > 48 ? `${j.slice(0, 46)}…` : j} ({n})
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Source</span>
          <select className="field" value={filters.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="all">All</option>
            {sources.map(([s, n]) => (
              <option key={s} value={s}>
                {s} ({n})
              </option>
            ))}
          </select>
        </label>
      </div>
      {activeKeyword && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-ink-3">Articles filtered by keyword:</span>
          <button onClick={onClearKeyword} className="inline-flex items-center gap-1 rounded-full bg-brand-450 px-3 py-0.5 text-white hover:bg-brand-550">
            {activeKeyword.name} <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </section>
  );
}
