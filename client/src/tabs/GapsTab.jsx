import { useMemo, useState } from 'react';
import { combination, liftMatrix, researchGaps } from '../../../shared/trends.js';
import ExternalLink from '../components/ExternalLink.jsx';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { countDocuments } from '../lib/api.js';
import { divergingScale, divergingStops, inkOn } from '../lib/colorScale.js';
import { fmt, yearRange } from '../lib/format.js';
import { useTheme } from '../lib/theme.js';

/** Live check: how many documents Garuda / OpenAlex report for "A B". */
function VerifyButton({ query, scope }) {
  const [state, setState] = useState(null);
  const run = async () => {
    setState({ loading: true });
    try {
      setState({ data: await countDocuments(query, scope) });
    } catch {
      setState({ error: true });
    }
  };
  if (!state)
    return (
      <button className="link-btn" onClick={run} title={`Ask Garuda and OpenAlex how many documents match “${query}”`}>
        <Icon name="search" className="h-3 w-3" /> Verify on sources
      </button>
    );
  if (state.loading) return <span className="text-xs text-ink-3">Checking Garuda & OpenAlex…</span>;
  if (state.error) return <span className="text-xs text-critical">Could not reach the sources</span>;
  const d = state.data;
  return (
    <span className="text-xs text-ink-2" title={`Documents matching “${query}” across each source`}>
      Garuda <b className="tabular-nums">{d.garuda ?? 'N/A'}</b> · OpenAlex{d.scope === 'id' ? ' (ID)' : ''} <b className="tabular-nums">{d.openalex ?? 'N/A'}</b> documents
    </span>
  );
}

function titleFor(names, topic, verdict) {
  const [a, b, c] = names;
  const pair = c ? `${a}, ${b} and ${c}` : `${a} and ${b}`;
  const pairId = c ? `${a}, ${b}, dan ${c}` : `${a} dan ${b}`;
  if (verdict === 'established') {
    return { en: `${pair} in ${topic} Research: A Systematic Literature Review`, id: `${pairId} dalam Riset ${topic}: Tinjauan Literatur Sistematis` };
  }
  return { en: `Integrating ${pair} for ${topic}: A Proposed Framework`, id: `Integrasi ${pairId} untuk ${topic}: Sebuah Kerangka Usulan` };
}

