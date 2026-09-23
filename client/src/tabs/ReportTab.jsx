import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Notice, { EmptyState } from '../components/Notice.jsx';
import { exportText, slug } from '../lib/export.js';
import { buildReport, reportToHtml, reportToMarkdown } from '../lib/report.js';

export default function ReportTab({ data, derived, actions, state }) {
  const [lang, setLang] = useState('en');
  const [style, setStyle] = useState('apa');
  const report = useMemo(
    () => (data?.articles?.length ? buildReport({ data, derived, filters: state.filters, lang, style }) : null),
    [data, derived, state.filters, lang, style],
  );

  if (!report) {
    return (
      <EmptyState icon="report" title="The report needs a search first" action={<button className="btn-primary" onClick={() => actions.goTab('search')}>Start a keyword search</button>}>
        One document with the scope, themes, keywords, emerging topics, gaps, SINTA levels, journals, closest papers and title ideas of your search.
      </EmptyState>
    );
  }

  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(reportToHtml(report, { standalone: true }));
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pt-6 pb-20 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-3 uppercase">Research report generator</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{report.title}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select className="field !w-auto" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
          <select className="field !w-auto" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Citation style">
            <option value="apa">APA 7th</option>
            <option value="ieee">IEEE</option>
          </select>
          <button className="btn-primary" onClick={() => exportText(`${slug(report.title)}.doc`, reportToHtml(report, { standalone: true }), 'application/msword')}>
            <Icon name="download" /> Word
          </button>
          <button className="btn-ghost" onClick={() => exportText(`${slug(report.title)}.md`, reportToMarkdown(report), 'text/markdown;charset=utf-8')}>
            <Icon name="download" /> Markdown
          </button>
          <button className="btn-ghost" onClick={print}>
            <Icon name="file" /> Print / PDF
          </button>
        </div>
      </header>
      {data.meta?.live && <Notice tone="warning" title="Crawling is still running">The report updates as more articles arrive.</Notice>}
      <Notice title="Built only from your current results and filters">Every number and list comes from the crawled articles; nothing is written by a language model.</Notice>
      <article className="card report px-6 py-8 sm:px-10" dangerouslySetInnerHTML={{ __html: reportToHtml(report) }} />
    </div>
  );
}
