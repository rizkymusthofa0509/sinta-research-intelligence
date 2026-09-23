import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildResult, filterArticles } from '../../shared/aggregate.js';
import { rankJournals, rankPublishers, recommendSintaLevel, recommendTitles } from '../../shared/insights.js';
import { EMPTY_FILTERS } from './components/FilterBar.jsx';
import Header, { TABS } from './components/Header.jsx';
import { streamSearch } from './lib/api.js';
import { liveSnapshot } from './lib/live.js';
import { clearSession, loadSession, saveSession } from './lib/session.js';
import GenerateTab from './tabs/GenerateTab.jsx';
import InsightsTab from './tabs/InsightsTab.jsx';
import JournalsTab from './tabs/JournalsTab.jsx';
import GapsTab from './tabs/GapsTab.jsx';
import LandscapeTab from './tabs/LandscapeTab.jsx';
import ReportTab from './tabs/ReportTab.jsx';
import SearchTab from './tabs/SearchTab.jsx';
import TrendsTab from './tabs/TrendsTab.jsx';

const tabFromHash = () => {
  const id = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === id) ? id : 'search';
};

const restored = loadSession();

export default function App() {
  const [tab, setTab] = useState(tabFromHash);
  const [status, setStatus] = useState(restored ? 'done' : 'idle'); // idle | loading | done | error
  const [params, setParams] = useState(restored?.params ?? { q: '', category: 'all', limit: 100, deep: false, sources: ['garuda', 'openalex'], scope: 'id' });
  const [data, setData] = useState(restored?.data ?? null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [focusKeyword, setFocusKeyword] = useState(null);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const cancelRef = useRef(null);
  const liveRef = useRef({ articles: new Map(), timer: null, query: '', plan: null });

  // Tabs are reflected in the URL hash so the back button and refresh keep the tab.
  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const goTab = useCallback((id) => {
    if (window.location.hash !== `#${id}`) window.history.pushState(null, '', `#${id}`);
    setTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (status !== 'loading') return undefined;
    const started = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [status]);

  // Live data: articles stream in while crawling; the map is recomputed at most every 700 ms.
  const flushLive = useCallback((extraWarning) => {
    const live = liveRef.current;
    clearTimeout(live.timer);
    live.timer = null;
    if (!live.articles.size) return false;
    const snap = liveSnapshot(live.articles, live.query, live.plan);
    if (extraWarning) snap.meta.warnings = [extraWarning];
    setData(snap);
    return true;
  }, []);

  const search = useCallback(
    (p) => {
      cancelRef.current?.();
      clearTimeout(liveRef.current.timer);
      liveRef.current = { articles: new Map(), timer: null, query: p.q, plan: null };
      setParams(p);
      setData(null);
      clearSession();
      setStatus('loading');
      setError(null);
      setProgress({ stage: 'sinta', message: 'Connecting…' });
      setFilters(EMPTY_FILTERS);
      setSelectedId(null);
      setFocusKeyword(null);
      setSelectedTitle(null);
      goTab('search');
      cancelRef.current = streamSearch(p, {
        onProgress: setProgress,
        onPlan: (plan) => {
          liveRef.current.plan = plan;
        },
        onArticles: (batch) => {
          const live = liveRef.current;
          for (const a of batch) live.articles.set(a.id, a);
          if (!live.timer) live.timer = setTimeout(() => flushLive(), live.articles.size <= batch.length ? 0 : 700);
        },
        onResult: (result) => {
          clearTimeout(liveRef.current.timer);
          setData(result);
          setStatus('done');
          document.title = `${result.query} · Open Knowledge Mapping`;
        },
        onError: (err) => {
          // Never throw away what was already collected: keep the partial map.
          const kept = flushLive(`Crawling stopped early (${err.message}) — showing the ${liveRef.current.articles.size} articles collected so far.`);
          if (kept) setStatus('done');
          else {
            setError(err);
            setStatus('error');
          }
        },
      });
    },
    [goTab, flushLive],
  );

  const cancel = useCallback(() => {
    cancelRef.current?.();
    const kept = flushLive(`Search cancelled — showing the ${liveRef.current.articles.size} articles collected so far.`);
    setStatus(kept ? 'done' : 'idle');
  }, [flushLive]);

  useEffect(() => () => cancelRef.current?.(), []);

  // Keep the finished result for this tab only (survives reload/back, gone when the tab closes).
  useEffect(() => {
    if (status === 'done' && data?.articles?.length) saveSession({ params, data });
  }, [status, data, params]);

  // ---- In-memory analytics (recomputed on filter change, never re-crawled) ----
  const articles = data?.articles || [];
  const filtered = useMemo(() => filterArticles(articles, filters), [articles, filters]);
  const view = useMemo(
    () => (data ? buildResult(filtered, data.labels, { rootKey: data.rootKey }) : { summary: {}, keywords: [], links: [] }),
    [filtered, data],
  );
  const selectedKeyword = useMemo(() => view.keywords.find((k) => k.id === selectedId) || null, [view, selectedId]);
  const listArticles = useMemo(() => (selectedId ? filtered.filter((a) => a.keywordIds?.includes(selectedId)) : filtered), [filtered, selectedId]);

  const titles = useMemo(() => {
    if (!data) return [];
    if (focusKeyword) {
      const subset = filtered.filter((a) => a.keywordIds?.includes(focusKeyword.id));
      const sub = buildResult(subset, data.labels, { rootKey: focusKeyword.id });
      return recommendTitles(subset, sub.keywords, { rootKey: focusKeyword.id, queryLabel: focusKeyword.name });
    }
    return recommendTitles(filtered, view.keywords, { rootKey: data.rootKey, queryLabel: data.labels?.[data.rootKey] || data.analysisQuery || data.query });
  }, [data, filtered, view, focusKeyword]);

  const targetKeywordIds = useMemo(
    () => selectedTitle?.keywordIds || (focusKeyword ? [focusKeyword.id] : view.keywords.slice(0, 8).map((k) => k.id)),
    [selectedTitle, focusKeyword, view],
  );
  const journalFitAll = useMemo(() => rankJournals(filtered, { targetKeywordIds, limit: 10000 }), [filtered, targetKeywordIds]);
  const journalFit = useMemo(() => journalFitAll.slice(0, 30), [journalFitAll]);
  const publisherFit = useMemo(() => rankPublishers(journalFitAll, { limit: 20 }), [journalFitAll]);
  const sintaLevel = useMemo(() => recommendSintaLevel(filtered, journalFitAll), [filtered, journalFitAll]);
  const allJournals = useMemo(() => [...journalFitAll].sort((a, b) => b.articles - a.articles || a.name.localeCompare(b.name)), [journalFitAll]);
  const allPublishers = useMemo(
    () => rankPublishers(journalFitAll, { limit: 10000 }).sort((a, b) => b.articles - a.articles || a.name.localeCompare(b.name)),
    [journalFitAll],
  );

  const derived = {
    filtered,
    view,
    selectedKeyword,
    listArticles,
    titles,
    journalFit,
    publisherFit,
    sintaLevel,
    allJournals,
    allPublishers,
    targetKeywordNames: targetKeywordIds.map((k) => data?.labels?.[k] || k),
  };

  const actions = {
    search,
    cancel,
    goTab,
    setFilters,
    selectKeyword: setSelectedId,
    toggleKeyword: useCallback((id) => setSelectedId((cur) => (cur === id ? null : id)), []),
    titleIdeasFor: (kw) => {
      setFocusKeyword(kw);
      setSelectedTitle(null);
      if (kw) goTab('insights');
    },
    generateFrom: (t) => {
      setSelectedTitle(t);
      goTab('generate');
    },
    selectTitle: setSelectedTitle,
    filterJournal: (name) => {
      setFilters({ ...EMPTY_FILTERS, journal: name });
      setSelectedId(null);
      goTab('search');
      setTimeout(() => document.getElementById('articles')?.scrollIntoView({ behavior: 'smooth' }), 300);
    },
  };

  const state = { status, data, error, progress, params, elapsed, filters, focusKeyword, selectedTitle };
  const counts = data?.articles?.length
    ? { search: filtered.length, insights: titles.length || null, journals: allJournals.length }
    : null;

  return (
    <div className="min-h-screen bg-bg">
      <Header
        activeTab={tab}
        onTab={goTab}
        query={status === 'loading' ? params.q : data?.query}
        status={status}
        counts={counts}
        onNewSearch={() => {
          goTab('search');
          setTimeout(() => document.querySelector('input[aria-label="Research keyword"]')?.focus(), 50);
        }}
      />
      <main>
        {tab === 'search' && <SearchTab state={state} derived={derived} actions={actions} />}
        {tab === 'landscape' && <LandscapeTab data={data} derived={derived} actions={actions} />}
        {tab === 'trends' && <TrendsTab data={data} derived={derived} actions={actions} />}
        {tab === 'gaps' && <GapsTab data={data} derived={derived} actions={actions} state={state} />}
        {tab === 'report' && <ReportTab data={data} derived={derived} actions={actions} state={state} />}
        {tab === 'insights' && <InsightsTab data={data} derived={derived} actions={actions} state={state} />}
        {tab === 'journals' && <JournalsTab data={data} derived={derived} actions={actions} />}
        {tab === 'generate' && <GenerateTab data={data} derived={derived} actions={actions} state={state} />}
      </main>
      <footer className={`border-t border-line py-6 text-center text-xs text-ink-3 ${tab === 'search' && !data?.articles?.length ? 'hidden' : ''}`}>
        Open Knowledge Mapping · Data crawled live from public Garuda &amp; SINTA pages · Nothing is stored
      </footer>
    </div>
  );
}
