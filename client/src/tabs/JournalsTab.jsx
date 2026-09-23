import { useMemo, useState } from 'react';
import { RANKS } from '../../../shared/aggregate.js';
import Icon from '../components/Icon.jsx';
import { EmptyState } from '../components/Notice.jsx';
import { categoryLabel } from '../lib/categories.js';
import { fmt, yearRange } from '../lib/format.js';
import { useJournalLinks } from '../lib/journalProfiles.js';
import ExternalLink from '../components/ExternalLink.jsx';

function Links({ j }) {
  const links = useJournalLinks(j);
  const items = [
    ['Website', links.journalUrl],
    ['SINTA', links.sintaUrl],
    ['Garuda', j.garudaJournalUrl || j.garudaUrl],
  ].filter(([, u]) => u);
  if (!items.length) return <span className="text-xs text-ink-3">Links N/A</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {links.canLoad && (
        <button className="link-btn" onClick={links.load}>
          Load website &amp; SINTA
        </button>
      )}
      {links.status === 'loading' && <span className="text-xs text-ink-3">Loading…</span>}
      {items.map(([l, u]) => (
        <ExternalLink key={l} href={u} className="link-btn">
          {l} <Icon name="external" className="h-3 w-3" />
        </ExternalLink>
      ))}
    </div>
  );
}

export default function JournalsTab({ data, derived, actions }) {
  const [q, setQ] = useState('');
  const [rank, setRank] = useState('all');
  const [category, setCategory] = useState('all');
  const [view, setView] = useState('journals');

  const journals = derived.allJournals;
  const publishers = derived.allPublishers;

  const categories = useMemo(() => [...new Set(journals.flatMap((j) => j.categories))], [journals]);
  const shownJournals = useMemo(
    () =>
      journals.filter(
        (j) =>
          (!q || `${j.name} ${j.publisherName} ${j.issn} ${j.eissn}`.toLowerCase().includes(q.toLowerCase())) &&
          (rank === 'all' || (rank === 'Unranked' ? !j.sintaRank : j.sintaRank === rank)) &&
          (category === 'all' || j.categories.includes(category)),
      ),
    [journals, q, rank, category],
  );
  const shownPublishers = useMemo(() => publishers.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())), [publishers, q]);

  if (!data?.articles?.length) {
    return (
      <EmptyState icon="book" title="No journals yet" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        This tab lists every journal and publisher found in your search, with SINTA rank, category, ISSN and source links.
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 pb-20 sm:px-6">
      <div>
        <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Directory for “{data.query}”</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Journals &amp; publishers</h1>
        <p className="mt-1 text-sm text-ink-2">
          {fmt(journals.length)} journals from {fmt(publishers.length)} publishers appear in the crawled articles. Metadata comes from Garuda&apos;s journal directory and SINTA where available.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="inline-flex rounded-xl border border-line p-0.5 text-sm" role="tablist">
          {[
            ['journals', `Journals (${journals.length})`],
            ['publishers', `Publishers (${publishers.length})`],
          ].map(([id, l]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1.5 ${view === id ? 'bg-brand-450 text-white' : 'text-ink-2'}`}>
              {l}
            </button>
          ))}
        </div>
        <label className="min-w-[14rem] flex-1">
          <span className="label">Search</span>
          <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, publisher or ISSN" />
        </label>
        {view === 'journals' && (
          <>
            <label>
              <span className="label">SINTA</span>
              <select className="field" value={rank} onChange={(e) => setRank(e.target.value)}>
                <option value="all">All</option>
                {RANKS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
                <option value="Unranked">N/A</option>
              </select>
            </label>
            <label>
              <span className="label">Category</span>
              <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="all">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      {view === 'journals' ? (
        <div className="grid gap-3 md:grid-cols-2">
          {shownJournals.map((j) => (
            <article key={j.name} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 leading-snug font-semibold">{j.name}</h3>
                {j.sintaRank ? (
                  <span className="shrink-0 rounded-md bg-brand-50 px-2 py-0.5 text-sm font-semibold text-brand-600">{j.sintaRank}</span>
                ) : (
                  <span className="shrink-0 rounded-md border border-line px-2 py-0.5 text-xs text-ink-3">SINTA N/A</span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-2">{j.publisherName || 'Publisher N/A'}</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-ink-3">Articles here</dt>
                  <dd className="font-semibold tabular-nums">{j.articles}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">Years</dt>
                  <dd className="tabular-nums">{yearRange(j.yearMin, j.yearMax)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-3">ISSN / E-ISSN</dt>
                  <dd className="truncate text-xs tabular-nums">
                    {j.issn || 'N/A'} / {j.eissn || 'N/A'}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {j.categories.map((c) => (
                  <span key={c} className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-ink-2">
                    {categoryLabel(c, { bilingual: true })}
                  </span>
                ))}
                {j.subjectAreas.slice(0, 3).map((s) => (
                  <span key={s} className="rounded-md border border-line px-1.5 py-0.5 text-xs text-ink-3">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Links j={j} />
                <button className="text-xs text-brand-500 hover:underline" onClick={() => actions.filterJournal(j.name)}>
                  Show its articles →
                </button>
              </div>
            </article>
          ))}
          {!shownJournals.length && <p className="text-sm text-ink-2">No journals match.</p>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="bg-surface text-xs text-ink-3 uppercase">
              <tr>
                <th className="px-4 py-2.5 font-medium">Publisher</th>
                <th className="px-4 py-2.5 text-right font-medium">Journals</th>
                <th className="px-4 py-2.5 text-right font-medium">Articles</th>
                <th className="px-4 py-2.5 font-medium">SINTA ranks</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {shownPublishers.map((p) => (
                <tr key={p.name} className="border-t border-line align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-ink-3">{p.journals.map((j) => j.name).join(' · ')}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.journalCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.articles}</td>
                  <td className="px-4 py-2.5">{p.ranks.length ? p.ranks.join(', ') : <span className="text-ink-3">N/A</span>}</td>
                  <td className="px-4 py-2.5">
                    {p.publisherSintaUrl ? (
                      <ExternalLink className="link-btn" href={p.publisherSintaUrl}>
                        SINTA <Icon name="external" className="h-3 w-3" />
                      </ExternalLink>
                    ) : (
                      <span className="text-xs text-ink-3">Garuda</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.topicJournals?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">SINTA journals titled with “{data.query}”</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.topicJournals.map((j) => (
              <article key={j.sintaUrl} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{j.name}</p>
                  {j.sintaRank && <span className="rounded-md bg-brand-50 px-2 py-0.5 text-sm font-semibold text-brand-600">{j.sintaRank}</span>}
                </div>
                <p className="text-sm text-ink-2">{j.publisherName || 'N/A'}</p>
                <div className="mt-3">
                  <Links j={j} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
