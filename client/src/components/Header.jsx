import { useEffect, useRef } from 'react';
import { setThemeMode, useTheme } from '../lib/theme.js';
import Icon from './Icon.jsx';

export const TABS = [
  { id: 'search', label: 'Keyword Search', icon: 'map' },
  { id: 'landscape', label: 'Landscape', icon: 'scatter' },
  { id: 'trends', label: 'Trends & Heatmap', icon: 'trend' },
  { id: 'gaps', label: 'Gaps & Combinations', icon: 'grid' },
  { id: 'insights', label: 'Insights & Titles', icon: 'bulb' },
  { id: 'journals', label: 'Journals & Publishers', icon: 'book' },
  { id: 'generate', label: 'Journal Generate', icon: 'file' },
  { id: 'report', label: 'Report', icon: 'report' },
];

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <line x1="11" y1="13" x2="22" y2="19" stroke="#9ec5f4" strokeWidth="2" />
      <line x1="11" y1="13" x2="20" y2="7" stroke="#9ec5f4" strokeWidth="2" />
      <circle cx="11" cy="13" r="7" fill="#2a78d6" />
      <circle cx="22" cy="20" r="5" fill="#86b6ef" />
      <circle cx="21" cy="7" r="3.2" fill="#184f95" />
    </svg>
  );
}

const THEME_ORDER = ['system', 'light', 'dark'];
const THEME_META = {
  system: { icon: 'monitor', label: 'Theme: system' },
  light: { icon: 'sun', label: 'Theme: light' },
  dark: { icon: 'moon', label: 'Theme: dark' },
};

/** Cycles system → light → dark. */
function ThemeToggle() {
  const { mode } = useTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length];
  return (
    <button
      onClick={() => setThemeMode(next)}
      title={`${THEME_META[mode].label} (click for ${next})`}
      aria-label={`${THEME_META[mode].label}. Switch to ${next}`}
      className="rounded-full p-2 text-ink-3 transition hover:bg-muted hover:text-ink"
    >
      <Icon name={THEME_META[mode].icon} className="h-5 w-5" />
    </button>
  );
}

/** Sticky app header: brand, tab bar, and the current search context. */
export default function Header({ activeTab, onTab, query, status, onNewSearch, counts }) {
  // Publish the header height so full-screen sections can fill exactly the rest of the viewport.
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <header ref={ref} className="sticky top-0 z-40 border-b border-line bg-panel/85 backdrop-blur-md supports-[backdrop-filter]:bg-panel/75">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6">
        <button onClick={() => onTab('search')} className="flex min-w-0 items-center gap-2.5 text-left" aria-label="Open Knowledge Mapping home">
          <Logo />
          <span className="min-w-0">
            <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight">Open Knowledge Mapping</span>
            <span className="hidden truncate text-xs text-ink-3 sm:block">A visual interface to the world&apos;s scientific knowledge</span>
          </span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          {query && (
            <span className="hidden max-w-[16rem] items-center gap-1.5 truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 md:inline-flex">
              {status === 'loading' ? <Icon name="loader" className="h-3.5 w-3.5 animate-spin" /> : <Icon name="search" className="h-3.5 w-3.5" />}
              <span className="truncate">{query}</span>
            </span>
          )}
          {query && status !== 'loading' && (
            <button onClick={onNewSearch} className="btn-ghost !px-3 !py-1.5 text-xs">
              <Icon name="search" className="h-3.5 w-3.5" /> New search
            </button>
          )}
        </div>
      </div>
      <nav className="mx-auto max-w-7xl px-2 sm:px-4" aria-label="Sections">
        <ul className="scrollbar-none -mb-px flex gap-1 overflow-x-auto pt-2">
          {TABS.map((t) => {
            const active = t.id === activeTab;
            const badge = counts?.[t.id];
            return (
              <li key={t.id} className="shrink-0">
                <button
                  onClick={() => onTab(t.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 border-b-2 px-3 pt-1.5 pb-2.5 text-sm font-medium whitespace-nowrap transition ${
                    active ? 'border-brand-450 text-brand-600' : 'border-transparent text-ink-2 hover:text-ink'
                  }`}
                >
                  <Icon name={t.icon} className="h-4 w-4" />
                  {t.label}
                  {badge ? (
                    <span className={`rounded-full px-1.5 text-[11px] leading-5 ${active ? 'bg-brand-100 text-brand-600' : 'bg-muted text-ink-3'}`}>
                      {badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
