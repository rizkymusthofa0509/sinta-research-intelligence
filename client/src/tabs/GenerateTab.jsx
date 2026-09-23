import { useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { exportText, slug } from '../lib/export.js';
import { useJournalLinks } from '../lib/journalProfiles.js';
import { buildManuscript, manuscriptToHtml, manuscriptToMarkdown } from '../lib/manuscript.js';
import ExternalLink from '../components/ExternalLink.jsx';

const MAX_KEYWORDS = 5;
const MAX_REFS = 15;

export default function GenerateTab({ data, derived, state, actions }) {
  const { titles, journalFit, filtered, view } = derived;
  const selected = state.selectedTitle;
  const [customTitle, setCustomTitle] = useState('');
  const [lang, setLang] = useState('en');
  const [style, setStyle] = useState('apa');
  const [journalName, setJournalName] = useState('');
  const [keywordIds, setKeywordIds] = useState([]);
  const [refIds, setRefIds] = useState([]);
  const [copied, setCopied] = useState(false);
  const targetJournal = journalFit.find((j) => j.name === journalName) || null;
  const targetLinks = useJournalLinks(targetJournal, { auto: true });

  const labels = data?.labels || {};
  const articlesById = useMemo(() => new Map((data?.articles || []).map((a) => [a.id, a])), [data]);

  // Keyword choices: the title's keywords first, then the most frequent keywords.
  const keywordChoices = useMemo(() => {
    const ids = [...(selected?.keywordIds || []), ...view.keywords.map((k) => k.id)];
    return [...new Set(ids)].slice(0, 16);
  }, [selected, view.keywords]);

  // Reference candidates: the title's supporting articles, then articles sharing its keywords. Prefer ones with a DOI.
  const refCandidates = useMemo(() => {
    const want = new Set(selected?.keywordIds || keywordIds);
    const support = (selected?.supportingArticleIds || []).map((id) => articlesById.get(id)).filter(Boolean);
    const others = filtered
      .filter((a) => !support.includes(a))
      .map((a) => ({ a, hits: (a.keywordIds || []).filter((k) => want.has(k)).length }))
      .filter((x) => x.hits > 0)
      .sort((x, y) => y.hits - x.hits || Number(Boolean(y.a.doi)) - Number(Boolean(x.a.doi)) || (y.a.publicationYear || 0) - (x.a.publicationYear || 0))
      .map((x) => x.a);
    return [...support, ...others].slice(0, 30);
  }, [selected, keywordIds, filtered, articlesById]);

  // Reset selections when the chosen title changes.
  useEffect(() => {
    setKeywordIds((selected?.keywordIds || view.keywords.slice(0, 5).map((k) => k.id)).slice(0, MAX_KEYWORDS));
    if (selected) setCustomTitle('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, data]);
  useEffect(() => {
    setRefIds(refCandidates.slice(0, 8).map((a) => a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, data]);
  useEffect(() => {
    if (!journalName && journalFit[0]) setJournalName(journalFit[0].name);
  }, [journalFit, journalName]);

  if (!data?.articles?.length) {
    return (
      <EmptyState icon="file" title="Generate a journal manuscript template" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        After a search, pick a data-driven title and this tab builds a manuscript skeleton in the standard SINTA journal format (IMRaD), with real references from the crawled articles.
      </EmptyState>
    );
  }

  const title = customTitle.trim() || (selected ? (lang === 'id' ? selected.titleId : selected.title) : '');
  const journal = targetJournal ? { ...targetJournal, journalUrl: targetLinks.journalUrl } : null;
  const refs = refIds.map((id) => articlesById.get(id)).filter(Boolean);
  const topic = labels[data.rootKey] || data.query;
  const manuscript = title
    ? buildManuscript({
        title,
        lang,
        style,
        keywords: keywordIds.map((k) => labels[k] || k),
        refs,
        journal,
        titleMeta: customTitle.trim() ? null : selected,
        stats: { topic, articles: filtered.length, journals: view.summary.journals, yearMin: view.summary.yearMin, yearMax: view.summary.yearMax },
      })
    : null;

  const toggle = (list, setList, id, max) => setList(list.includes(id) ? list.filter((x) => x !== id) : list.length >= max ? list : [...list, id]);

  const copy = async () => {
    await navigator.clipboard.writeText(manuscriptToMarkdown(manuscript));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 pt-6 pb-20 sm:px-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="space-y-5 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Journal Generate</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Manuscript template</h1>
          <p className="mt-1 text-sm text-ink-2">Standard SINTA / IMRaD structure. Data fills the facts; you write the science.</p>
        </div>

        <div className="card space-y-4 p-4">
          <label className="block">
            <span className="label">Recommended title</span>
            <select
              className="field"
              value={selected?.id || ''}
              onChange={(e) => actions.selectTitle(titles.find((t) => t.id === e.target.value) || null)}
            >
              <option value="">— choose a title —</option>
              {titles.map((t) => (
                <option key={t.id} value={t.id}>
                  {lang === 'id' ? t.titleId : t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">…or write your own</span>
            <textarea className="field min-h-[4.5rem]" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Your working title" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Language</span>
              <select className="field" value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="en">English</option>
                <option value="id">Bahasa Indonesia</option>
              </select>
            </label>
            <label>
              <span className="label">Citation style</span>
              <select className="field" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="apa">APA 7th</option>
                <option value="ieee">IEEE</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="label">Target journal (by topic fit)</span>
            <select className="field" value={journalName} onChange={(e) => setJournalName(e.target.value)}>
              <option value="">— none —</option>
              {journalFit.slice(0, 20).map((j) => (
                <option key={j.name} value={j.name}>
                  {j.confidence}% · {j.name}
                  {j.sintaRank ? ` (${j.sintaRank})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="card p-4">
          <p className="label">
            Keywords ({keywordIds.length}/{MAX_KEYWORDS})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {keywordChoices.map((id) => {
              const on = keywordIds.includes(id);
              return (
                <button
                  key={id}
                  onClick={() => toggle(keywordIds, setKeywordIds, id, MAX_KEYWORDS)}
                  aria-pressed={on}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition ${on ? 'bg-brand-450 text-white' : 'border border-line text-ink-2 hover:border-brand-300'}`}
                >
                  {labels[id] || id}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <p className="label">
            References ({refIds.length}/{MAX_REFS}) — from crawled articles
          </p>
          <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {refCandidates.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer gap-2 text-sm">
                  <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-brand-450" checked={refIds.includes(a.id)} onChange={() => toggle(refIds, setRefIds, a.id, MAX_REFS)} />
                  <span className="min-w-0">
                    <span className="line-clamp-2">{a.title}</span>
                    <span className="text-xs text-ink-3">
                      {a.publicationYear || 'n.d.'} · {a.journalName || 'N/A'} {a.doi ? '· DOI' : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {!refCandidates.length && <li className="text-sm text-ink-3">Choose a title or keywords to get reference suggestions.</li>}
          </ul>
        </div>
      </aside>

      <section className="min-w-0 space-y-4">
        {!manuscript ? (
          <div className="card flex min-h-[24rem] flex-col items-center justify-center p-8 text-center">
            <Icon name="file" className="h-8 w-8 text-brand-300" />
            <p className="mt-3 font-medium">Choose a recommended title or write your own</p>
            <p className="mt-1 max-w-md text-sm text-ink-2">Titles come from the Insights tab and are derived from keyword frequency, trends and research gaps in your results.</p>
            {titles[0] && (
              <button className="btn-primary mt-5" onClick={() => actions.selectTitle(titles[0])}>
                Use top recommendation
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Notice title="Draft template, not a finished paper">
                Text in <span className="rounded bg-warn-bg px-1 text-warn-ink">[highlighted brackets]</span> is for you to write. Sentences outside brackets only restate crawled data (counts, years, bibliographic metadata).
                {manuscript.guidelinesUrl && (
                  <>
                    {' '}
                    Follow the{' '}
                    <ExternalLink href={manuscript.guidelinesUrl} className="text-brand-500 underline">
                      target journal&apos;s author guidelines
                    </ExternalLink>
                    .
                  </>
                )}
              </Notice>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => exportText(`${slug(manuscript.title)}.doc`, manuscriptToHtml(manuscript, { standalone: true }), 'application/msword')}>
                <Icon name="download" /> Word (.doc)
              </button>
              <button className="btn-ghost" onClick={() => exportText(`${slug(manuscript.title)}.md`, manuscriptToMarkdown(manuscript), 'text/markdown;charset=utf-8')}>
                <Icon name="download" /> Markdown
              </button>
              <button className="btn-ghost" onClick={copy}>
                <Icon name={copied ? 'check' : 'copy'} /> {copied ? 'Copied' : 'Copy text'}
              </button>
            </div>
            <article className="card manuscript mx-auto max-w-[52rem] px-6 py-8 sm:px-12 sm:py-12" dangerouslySetInnerHTML={{ __html: manuscriptToHtml(manuscript) }} />
          </>
        )}
      </section>
    </div>
  );
}
