import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt, yearRange } from '../lib/format.js';
import { YearBars } from './Charts.jsx';
import ExternalLink from './ExternalLink.jsx';
import Icon from './Icon.jsx';

const PANEL_W = 380;

/** Journals of the keyword's articles, grouped, most articles first. */
function groupJournals(articles) {
  const map = new Map();
  for (const a of articles) {
    const key = a.journalName || 'N/A';
    let g = map.get(key);
    if (!g) {
      g = { name: key, count: 0, rank: a.sintaRank, url: a.journalUrl || a.garudaJournalUrl, sintaUrl: a.sintaUrl, publisher: a.publisherName };
      map.set(key, g);
    }
    g.count += 1;
    g.url ||= a.journalUrl || a.garudaJournalUrl;
    g.sintaUrl ||= a.sintaUrl;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * Overlay shown on top of the map next to the clicked bubble.
 * Lists the keyword's articles and journals; every item opens its source in a new tab.
 */
export default function KeywordOverlay({ keyword, anchor, bounds, articles, onClose, onSelect, onTitleIdeas, onShowAll }) {
  const [view, setView] = useState('articles');
  const ref = useRef(null);
  const journals = useMemo(() => groupJournals(articles), [articles]);
  const sorted = useMemo(() => [...articles].sort((a, b) => (b.publicationYear || 0) - (a.publicationYear || 0)), [articles]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => ref.current?.focus(), [keyword?.id]);

  if (!keyword) return null;

  // Desktop: beside the bubble (right if there is room, else left). Mobile: bottom sheet.
  const mobile = bounds.width < 640;
  let style;
  if (!mobile) {
    const ax = anchor?.x ?? bounds.width / 2;
    const ay = anchor?.y ?? bounds.height / 2;
    const ar = anchor?.r ?? 0;
    const roomRight = bounds.width - (ax + ar + 16);
    const left = roomRight >= PANEL_W ? ax + ar + 16 : Math.max(12, ax - ar - 16 - PANEL_W);
    const maxH = Math.min(560, bounds.height - 24);
    const top = Math.min(Math.max(12, ay - 140), bounds.height - maxH - 12);
    style = { left, top, width: PANEL_W, maxHeight: maxH };
  }

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={`${keyword.name}: articles and journals`}
      style={style}
      className={`fade-up z-30 flex flex-col overflow-hidden border border-line bg-panel shadow-2xl outline-none ${
        mobile ? 'absolute inset-x-0 bottom-0 max-h-[75%] rounded-t-3xl' : 'absolute rounded-2xl'
      }`}
    >
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg leading-snug font-semibold">{keyword.name}</h3>
            <p className="mt-0.5 text-sm text-ink-2 tabular-nums">
              {fmt(keyword.count)} articles · {fmt(keyword.journals)} journals · {fmt(keyword.publishers)} publishers · {yearRange(keyword.yearMin, keyword.yearMax)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-3 hover:bg-muted hover:text-ink" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="mt-3">
          <YearBars byYear={keyword.byYear} height={36} />
        </div>
        {keyword.related?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {keyword.related.slice(0, 6).map((r) => (
              <button key={r.id} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600 hover:bg-brand-100" onClick={() => onSelect(r.id)} title={`${r.weight} shared articles`}>
                {r.name}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 inline-flex rounded-xl bg-surface p-0.5 text-sm" role="tablist">
          {[
            ['articles', `Articles (${articles.length})`],
            ['journals', `Journals (${journals.length})`],
          ].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`rounded-lg px-3 py-1 ${view === id ? 'bg-panel font-medium text-brand-600 shadow-sm' : 'text-ink-2'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'articles' ? (
          <ul className="divide-y divide-line">
            {sorted.map((a) => (
              <li key={a.id} className="px-4 py-2.5 hover:bg-brand-50/50">
                <ExternalLink href={a.articleUrl || a.garudaUrl} className="group block">
                  <span className="line-clamp-2 text-sm font-medium group-hover:text-brand-600 group-hover:underline">{a.title}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
                    <span className="truncate">{a.journalName || 'N/A'}</span>
                    <span>·</span>
                    <span className="shrink-0">{a.publicationYear || 'N/A'}</span>
                    <span className={`shrink-0 rounded px-1 ${a.sintaRank ? 'bg-brand-50 font-semibold text-brand-600' : 'border border-line'}`}>{a.sintaRank || 'SINTA N/A'}</span>
                    <Icon name="external" className="ml-auto h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                  </span>
                </ExternalLink>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="divide-y divide-line">
            {journals.map((j) => (
              <li key={j.name} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  {j.url ? (
                    <ExternalLink href={j.url} className="line-clamp-2 text-sm font-medium hover:text-brand-600 hover:underline">
                      {j.name}
                    </ExternalLink>
                  ) : (
                    <span className="line-clamp-2 text-sm font-medium">{j.name}</span>
                  )}
                  <p className="truncate text-xs text-ink-3">{j.publisher || 'Publisher N/A'}</p>
                </div>
                {j.sintaUrl && (
                  <ExternalLink href={j.sintaUrl} className="link-btn shrink-0">
                    SINTA
                  </ExternalLink>
                )}
                <span className="w-8 shrink-0 text-right text-sm text-ink-2 tabular-nums">{j.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 border-t border-line bg-surface p-3">
        <button className="btn-ghost flex-1 !py-1.5 text-xs" onClick={onShowAll}>
          Details below ↓
        </button>
        <button className="btn-primary flex-1 !py-1.5 text-xs" onClick={() => onTitleIdeas(keyword)}>
          <Icon name="bulb" className="h-3.5 w-3.5" /> Title ideas
        </button>
      </div>
    </div>
  );
}
