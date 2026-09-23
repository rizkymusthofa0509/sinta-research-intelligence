import { useMemo, useState } from 'react';
import { emergingTopics, heatmap } from '../../../shared/trends.js';
import { YearBars } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { categoryLabel } from '../lib/categories.js';
import { inkOn, sequentialScale, sequentialStops } from '../lib/colorScale.js';
import { fmt } from '../lib/format.js';
import { useTheme } from '../lib/theme.js';

function EmergingTopics({ articles, keywords, onOpen }) {
  const { window: w, topics } = useMemo(() => emergingTopics(articles, keywords), [articles, keywords]);
  return (
    <section aria-label="Emerging topics">
      <h2 className="text-lg font-semibold">Emerging topics</h2>
      {w ? (
        <p className="mt-1 text-sm text-ink-2">
          Keywords whose share of articles grew in {w.recentFrom}–{w.recentTo} ({fmt(w.recentTotal)} articles) compared with {w.earlierFrom}–{w.earlierTo} ({fmt(w.earlierTotal)} articles).
          “New” means no article before {w.recentFrom} in this result set.
        </p>
      ) : null}
      {!topics.length ? (
        <div className="mt-4">
          <Notice title="No emerging topics detected">The result set needs articles from at least two periods and keywords with recent articles. Try a larger “Max articles”.</Notice>
        </div>
      ) : (
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {topics.map((t, i) => (
            <li key={t.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-start justify-between gap-3">
                <button className="min-w-0 text-left font-semibold hover:text-brand-600" onClick={() => onOpen(t.id)} title="Show on the map">
                  <span className="mr-1.5 text-ink-3 tabular-nums">{i + 1}.</span>
                  {t.name}
                </button>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs font-semibold ${t.isNew ? 'bg-brand-450 text-white' : 'bg-brand-50 text-brand-600'}`}>
                  {t.isNew ? 'New' : `×${t.growth.toFixed(1)}`}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-3 tabular-nums">
                {t.recent} recent · {t.earlier} earlier · {t.total} total
              </p>
              <div className="mt-2">
                <YearBars byYear={t.byYear} height={34} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Sources return results ranked by relevance, not a full census, so growth describes the crawled sample. Increase “Max articles” for steadier trends.
      </p>
    </section>
  );
}

const DIMENSIONS = [
  ['year', 'Year'],
  ['rank', 'SINTA level'],
  ['category', 'Category'],
];

function Heatmap({ articles, keywords, onOpen }) {
  const [dimension, setDimension] = useState('year');
  const [rows, setRows] = useState(20);
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const { resolved } = useTheme();
  const data = useMemo(() => heatmap(articles, keywords.filter((k) => !k.isRoot), { dimension, rows }), [articles, keywords, dimension, rows]);
  const color = sequentialScale(resolved, data.max);
  const colLabel = (c) => (dimension === 'category' ? categoryLabel(c) : dimension === 'year' ? `’${c.slice(2)}` : c);

  return (
    <section aria-label="Heatmap">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Heatmap</h2>
          <p className="mt-1 text-sm text-ink-2">Articles per keyword and {DIMENSIONS.find((d) => d[0] === dimension)[1].toLowerCase()}. Darker = more articles. Click a keyword to see it on the map.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line p-0.5 text-sm" role="radiogroup" aria-label="Columns">
            {DIMENSIONS.map(([id, label]) => (
              <button key={id} role="radio" aria-checked={dimension === id} onClick={() => setDimension(id)} className={`rounded-lg px-3 py-1 ${dimension === id ? 'bg-brand-450 text-white' : 'text-ink-2'}`}>
                {label}
              </button>
            ))}
          </div>
          <select className="field !w-auto !py-1 text-sm" value={rows} onChange={(e) => setRows(Number(e.target.value))} aria-label="Rows">
            {[10, 20, 30].map((n) => (
              <option key={n} value={n}>
                Top {n} keywords
              </option>
            ))}
          </select>
          <button className="link-btn" onClick={() => setTable((v) => !v)} aria-expanded={table}>
            <Icon name="table" className="h-3.5 w-3.5" /> {table ? 'Heatmap' : 'Table'}
          </button>
        </div>
      </div>

      {!data.columns.length || !data.rows.length ? (
        <p className="mt-4 text-sm text-ink-3">Not enough data for a heatmap.</p>
      ) : table ? (
        <div className="mt-4 overflow-auto rounded-xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Keyword</th>
                {data.columns.map((c) => (
                  <th key={c} className="px-2 py-2 text-right font-medium">
                    {dimension === 'category' ? categoryLabel(c) : c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, ri) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-1.5">{r.name}</td>
                  {data.cells[ri].map((v, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-right tabular-nums">
                      {v || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-4 overflow-x-auto" onMouseLeave={() => setHover(null)}>
          <div className="inline-grid min-w-full gap-[2px]" style={{ gridTemplateColumns: `minmax(9rem, 14rem) repeat(${data.columns.length}, minmax(2.25rem, 1fr))` }}>
            <div />
            {data.columns.map((c) => (
              <div key={c} className="truncate px-1 pb-1 text-center text-[11px] text-ink-3" title={dimension === 'category' ? categoryLabel(c) : c}>
                {colLabel(c)}
              </div>
            ))}
            {data.rows.map((r, ri) => (
              <div key={r.id} className="contents">
                <button className="truncate pr-2 text-left text-sm text-ink-2 hover:text-brand-600" title={`${r.name} (${r.total})`} onClick={() => onOpen(r.id)}>
                  {r.name}
                </button>
                {data.cells[ri].map((v, ci) => {
                  const fill = color(v);
                  const active = hover && hover.r === ri && hover.c === ci;
                  return (
                    <div
                      key={ci}
                      onMouseEnter={() => setHover({ r: ri, c: ci, v })}
                      className={`flex h-7 items-center justify-center rounded-[4px] text-[11px] tabular-nums ${fill ? '' : 'bg-surface'} ${active ? 'ring-2 ring-ink' : ''}`}
                      style={fill ? { background: fill, color: inkOn(fill) } : undefined}
                    >
                      {v >= data.max * 0.5 ? v : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {hover && (
            <p className="mt-2 text-sm text-ink-2" aria-live="polite">
              <b className="text-ink">{data.rows[hover.r].name}</b> · {dimension === 'category' ? categoryLabel(data.columns[hover.c]) : data.columns[hover.c]}: {fmt(hover.v)} article{hover.v === 1 ? '' : 's'}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-ink-3">
            <span>fewer</span>
            <span className="flex overflow-hidden rounded-sm">
              {sequentialStops(resolved).map((c) => (
                <span key={c} className="h-2.5 w-5" style={{ background: c }} />
              ))}
            </span>
            <span>more articles (max {fmt(data.max)})</span>
          </div>
        </div>
      )}
    </section>
  );
}

export default function TrendsTab({ data, derived, actions }) {
  if (!data?.articles?.length) {
    return (
      <EmptyState icon="trend" title="Trends need a search first" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        Emerging topics and heatmaps are computed from the articles of your current search and follow its filters.
      </EmptyState>
    );
  }
  const { filtered, view } = derived;
  const open = (id) => {
    actions.selectKeyword(id);
    actions.goTab('search');
  };
  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 pt-6 pb-20 sm:px-6">
      <header>
        <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Trends for “{data.query}”</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Emerging topics &amp; heatmap</h1>
        <p className="mt-1 text-sm text-ink-2">From {fmt(filtered.length)} articles{filtered.length !== data.articles.length ? ' (filtered)' : ''}.</p>
      </header>
      <EmergingTopics articles={filtered} keywords={view.keywords} onOpen={open} />
      <Heatmap articles={filtered} keywords={view.keywords} onOpen={open} />
    </div>
  );
}