function GapExplorer({ articles, keywords, topic, scope, onTitle, onCombine }) {
  const gaps = useMemo(() => researchGaps(articles, keywords), [articles, keywords]);
  const matrix = useMemo(() => liftMatrix(articles, keywords.filter((k) => !k.isRoot), { size: 12 }), [articles, keywords]);
  const { resolved } = useTheme();
  const color = divergingScale(resolved);
  const [hover, setHover] = useState(null);

  return (
    <section aria-label="Research gap explorer" className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Research gap explorer</h2>
        <p className="mt-1 text-sm text-ink-2">
          Pairs of keywords that are each common in your results but appear together far less than expected if they were unrelated. Expectation is computed within each language
          (Indonesian and English papers separately), so a keyword used only in Indonesian papers and one used only in English papers is not reported as a gap. A low ratio suggests
          an under-explored combination — verify it against the full sources before relying on it.
        </p>
      </div>
      {!gaps.length ? (
        <Notice title="No clear gaps in this result set">Gaps need at least 10 articles and keywords that appear in 3+ articles. Try a larger “Max articles” or fewer filters.</Notice>
      ) : (
        <ol className="grid gap-3 lg:grid-cols-2">
          {gaps.map((g) => (
            <li key={`${g.a.id}|${g.b.id}`} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm text-brand-600">{g.a.name}</span>
                <span className="text-ink-3">+</span>
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-sm text-brand-600">{g.b.name}</span>
                <span className="ml-auto text-xs text-ink-3 tabular-nums" title="Gap score: popularity × (1 − observed/expected)">
                  gap {g.score}
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-2">
                Together in <b className="text-ink tabular-nums">{g.observed}</b> article{g.observed === 1 ? '' : 's'} · expected ≈ <b className="text-ink tabular-nums">{g.expected}</b> (they
                appear in {g.a.count} and {g.b.count} of {fmt(articles.length)} articles).
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <VerifyButton query={`${g.a.name} ${g.b.name}`} scope={scope} />
                <button className="link-btn" onClick={() => onCombine([g.a.id, g.b.id])}>
                  Explore combination
                </button>
                <button className="link-btn" onClick={() => onTitle([g.a, g.b], 'gap', g)}>
                  <Icon name="file" className="h-3 w-3" /> Use as title
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {matrix.keywords.length >= 3 && (
        <div>
          <h3 className="text-sm font-semibold">Co-occurrence vs. expectation</h3>
          <p className="mt-1 text-xs text-ink-3">Each cell: how often two keywords share articles relative to chance. Numbers are the shared-article counts.</p>
          <div className="mt-3 overflow-x-auto" onMouseLeave={() => setHover(null)}>
            <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `minmax(8rem, 12rem) repeat(${matrix.keywords.length}, 2.25rem)` }}>
              <div />
              {matrix.keywords.map((k) => (
                <div key={k.id} className="flex h-24 items-end justify-center pb-1">
                  <span className="origin-bottom-left translate-x-3 -rotate-60 text-[11px] whitespace-nowrap text-ink-3">{k.name.length > 18 ? `${k.name.slice(0, 17)}…` : k.name}</span>
                </div>
              ))}
              {matrix.keywords.map((row, ri) => (
                <div key={row.id} className="contents">
                  <div className="truncate pr-2 text-sm text-ink-2" title={row.name}>
                    {row.name}
                  </div>
                  {matrix.cells[ri].map((cell, ci) => {
                    if (!cell) return <div key={ci} className="h-9 rounded-[4px] bg-surface" />;
                    const fill = color(cell.lift);
                    return (
                      <button
                        key={ci}
                        onMouseEnter={() => setHover({ a: row, b: matrix.keywords[ci], cell })}
                        onFocus={() => setHover({ a: row, b: matrix.keywords[ci], cell })}
                        onClick={() => onCombine([row.id, matrix.keywords[ci].id])}
                        className="flex h-9 items-center justify-center rounded-[4px] text-[11px] tabular-nums"
                        style={{ background: fill, color: inkOn(fill) }}
                        aria-label={`${row.name} and ${matrix.keywords[ci].name}: ${cell.observed} shared, expected ${cell.expected}`}
                      >
                        {cell.observed || ''}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 min-h-5 text-sm text-ink-2" aria-live="polite">
            {hover ? (
              <>
                <b className="text-ink">{hover.a.name}</b> + <b className="text-ink">{hover.b.name}</b>: {hover.cell.observed} shared articles, expected ≈ {hover.cell.expected} (
                {hover.cell.lift === null ? 'N/A' : `${hover.cell.lift}× chance`})
              </>
            ) : (
              'Hover a cell for details; click it to explore that combination.'
            )}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-ink-3">
            <span>rarely together (gap)</span>
            <span className="flex overflow-hidden rounded-sm">
              {divergingStops(resolved).map((c) => (
                <span key={c} className="h-2.5 w-6" style={{ background: c }} />
              ))}
            </span>
            <span>as expected · often together</span>
          </div>
        </div>
      )}
    </section>
  );
}

const VERDICT = {
  untouched: { label: 'Not found together', hint: 'None of the crawled articles combine these keywords — a possible gap. Verify on the full sources.' },
  rare: { label: 'Rare combination', hint: 'They appear together less than half as often as chance would suggest.' },
  emerging: { label: 'Emerging combination', hint: 'A few articles combine them — room for new work.' },
  established: { label: 'Established combination', hint: 'Enough joint literature for a review or a comparative study.' },
};

function Combination({ articles, keywords, topic, scope, picked, setPicked, onTitle }) {
  const pool = keywords.slice(0, 40);
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 3 ? cur : [...cur, id]));
  const result = useMemo(() => (picked.length >= 2 ? combination(articles, picked) : null), [articles, picked]);
  const names = picked.map((id) => keywords.find((k) => k.id === id)?.name || id);

  return (
    <section aria-label="Research topic combination" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Research topic combination</h2>
        <p className="mt-1 text-sm text-ink-2">Pick 2–3 keywords to see how often published work combines them, who publishes it, and whether the combination is open.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pool.map((k) => {
          const on = picked.includes(k.id);
          return (
            <button
              key={k.id}
              onClick={() => toggle(k.id)}
              aria-pressed={on}
              className={`rounded-full px-2.5 py-0.5 text-sm transition ${on ? 'bg-brand-450 text-white' : 'border border-line text-ink-2 hover:border-brand-300'}`}
            >
              {k.name} <span className="tabular-nums opacity-70">{k.count}</span>
            </button>
          );
        })}
      </div>
      {!result ? (
        <p className="text-sm text-ink-3">Select at least two keywords.</p>
      ) : (
        <div className="rounded-2xl border border-line bg-panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">{VERDICT[result.verdict].label}</p>
              <h3 className="mt-1 text-lg font-semibold">{names.join(' + ')}</h3>
              <p className="mt-1 text-sm text-ink-2">{VERDICT[result.verdict].hint}</p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-semibold tabular-nums">{result.observed}</p>
              <p className="text-xs text-ink-3">articles together · expected ≈ {result.expected}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-2">
            Individually: {names.map((n, i) => `${n} ${result.counts[i]}`).join(' · ')} · years {yearRange(result.yearMin, result.yearMax)}
            {result.journals.length ? ` · top journals: ${result.journals.map((j) => `${j.name} (${j.count})`).join(', ')}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VerifyButton query={names.join(' ')} scope={scope} />
            <button
              className="link-btn"
              onClick={() =>
                onTitle(
                  picked.map((id, i) => ({ id, name: names[i] })),
                  result.verdict === 'established' ? 'review' : 'gap',
                  result,
                )
              }
            >
              <Icon name="file" className="h-3 w-3" /> Use as title
            </button>
          </div>
          {result.matches.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {result.matches.slice(0, 12).map((a) => (
                <li key={a.id} className="py-2">
                  <ExternalLink href={a.articleUrl || a.garudaUrl || a.openalexUrl} className="text-sm font-medium hover:text-brand-600 hover:underline">
                    {a.title}
                  </ExternalLink>
                  <p className="text-xs text-ink-3">
                    {a.journalName || 'N/A'} · {a.publicationYear || 'N/A'} · {a.sintaRank ? `SINTA ${a.sintaRank.slice(1)}` : 'SINTA N/A'} · {a.source}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs text-ink-3">{`Suggested titles are built from ${topic ? `“${topic}” and ` : ''}the chosen keywords only; the verdict comes from the crawled articles.`}</p>
    </section>
  );
}

export default function GapsTab({ data, derived, actions, state }) {
  const [picked, setPicked] = useState([]);
  if (!data?.articles?.length) {
    return (
      <EmptyState icon="grid" title="Gaps need a search first" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        The gap explorer and topic combinations are computed from the articles of your current search.
      </EmptyState>
    );
  }
  const { filtered, view } = derived;
  const keywords = view.keywords.filter((k) => !k.isRoot);
  const topic = data.labels?.[data.rootKey] || data.analysisQuery || data.query;
  const scope = state.params?.scope || 'id';

  const useAsTitle = (kws, type, stats) => {
    const names = kws.map((k) => k.name);
    const t = titleFor(names, topic, type === 'review' ? 'established' : 'gap');
    const ids = kws.map((k) => k.id);
    const support = filtered.filter((a) => ids.some((id) => a.keywordIds?.includes(id))).slice(0, 8).map((a) => a.id);
    actions.generateFrom({
      id: `${type}:${ids.join('+')}`,
      type,
      title: t.en,
      titleId: t.id,
      keywordIds: [...ids, ...(data.rootKey ? [data.rootKey] : [])],
      keywordNames: [...names, ...(data.rootKey ? [topic] : [])],
      score: null,
      evidence: [`${names.join(' + ')}: ${stats.observed} articles together in the crawled set (≈${stats.expected} expected if unrelated).`],
      supportingArticleIds: support,
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-12 px-4 pt-6 pb-20 sm:px-6">
      <header>
        <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Gaps for “{data.query}”</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Research gaps &amp; topic combinations</h1>
        <p className="mt-1 text-sm text-ink-2">From {fmt(filtered.length)} articles{filtered.length !== data.articles.length ? ' (filtered)' : ''}.</p>
      </header>
      <GapExplorer
        articles={filtered}
        keywords={view.keywords}
        topic={topic}
        scope={scope}
        onTitle={useAsTitle}
        onCombine={(ids) => {
          setPicked(ids);
          document.getElementById('combination')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />
      <div id="combination" className="scroll-mt-32">
        <Combination articles={filtered} keywords={keywords} topic={topic} scope={scope} picked={picked} setPicked={setPicked} onTitle={useAsTitle} />
      </div>
    </div>
  );
}
