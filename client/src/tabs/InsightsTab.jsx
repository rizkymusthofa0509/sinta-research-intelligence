import { useState } from 'react';
import { FIT_WEIGHTS, RANK_SELECTIVITY } from '../../../shared/insights.js';
import { BarList, Meter } from '../components/Charts.jsx';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { categoryLabel } from '../lib/categories.js';
import { fmt, yearRange } from '../lib/format.js';
import { useJournalLinks } from '../lib/journalProfiles.js';
import ExternalLink from '../components/ExternalLink.jsx';

const TYPE_INFO = {
  application: { label: 'Application', hint: 'Keyword strongly tied to your topic' },
  trend: { label: 'Rising trend', hint: 'Share of recent articles above average' },
  gap: { label: 'Research gap', hint: 'Popular keywords that rarely meet' },
  review: { label: 'Review / bibliometric', hint: 'Enough joint literature to review' },
};

function TitleCard({ t, lang, articlesById, onGenerate, selected }) {
  const [open, setOpen] = useState(false);
  const info = TYPE_INFO[t.type];
  return (
    <article className={`card p-5 transition ${selected ? 'ring-2 ring-brand-400' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-brand-50 px-2 py-0.5 font-semibold text-brand-600">{info.label}</span>
        <span className="text-ink-3">{info.hint}</span>
        <span className="ml-auto text-ink-3 tabular-nums" title="Data score: popularity, trend, novelty and co-occurrence combined (0–100)">
          Data score {t.score}
        </span>
      </div>
      <h3 className="mt-3 font-serif text-lg leading-snug font-semibold">{lang === 'id' ? t.titleId : t.title}</h3>
      <p className="mt-1 text-sm text-ink-3 italic">{lang === 'id' ? t.title : t.titleId}</p>
      <ul className="mt-3 space-y-1 text-sm text-ink-2">
        {t.evidence.map((e) => (
          <li key={e} className="flex gap-2">
            <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-450" />
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {t.keywordNames.map((k) => (
          <span key={k} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
            {k}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary !py-1.5 text-xs" onClick={() => onGenerate(t)}>
          <Icon name="file" className="h-3.5 w-3.5" /> Generate manuscript template
        </button>
        <button className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide' : 'Show'} {t.supportingArticleIds.length} supporting articles
        </button>
      </div>
      {open && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          {t.supportingArticleIds.map((id) => {
            const a = articlesById.get(id);
            if (!a) return null;
            return (
              <li key={id}>
                <ExternalLink href={a.articleUrl || a.garudaUrl} className="text-brand-600 hover:underline">
                  {a.title}
                </ExternalLink>
                <span className="text-ink-3"> · {a.journalName || 'N/A'} · {a.publicationYear || 'N/A'}</span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}

function FitLinks({ j }) {
  const links = useJournalLinks(j, { auto: true });
  return (
    <>
      {links.status === 'loading' && <span className="text-xs text-ink-3">Loading journal links…</span>}
      {links.journalUrl && (
        <ExternalLink className="link-btn" href={links.journalUrl}>
          Journal website / author guidelines <Icon name="external" className="h-3 w-3" />
        </ExternalLink>
      )}
      {links.sintaUrl && (
        <ExternalLink className="link-btn" href={links.sintaUrl}>
          SINTA profile <Icon name="external" className="h-3 w-3" />
        </ExternalLink>
      )}
    </>
  );
}

function FitRow({ j, rank }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3">
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 sm:grid-cols-[1.5rem_minmax(0,1fr)_4rem_10rem]">
        <span className="text-sm text-ink-3 tabular-nums">{rank}</span>
        <div className="min-w-0">
          <button className="block max-w-full truncate text-left font-medium hover:text-brand-600" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {j.name}
          </button>
          <p className="truncate text-xs text-ink-3">
            {j.publisherName || 'Publisher N/A'} · {j.articles} matching article{j.articles === 1 ? '' : 's'} · {yearRange(j.yearMin, j.yearMax)}
          </p>
        </div>
        <span className="hidden text-center sm:block">
          {j.sintaRank ? <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-600">{j.sintaRank}</span> : <span className="text-xs text-ink-3">N/A</span>}
        </span>
        <Meter value={j.confidence} label="Topic-fit confidence" />
      </div>
      {open && (
        <div className="mt-3 ml-9 rounded-xl bg-surface p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-4">
            {[
              ['Relevance', `${j.breakdown.relevance}%`, 'matching articles vs. the top journal (log)'],
              ['Keyword overlap', `${j.breakdown.overlap}%`, 'target keywords found in its articles'],
              ['Recency', `${j.breakdown.recency}%`, 'matching articles from the last 3 years'],
              ['Selectivity', `×${j.breakdown.selectivity}`, `by SINTA rank ${j.sintaRank || 'N/A'}`],
            ].map(([l, v, h]) => (
              <div key={l}>
                <p className="text-xs text-ink-3">{l}</p>
                <p className="font-semibold tabular-nums">{v}</p>
                <p className="text-[11px] text-ink-3">{h}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-2">
            Category: {j.categories.length ? j.categories.map((c) => categoryLabel(c)).join(', ') : 'N/A'} · ISSN {j.issn || 'N/A'} · E-ISSN {j.eissn || 'N/A'}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FitLinks j={j} />
            {j.garudaJournalUrl && (
              <ExternalLink className="link-btn" href={j.garudaJournalUrl}>
                Garuda <Icon name="external" className="h-3 w-3" />
              </ExternalLink>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

export default function InsightsTab({ data, derived, actions, state }) {
  const [lang, setLang] = useState('en');
  if (!data?.articles?.length) {
    return (
      <EmptyState icon="bulb" title="No data yet" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        Title recommendations, SINTA level suggestions and journal fit are computed from the articles of your current search.
      </EmptyState>
    );
  }
  const { titles, journalFit, publisherFit, sintaLevel, filtered, targetKeywordNames } = derived;
  const articlesById = new Map(data.articles.map((a) => [a.id, a]));
  const ranked = journalFit.some((j) => j.sintaRank);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 pt-6 pb-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Insights for “{data.query}”</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Titles, SINTA targets &amp; journal fit</h1>
          <p className="mt-1 text-sm text-ink-2">Computed only from the {fmt(filtered.length)} crawled articles{filtered.length !== data.articles.length ? ' matching your filters' : ''}. Change filters on the Keyword Search tab to recompute.</p>
        </div>
        {state.focusKeyword && (
          <button className="chip" onClick={() => actions.titleIdeasFor(null)}>
            Focus: {state.focusKeyword.name} <Icon name="x" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <section aria-label="Title recommendations">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Recommended research titles</h2>
          <div className="inline-flex rounded-xl border border-line p-0.5 text-sm" role="group" aria-label="Title language">
            {[
              ['en', 'English'],
              ['id', 'Bahasa Indonesia'],
            ].map(([id, l]) => (
              <button key={id} onClick={() => setLang(id)} className={`rounded-lg px-3 py-1 ${lang === id ? 'bg-brand-450 text-white' : 'text-ink-2'}`} aria-pressed={lang === id}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {titles.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {titles.map((t) => (
              <TitleCard key={t.id} t={t} lang={lang} articlesById={articlesById} onGenerate={actions.generateFrom} selected={state.selectedTitle?.id === t.id} />
            ))}
          </div>
        ) : (
          <Notice title="Not enough data for title recommendations">Titles need at least a few recurring keywords. Try a larger “Max articles” value or remove filters.</Notice>
        )}
        <p className="mt-3 text-xs text-ink-3">
          How titles are built: keywords are scored by popularity (log article count), recency lift (share of articles in the last two years vs. the whole set) and co-occurrence. Pairs that
          co-occur far less than expected become “research gap” titles. Selection is diversified: each keyword appears in at most two titles.
        </p>
      </section>

      <section aria-label="SINTA level recommendation">
        <h2 className="mb-4 text-lg font-semibold">Which SINTA level to target</h2>
        {!ranked ? (
          <Notice tone="warning" title="No accreditation ranks found for these journals">
            Ranks come from ARJUNA accreditation decrees (the source of SINTA&apos;s S1–S6). None of the journals in this result set had a current decree, or ARJUNA was unreachable. Journal fit
            below still uses topic relevance, keyword overlap and recency, with a neutral selectivity factor.
          </Notice>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
            <div className="grid gap-3">
              {[
                ['Primary target', sintaLevel.primary, 'Where this topic is most actively published, weighted by fit.'],
                ['Stretch goal', sintaLevel.stretch, 'One tier up: more selective, fewer journals.'],
                ['Safe option', sintaLevel.safe, 'One tier down: broader acceptance of the topic.'],
              ].map(([label, tier, hint]) =>
                tier ? (
                  <div key={label} className="card p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">{label}</p>
                      <p className="text-2xl font-semibold text-brand-600">SINTA {tier.rank.slice(1)}</p>
                    </div>
                    <p className="mt-1 text-sm text-ink-2">
                      {tier.articles} articles ({Math.round(tier.share * 100)}%) in {tier.journals} journals · avg. fit {tier.avgConfidence}%
                    </p>
                    <p className="mt-1 text-xs text-ink-3">{hint}</p>
                  </div>
                ) : null,
              )}
            </div>
            <div className="card p-5">
              <p className="label">Topic articles per SINTA tier</p>
              <BarList rows={sintaLevel.tiers.map((t) => ({ key: t.rank, label: t.rank === 'Unranked' ? 'N/A' : t.rank, value: t.articles }))} total={filtered.length} />
            </div>
          </div>
        )}
      </section>

      <section aria-label="Journal fit">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Journals that fit this topic</h2>
          <p className="text-xs text-ink-3">Target keywords: {targetKeywordNames.join(', ') || 'N/A'}</p>
        </div>
        <Notice title="Topic-fit confidence — not an official acceptance rate">
          No public source publishes acceptance rates, so this percentage estimates how well a journal&apos;s recent output matches your topic: confidence = ({FIT_WEIGHTS.relevance}·relevance +{' '}
          {FIT_WEIGHTS.overlap}·keyword overlap + {FIT_WEIGHTS.recency}·recency) × selectivity, where selectivity is{' '}
          {Object.entries(RANK_SELECTIVITY)
            .map(([r, v]) => `${r === 'Unranked' ? 'N/A' : r} ×${v}`)
            .join(', ')}
          . Click a journal to see its breakdown. Always check the journal&apos;s scope and author guidelines.
        </Notice>
        <div className="card mt-4 px-4 sm:px-5">
          <ul className="divide-y divide-line">
            {journalFit.slice(0, 15).map((j, i) => (
              <FitRow key={j.name} j={j} rank={i + 1} />
            ))}
          </ul>
        </div>
      </section>

      <section aria-label="Publisher fit">
        <h2 className="mb-4 text-lg font-semibold">Publishers to consider</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {publisherFit.slice(0, 12).map((p) => (
            <div key={p.name} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 font-medium">{p.name}</p>
                <span className="shrink-0 text-lg font-semibold text-brand-600 tabular-nums">{p.confidence}%</span>
              </div>
              <p className="mt-1 text-xs text-ink-3">
                {p.journalCount} journal{p.journalCount === 1 ? '' : 's'} · {p.articles} matching articles{p.ranks.length ? ` · ${p.ranks.join(', ')}` : ''}
              </p>
              <p className="mt-2 truncate text-sm text-ink-2" title={p.bestJournal}>
                Best fit: {p.bestJournal}
              </p>
              {p.publisherSintaUrl && (
                <ExternalLink className="link-btn mt-3" href={p.publisherSintaUrl}>
                  SINTA affiliation <Icon name="external" className="h-3 w-3" />
                </ExternalLink>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
