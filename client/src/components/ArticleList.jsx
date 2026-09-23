import { useEffect, useMemo, useState } from 'react';
import { categoryLabel } from '../lib/categories.js';
import { fmt, hostname } from '../lib/format.js';
import { useJournalLinks } from '../lib/journalProfiles.js';
import { closeness } from '../lib/similarity.js';
import Icon from './Icon.jsx';
import ExternalLink from './ExternalLink.jsx';

const PAGE = 20;

function RankBadge({ rank }) {
  if (!rank) {
    return (
      <span className="rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-3" title="SINTA rank not available from the crawled sources">
        SINTA N/A
      </span>
    );
  }
  return <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-semibold text-brand-600">SINTA {rank}</span>;
}

function ExtLink({ href, children }) {
  if (!href) return null;
  return (
    <ExternalLink href={href} className="link-btn">
      {children} <Icon name="external" className="h-3 w-3" />
    </ExternalLink>
  );
}

const SOURCE_FIELDS = [
  ['source', 'Source', null],
  ['publisherName', 'Publisher', null],
  ['journalName', 'Journal', null],
  ['issue', 'Issue', null],
  ['sintaRank', 'SINTA rank', null],
  ['accreditation', 'Accreditation decree', (v) => `${v.grade}${v.expired ? ' (expired)' : ''} · SK ${v.decree || 'N/A'} · ${v.decreeDate || 'N/A'}`],
  ['categories', 'Category', (v) => v.map((c) => categoryLabel(c, { bilingual: true })).join(', ')],
  ['issn', 'ISSN', null],
  ['eissn', 'E-ISSN', null],
  ['journalUrl', 'Journal website', 'url'],
  ['sintaUrl', 'SINTA URL', 'url'],
  ['garudaUrl', 'Garuda record', 'url'],
  ['openalexUrl', 'OpenAlex record', 'url'],
  ['topic', 'OpenAlex topic', (v) => [v.name, v.field].filter(Boolean).join(' · ')],
  ['doiUrl', 'DOI', 'url'],
  ['articleUrl', 'Article URL', 'url'],
];

