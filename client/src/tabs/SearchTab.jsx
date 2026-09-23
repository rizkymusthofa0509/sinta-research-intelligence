import { useEffect, useRef, useState } from 'react';
import { RANKS } from '../../../shared/aggregate.js';
import ArticleList from '../components/ArticleList.jsx';
import BubbleMap from '../components/BubbleMap.jsx';
import { BarList, YearBars } from '../components/Charts.jsx';
import FilterBar from '../components/FilterBar.jsx';
import ExternalLink from '../components/ExternalLink.jsx';
import Icon from '../components/Icon.jsx';
import KeywordOverlay from '../components/KeywordOverlay.jsx';
import { STAGES } from '../components/LoadingStages.jsx';
import Notice from '../components/Notice.jsx';
import SearchPanel from '../components/SearchPanel.jsx';
import { categoryLabel } from '../lib/categories.js';
import { exportCsv, exportJson } from '../lib/export.js';
import { fmt, yearRange } from '../lib/format.js';
import { closeness } from '../lib/similarity.js';

const TOP_INSET = 96; // room for the floating search bar over the map

function useBounds(ref) {
  const [b, setB] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setB({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return b;
}

/** Soft decorative bubbles behind the empty home search. Purely visual. */
function Backdrop() {
  const dots = [
    [12, 22, 90, 0.1], [26, 70, 60, 0.08], [80, 28, 110, 0.09], [70, 76, 70, 0.1], [48, 14, 40, 0.07],
    [90, 60, 44, 0.08], [6, 52, 36, 0.07], [58, 88, 50, 0.07], [36, 40, 26, 0.06], [64, 46, 30, 0.06],
  ];
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
      {dots.map(([x, y, r, o], i) => (
        <circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill="#2a78d6" opacity={o} />
      ))}
    </svg>
  );
}

/** Articles most similar to the query (share of its concepts and key terms they contain). */
function ClosestPapers({ articles, terms }) {
  const score = closeness(articles);
  const semantic = articles.some((a) => a.semantic != null);
  const top = articles
    .map((a) => ({ ...a, match: score(a) }))
    .filter((a) => a.match > 0)
    .sort((a, b) => b.match - a.match || (b.publicationYear || 0) - (a.publicationYear || 0))
    .slice(0, 8);
  if (!top.length) return null;
  return (
    <section aria-label="Closest published papers">
      <h2 className="text-lg font-semibold">Closest published papers to your topic</h2>
      <p className="mt-1 text-sm text-ink-2">
        {semantic
          ? `Ranked by meaning (a local multilingual embedding model compares your query with each title and abstract, across Indonesian and English) combined with your key terms (${terms.join(', ')}).`
          : `Ranked by how many of your key terms (${terms.join(', ')}) they contain, with whole concepts counting most.`}{' '}
        Use them to compare approaches before you write.
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {top.map((a) => (
          <li key={a.id} className="flex gap-3 rounded-2xl border border-line p-4 transition hover:border-brand-200 hover:bg-brand-50/40">
            <span
              className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-600"
              title={a.semantic != null ? `Semantic ${Math.round(a.semantic * 100)}% · key terms ${Math.round((a.relevance ?? 0) * 100)}%` : 'Key-term similarity'}
            >
              <b className="text-sm leading-none tabular-nums">{Math.round(a.match * 100)}%</b>
              <span className="text-[9px] tracking-wide uppercase">match</span>
            </span>
            <div className="min-w-0">
              <ExternalLink href={a.articleUrl || a.garudaUrl} className="line-clamp-2 text-sm font-medium hover:text-brand-600 hover:underline">
                {a.title}
              </ExternalLink>
              <p className="mt-0.5 truncate text-xs text-ink-3">
                {a.journalName || 'N/A'} · {a.publicationYear || 'N/A'} · {a.sintaRank ? `SINTA ${a.sintaRank.slice(1)}` : 'SINTA N/A'}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {a.matchedTerms?.map((t) => (
                  <span key={t} className="rounded bg-muted px-1.5 text-[11px] text-ink-2">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Minimal stage list while the very first page is being fetched. */
function FirstLoad({ progress, elapsed }) {
  const idx = Math.max(0, STAGES.findIndex((s) => s.id === progress?.stage));
  return (
    <div className="flex flex-col items-center text-center" role="status" aria-live="polite">
      <Icon name="loader" className="h-8 w-8 animate-spin text-brand-450" />
      <p className="mt-4 text-lg font-medium">{STAGES[idx]?.label}</p>
      <p className="mt-1 text-sm text-ink-3">
        {progress?.message} · {elapsed}s
      </p>
      <p className="mt-6 max-w-sm text-xs text-ink-3">Bubbles appear as soon as the first articles arrive.</p>
    </div>
  );
}

export default function SearchTab({ state, derived, actions }) {
  const { status, data, error, progress, params, elapsed, filters } = state;
  const { filtered, view, selectedKeyword, listArticles } = derived;
  const stageRef = useRef(null);
  const bounds = useBounds(stageRef);
  const [anchor, setAnchor] = useState(null);
  const [dismissed, setDismissed] = useState([]);

  const hasData = data?.articles?.length > 0;
  const live = status === 'loading' && hasData;
  const firstLoad = status === 'loading' && !hasData;
  const empty = status === 'done' && data && !hasData;
  const rootName = hasData ? data.labels[data.rootKey] || data.analysisQuery || data.query : '';
  const plan = data?.meta?.plan;
  const expanded = plan?.strategy === 'expanded';
  const conceptCounts = new Map();
  if (expanded) for (const a of data.articles) if (a.matchedQuery) conceptCounts.set(a.matchedQuery, (conceptCounts.get(a.matchedQuery) || 0) + 1);

  useEffect(() => setDismissed([]), [data?.query]);

  const select = (id, a) => {
    if (!id || id === selectedKeyword?.id) {
      actions.selectKeyword(null);
      setAnchor(null);
      return;
    }
    actions.selectKeyword(id);
    setAnchor(a ?? null);
  };

  const warnings = (data?.meta?.warnings || []).filter((w) => !dismissed.includes(w));
  const stageLabel = STAGES.find((s) => s.id === progress?.stage)?.label;
  const pct = progress?.total ? Math.min(100, Math.round(((progress.current ?? 0) / progress.total) * 100)) : null;

  return (
    <div>
      {/* Full-bleed stage: the bubble map fills the screen, the search floats on top. */}
      <section
        ref={stageRef}
        className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,var(--stage-glow)_0%,var(--bg)_70%)]"
        style={{ height: 'calc(100svh - var(--header-h, 104px))', minHeight: 480 }}
        aria-label="Topic map"
      >
        {hasData && view.keywords.length > 0 && (
          <BubbleMap
            keywords={view.keywords}
            links={view.links}
            rootKey={data.rootKey}
            selectedId={selectedKeyword?.id ?? null}
            onSelect={select}
            queryLabel={rootName}
            topInset={TOP_INSET}
          />
        )}
        {hasData && !view.keywords.length && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-2">Not enough keywords for a map with the current filters.</p>
        )}

        {status === 'idle' || (!hasData && status !== 'loading') ? (
          <>
            <Backdrop />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
              <SearchPanel initial={params} onSearch={actions.search} variant="hero" />
              {status === 'error' && (
                <div className="mt-6 max-w-lg">
                  <Notice tone="error" title={error?.error === 'SOURCE_UNAVAILABLE' ? 'SINTA source is currently unavailable.' : 'Search failed'}>
                    {error?.error === 'SOURCE_UNAVAILABLE' ? 'Please try again later.' : error?.message}
                  </Notice>
                </div>
              )}
              {empty && (
                <div className="mt-6 max-w-lg text-center">
                  <p className="text-ink-2">No research data found for:</p>
                  <p className="mt-1 text-lg font-medium">“{data.query}”</p>
                  <p className="mt-2 text-sm text-ink-3">
                    {data.meta?.category ? `Nothing in the ${data.meta.category.label} category. Try “All fields” in Options, or ` : 'Try '}a broader or Indonesian keyword.
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="absolute inset-x-0 top-4 z-20 flex flex-col items-center gap-2 px-4">
              <SearchPanel initial={params} onSearch={actions.search} loading={status === 'loading'} onCancel={actions.cancel} variant="floating" />
              {live && (
                <div className="fade-up flex max-w-2xl items-center gap-3 overflow-hidden rounded-full border border-line bg-panel/90 py-1 pr-1 pl-3 text-xs shadow-sm backdrop-blur" role="status" aria-live="polite">
                  <Icon name="loader" className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-450" />
                  <span className="truncate text-ink-2">
                    <b className="font-medium text-ink">{stageLabel}</b> {progress?.message}
                  </span>
                  {pct !== null && (
                    <span className="hidden h-1 w-16 shrink-0 overflow-hidden rounded-full bg-brand-50 sm:block">
                      <span className="block h-full bg-brand-450 transition-all" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                  <button className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-medium text-ink-2 hover:bg-muted-2" onClick={actions.cancel}>
                    Stop &amp; keep
                  </button>
                </div>
              )}
              {expanded && (
                <div className="fade-up flex max-w-2xl flex-wrap items-center gap-1.5 rounded-2xl border border-brand-100 bg-panel/95 px-3 py-1.5 text-xs text-ink-2 shadow-sm backdrop-blur">
                  <Icon name="sparkle" className="h-3.5 w-3.5 shrink-0 text-brand-450" />
                  <span>Looks like a title — also searched its concepts:</span>
                  {plan.concepts
                    .filter((c) => c.kind !== 'full')
                    .map((c) => (
                      <button
                        key={c.query}
                        onClick={() => actions.search({ ...params, q: c.query })}
                        title={`Search only “${c.query}”`}
                        className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-600 hover:bg-brand-100"
                      >
                        {c.query} <span className="tabular-nums opacity-70">{conceptCounts.get(c.query) || 0}</span>
                      </button>
                    ))}
                </div>
              )}
              {warnings.slice(0, 2).map((w) => (
                <div key={w} className="flex max-w-2xl items-start gap-2 rounded-2xl border border-warn-line bg-warn-bg/95 px-3 py-1.5 text-xs text-ink-2 shadow-sm">
                  <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn-ink" />
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Warning: </span>
                    {w}
                  </span>
                  <button onClick={() => setDismissed((d) => [...d, w])} className="shrink-0 text-ink-3 hover:text-ink" aria-label="Dismiss warning">
                    <Icon name="x" className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {firstLoad && (
              <div className="absolute inset-0 flex items-center justify-center px-4">
                <FirstLoad progress={progress} elapsed={elapsed} />
              </div>
            )}

            {hasData && (
              <div className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line bg-panel/90 px-3 py-1.5 text-xs text-ink-2 shadow-sm backdrop-blur tabular-nums">
                <span>
                  <b className="text-sm text-ink">{fmt(view.summary.articles)}</b> articles
                </span>
                <span>
                  <b className="text-sm text-ink">{fmt(view.summary.journals)}</b> journals
                </span>
                <span className="hidden sm:inline">
                  <b className="text-sm text-ink">{fmt(view.summary.authors)}</b> authors
                </span>
                <span className="hidden sm:inline">
                  <b className="text-sm text-ink">{fmt(view.summary.publishers)}</b> publishers
                </span>
                <span>{yearRange(view.summary.yearMin, view.summary.yearMax)}</span>
              </div>
            )}

            {selectedKeyword && (
              <KeywordOverlay
                keyword={selectedKeyword}
                anchor={anchor}
                bounds={bounds}
                articles={listArticles}
                onClose={() => select(null)}
                onSelect={(id) => select(id, null)}
                onTitleIdeas={actions.titleIdeasFor}
                onShowAll={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}
              />
            )}
          </>
        )}
      </section>

      {hasData && (
        <div id="results" className="mx-auto max-w-7xl scroll-mt-28 space-y-6 px-4 pt-8 pb-20 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Results for “{data.query}”</p>
              <p className="mt-1 text-sm text-ink-2">
                {fmt(view.summary.articles)} articles · {fmt(view.summary.journals)} journals · {fmt(view.summary.authors)} authors · {fmt(view.summary.publishers)} publishers ·{' '}
                {yearRange(view.summary.yearMin, view.summary.yearMax)}
                {data.meta?.totalAvailable?.garuda ? ` · Garuda reports ${fmt(data.meta.totalAvailable.garuda)} matching documents` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => exportCsv(listArticles, data.labels, data.query)}>
                <Icon name="download" /> CSV
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  exportJson(
                    {
                      query: data.query,
                      exportedAt: new Date().toISOString(),
                      filters,
                      keywordFilter: selectedKeyword?.name ?? null,
                      summary: view.summary,
                      keywords: view.keywords.map(({ articleIds, ...k }) => k),
                      links: view.links,
                      articles: listArticles,
                      sources: data.meta?.sources,
                    },
                    data.query,
                  )
                }
              >
                <Icon name="download" /> JSON
              </button>
            </div>
          </div>

          {(data.queryTerms?.length >= 2 || filtered.some((a) => a.semantic != null)) && <ClosestPapers articles={filtered} terms={data.queryTerms || []} />}

          {data.meta?.category && (
            <Notice title={`Focus: ${data.meta.category.label}`}>Only articles from journals classified under this subject area (Garuda core subject / SINTA area) are included.</Notice>
          )}

          <FilterBar
            articles={data.articles}
            filters={filters}
            onChange={actions.setFilters}
            activeKeyword={selectedKeyword}
            onClearKeyword={() => select(null)}
            shown={filtered.length}
          />

          <div className="grid gap-6 md:grid-cols-3">
            <section>
              <h3 className="label">Articles per year</h3>
              <div className="mt-3">
                <YearBars byYear={view.summary.byYear} height={96} />
              </div>
            </section>
            <section>
              <h3 className="label">Articles by category</h3>
              <div className="mt-2">
                <BarList
                  rows={Object.entries(view.summary.byCategory || {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([c, n]) => ({ key: c, label: categoryLabel(c), value: n }))}
                  total={view.summary.articles}
                  activeKey={filters.category}
                  onSelect={(c) => actions.setFilters({ ...filters, category: filters.category === c ? 'all' : c })}
                />
              </div>
            </section>
            <section>
              <h3 className="label">Articles by SINTA rank</h3>
              <div className="mt-2">
                <BarList
                  rows={[...RANKS, 'Unranked'].map((r) => ({ key: r, label: r === 'Unranked' ? 'N/A' : r, value: view.summary.byRank?.[r] || 0 }))}
                  total={view.summary.articles}
                  activeKey={filters.rank}
                  onSelect={(r) => actions.setFilters({ ...filters, rank: filters.rank === r ? 'all' : r })}
                />
              </div>
            </section>
          </div>

          <ArticleList
            articles={listArticles}
            labels={data.labels}
            activeKeyword={selectedKeyword?.id}
            onKeyword={(id) => select(id, null)}
            defaultSort={expanded ? 'relevance' : 'newest'}
            title={selectedKeyword ? `Articles about “${selectedKeyword.name}”` : 'Research results'}
          />
        </div>
      )}
    </div>
  );
}
