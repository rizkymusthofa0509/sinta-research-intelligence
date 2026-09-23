import { useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '../lib/categories.js';
import Icon from './Icon.jsx';

const LIMITS = [25, 50, 100, 250, 500];

/** Focus / max articles / deep mode, tucked into a popover so the bar stays a single input. */
function OptionsPopover({ category, setCategory, limit, setLimit, deep, setDeep, sources, setSources, scope, setScope, disabled, onClose }) {
  const toggleSource = (id) =>
    setSources((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const selected = CATEGORIES.find((c) => c.id === category);

  return (
    <div ref={ref} className="fade-up absolute top-full right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-4 text-left shadow-xl" role="dialog" aria-label="Search options">
      <label className="block">
        <span className="label">Focus / category</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="field" disabled={disabled}>
          <option value="all">All fields</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} — {c.labelId}
            </option>
          ))}
        </select>
      </label>
      {selected && <p className="mt-1.5 text-xs text-ink-3">Keeps only journals whose SINTA/Garuda subject is {selected.label} ({selected.areas.slice(0, 3).join(', ')}…).</p>}

      <p className="label mt-4">Sources</p>
      <div className="space-y-2 text-sm text-ink-2">
        {[
          ['garuda', 'Garuda + SINTA', 'Indonesian journals, SINTA levels (ARJUNA)'],
          ['openalex', 'OpenAlex', 'Global index with abstracts & topics'],
        ].map(([id, label, hint]) => (
          <label key={id} className="flex cursor-pointer items-start gap-2 select-none">
            <input type="checkbox" checked={sources.includes(id)} onChange={() => toggleSource(id)} disabled={disabled} className="mt-0.5 h-4 w-4 accent-brand-450" />
            <span>
              {label}
              <span className="block text-xs text-ink-3">{hint}</span>
            </span>
          </label>
        ))}
        {sources.includes('openalex') && (
          <select value={scope} onChange={(e) => setScope(e.target.value)} className="field !py-1.5 text-xs" disabled={disabled} aria-label="OpenAlex scope">
            <option value="id">OpenAlex: only works with Indonesian authors</option>
            <option value="global">OpenAlex: worldwide</option>
          </select>
        )}
      </div>

      <p className="label mt-4">Max articles</p>
      <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Max articles">
        {LIMITS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={limit === l}
            disabled={disabled}
            onClick={() => setLimit(l)}
            className={`rounded-lg py-1.5 text-sm tabular-nums transition ${limit === l ? 'bg-panel font-semibold text-brand-600 shadow-sm' : 'text-ink-2 hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-ink-2 select-none">
        <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 accent-brand-450" />
        <span>
          Read author keywords from article pages
          <span className="block text-xs text-ink-3">More precise topics, slower crawl.</span>
        </span>
      </label>
    </div>
  );
}

/**
 * The keyword search bar. `variant="hero"` is the large centred home input;
 * `variant="floating"` sits over the bubble map.
 */
export default function SearchPanel({ initial, onSearch, loading, onCancel, variant = 'hero' }) {
  const [q, setQ] = useState(initial?.q ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'all');
  const [limit, setLimit] = useState(initial?.limit ?? 100);
  const [deep, setDeep] = useState(initial?.deep ?? false);
  const [sources, setSources] = useState(initial?.sources ?? ['garuda', 'openalex']);
  const [scope, setScope] = useState(initial?.scope ?? 'id');
  const [error, setError] = useState(null);
  const [showOptions, setShowOptions] = useState(false);
  const inputRef = useRef(null);
  const hero = variant === 'hero';

  useEffect(() => {
    if (hero) inputRef.current?.focus();
  }, [hero]);

  useEffect(() => {
    if (initial) {
      setQ(initial.q ?? '');
      setCategory(initial.category ?? 'all');
      setLimit(initial.limit ?? 100);
      setDeep(initial.deep ?? false);
      setSources(initial.sources ?? ['garuda', 'openalex']);
      setScope(initial.scope ?? 'id');
    }
  }, [initial]);

  const submit = (e) => {
    e?.preventDefault();
    const value = q.trim();
    if (value.length < 2) {
      setError('Type a research keyword (at least 2 characters).');
      inputRef.current?.focus();
      return;
    }
    setError(null);
    setShowOptions(false);
    onSearch({ q: value, category, limit, deep, sources, scope });
  };

  const focus = CATEGORIES.find((c) => c.id === category);
  const optionCount = (category !== 'all' ? 1 : 0) + (deep ? 1 : 0) + (sources.length < 2 || scope === 'global' ? 1 : 0);

  return (
    <form onSubmit={submit} role="search" className={`relative w-full ${hero ? 'max-w-2xl' : 'max-w-2xl'}`}>
      <div
        className={`flex items-center gap-2 rounded-full border bg-panel/95 pr-1.5 pl-5 backdrop-blur transition focus-within:border-brand-400 focus-within:shadow-[0_0_0_4px_var(--color-brand-100)] ${
          error ? 'border-critical' : 'border-line'
        } ${hero ? 'py-2 shadow-[0_6px_28px_var(--shadow)]' : 'py-1.5 shadow-[0_4px_20px_var(--shadow)]'}`}
      >
        <Icon name="search" className={`${hero ? 'h-6 w-6' : 'h-5 w-5'} shrink-0 text-ink-3`} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a research topic…"
          aria-label="Research keyword"
          maxLength={120}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3 ${hero ? 'py-1 text-lg sm:text-xl' : 'text-base'}`}
        />
        {focus && (
          <button type="button" onClick={() => setShowOptions(true)} className="hidden shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600 sm:block">
            {focus.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          aria-expanded={showOptions}
          aria-label="Search options"
          className={`relative shrink-0 rounded-full p-2 transition ${showOptions ? 'bg-brand-50 text-brand-600' : 'text-ink-3 hover:bg-muted hover:text-ink'}`}
        >
          <Icon name="sliders" className="h-5 w-5" />
          {optionCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-brand-450" aria-hidden />}
        </button>
        {loading ? (
          <button type="button" onClick={onCancel} className="btn-ghost shrink-0 !rounded-full">
            <Icon name="x" /> <span className="hidden sm:inline">Stop</span>
          </button>
        ) : (
          <button type="submit" className={`btn-primary shrink-0 !rounded-full ${hero ? 'sm:!px-6 sm:!py-2.5 sm:text-base' : ''}`}>
            Explore
          </button>
        )}
      </div>
      {error && <p className="mt-2 pl-5 text-sm text-critical">{error}</p>}
      {showOptions && (
        <OptionsPopover
          category={category}
          setCategory={setCategory}
          limit={limit}
          setLimit={setLimit}
          deep={deep}
          setDeep={setDeep}
          sources={sources}
          setSources={setSources}
          scope={scope}
          setScope={setScope}
          disabled={loading}
          onClose={() => setShowOptions(false)}
        />
      )}
    </form>
  );
}