function SourceDetails({ a: article }) {
  // Opening the panel fetches missing journal links (website, SINTA URL) from Garuda.
  const links = useJournalLinks(article, { auto: true });
  const a = { ...article, journalUrl: links.journalUrl, sintaUrl: links.sintaUrl };
  const loaded = { journalUrl: !article.journalUrl && links.journalUrl, sintaUrl: !article.sintaUrl && links.sintaUrl };
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-2 rounded-xl bg-surface p-4 text-sm sm:grid-cols-2">
      {SOURCE_FIELDS.map(([key, label, render]) => {
        const v = a[key];
        const empty = v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
        const provenanceKey = key === 'doiUrl' ? 'doi' : key === 'accreditation' ? 'sintaRank' : key;
        return (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-ink-3">
              {label}
              {!empty && (loaded[key] ? true : a.provenance?.[provenanceKey]) && key !== 'source' && (
                <span className="ml-1 text-[11px] text-ink-3/80">· via {loaded[key] ? 'Garuda journal profile' : a.provenance[provenanceKey]}</span>
              )}
            </dt>
            <dd className="truncate">
              {empty ? (
                <span className="text-ink-3">{links.status === 'loading' && (key === 'journalUrl' || key === 'sintaUrl') ? 'Loading…' : 'N/A'}</span>
              ) : render === 'url' ? (
                <ExternalLink href={v} className="text-brand-500 hover:underline" title={v}>
                  {v}
                </ExternalLink>
              ) : typeof render === 'function' ? (
                render(v)
              ) : (
                String(v)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ArticleCard({ a, labels, onKeyword, activeKeyword }) {
  const [open, setOpen] = useState(false);
  const links = useJournalLinks(a);
  const [showAbstract, setShowAbstract] = useState(false);
  const kws = (a.keywordIds || []).slice(0, 8);
  return (
    <article className="card p-5 transition hover:shadow-[0_2px_4px_var(--shadow),0_12px_28px_var(--shadow)]">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <RankBadge rank={a.sintaRank} />
        {a.publicationYear && <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-ink-2">{a.publicationYear}</span>}
        {a.categories?.map((c) => (
          <span key={c} className="rounded-md border border-line px-1.5 py-0.5 text-ink-2">
            {categoryLabel(c)}
          </span>
        ))}
        <span className="ml-auto text-ink-3">
          Source: <b className="font-medium text-ink-2">{a.source}</b>
          {a.alsoFoundIn?.length ? ` + ${a.alsoFoundIn.join(', ')}` : ''}
        </span>
      </div>
      <h3 className="mt-2 text-[17px] leading-snug font-semibold">
        {a.articleUrl ? (
          <ExternalLink href={a.articleUrl} className="hover:text-brand-600 hover:underline">
            {a.title}
          </ExternalLink>
        ) : (
          a.title
        )}
      </h3>
      <p className="mt-1 text-sm text-ink-2">{a.authors?.length ? a.authors.join(', ') : <span className="text-ink-3">Authors: N/A</span>}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="inline text-ink-3">Journal: </dt>
          <dd className="inline">{a.journalName || 'N/A'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="inline text-ink-3">Publisher: </dt>
          <dd className="inline">{a.publisherName || 'N/A'}</dd>
        </div>
      </dl>

      {kws.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {kws.map((k) => (
            <button
              key={k}
              onClick={() => onKeyword(k)}
              className={`rounded-full px-2 py-0.5 text-xs transition ${k === activeKeyword ? 'bg-brand-450 text-white' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'}`}
            >
              {labels[k] || k}
            </button>
          ))}
        </div>
      )}

      {showAbstract && a.abstract && <p className="mt-3 text-sm leading-relaxed text-ink-2">{a.abstract}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ExtLink href={a.articleUrl}>Open Article</ExtLink>
        <ExtLink href={links.journalUrl}>Open Journal</ExtLink>
        <ExtLink href={links.sintaUrl}>Open SINTA</ExtLink>
        {links.canLoad && (
          <button className="link-btn" onClick={links.load} title="Fetch the journal's Garuda profile for its website and SINTA link">
            Load journal links
          </button>
        )}
        {links.status === 'loading' && <span className="text-xs text-ink-3">Loading journal links…</span>}
        <ExtLink href={a.doiUrl}>DOI</ExtLink>
        <ExtLink href={a.garudaUrl}>Garuda</ExtLink>
        <ExtLink href={a.openalexUrl}>OpenAlex</ExtLink>
        <span className="ml-auto flex gap-2">
          {a.abstract && (
            <button className="text-xs text-brand-500 hover:underline" onClick={() => setShowAbstract((v) => !v)}>
              {showAbstract ? 'Hide abstract' : 'Abstract'}
            </button>
          )}
          <button className="text-xs text-brand-500 hover:underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Hide source details' : 'Source details'}
          </button>
        </span>
      </div>
      {open && <SourceDetails a={a} />}
    </article>
  );
}

/** Article results with paging; follows the active keyword and filters. */
export default function ArticleList({ articles, labels, activeKeyword, onKeyword, title = 'Research results', defaultSort = 'newest' }) {
  const [shown, setShown] = useState(PAGE);
  const [sort, setSort] = useState(defaultSort);
  useEffect(() => setSort(defaultSort), [defaultSort]);
  useEffect(() => setShown(PAGE), [articles]);

  const sorted = useMemo(() => {
    const list = [...articles];
    const score = closeness(articles);
    if (sort === 'relevance') list.sort((a, b) => score(b) - score(a) || (b.publicationYear || 0) - (a.publicationYear || 0));
    else if (sort === 'newest') list.sort((a, b) => (b.publicationYear || 0) - (a.publicationYear || 0));
    else if (sort === 'oldest') list.sort((a, b) => (a.publicationYear || 9999) - (b.publicationYear || 9999));
    else if (sort === 'rank') list.sort((a, b) => (a.sintaRank || 'S9').localeCompare(b.sintaRank || 'S9'));
    return list;
  }, [articles, sort]);

  return (
    <section id="articles" className="scroll-mt-32" aria-label="Articles">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-ink-3 uppercase">{title}</h2>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{fmt(articles.length)} articles</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          Sort
          <select className="field !w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="relevance">Closest to my query</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="rank">SINTA rank</option>
          </select>
        </label>
      </div>
      {articles.length === 0 ? (
        <p className="card p-6 text-sm text-ink-2">No articles match the current filters.</p>
      ) : (
        <div className="space-y-3">
          {sorted.slice(0, shown).map((a) => (
            <ArticleCard key={a.id} a={a} labels={labels} onKeyword={onKeyword} activeKeyword={activeKeyword} />
          ))}
        </div>
      )}
      {shown < sorted.length && (
        <div className="mt-4 text-center">
          <button className="btn-ghost" onClick={() => setShown((n) => n + PAGE)}>
            Show more ({fmt(sorted.length - shown)} remaining)
          </button>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-3">
        Links open the original records. Hosts seen: {[...new Set(articles.slice(0, 200).map((a) => a.articleUrl && hostname(a.articleUrl)).filter(Boolean))].length} journal websites.
      </p>
    </section>
  );
}
