import { useState } from 'react';
import { fmt } from '../lib/format.js';

/**
 * Horizontal single-series bar list (one hue). Labels and values use ink colors;
 * the bar carries magnitude only. Hovering a row shows its exact share.
 */
export function BarList({ rows, total, onSelect, activeKey, emptyText = 'No data' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length || rows.every((r) => !r.value)) return <p className="text-sm text-ink-3">{emptyText}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const active = activeKey === r.key;
        const Tag = onSelect ? 'button' : 'div';
        return (
          <li key={r.key}>
            <Tag
              {...(onSelect ? { type: 'button', onClick: () => onSelect(r.key) } : {})}
              title={total ? `${r.label}: ${fmt(r.value)} (${Math.round((r.value / total) * 100)}%)` : `${r.label}: ${fmt(r.value)}`}
              className={`group grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-1.5 py-1 text-left text-sm ${
                onSelect ? 'hover:bg-brand-50' : ''
              } ${active ? 'bg-brand-50' : ''}`}
            >
              <span className={`truncate ${active ? 'font-medium text-brand-600' : 'text-ink-2'}`}>{r.label}</span>
              <span className="h-2.5 overflow-hidden rounded-r bg-transparent">
                <span
                  className="block h-full rounded-r bg-brand-450 transition-all duration-500 group-hover:bg-brand-550"
                  style={{ width: `${Math.max(r.value ? 2 : 0, (r.value / max) * 100)}%` }}
                />
              </span>
              <span className="w-10 text-right text-xs text-ink-2 tabular-nums">{fmt(r.value)}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}

/** Vertical year histogram (one hue) with a hover tooltip per bar. */
export function YearBars({ byYear, height = 72 }) {
  const [hover, setHover] = useState(null);
  const entries = Object.entries(byYear || {}).map(([y, c]) => [Number(y), c]);
  if (!entries.length) return <p className="text-sm text-ink-3">No publication years available.</p>;
  const min = Math.min(...entries.map((e) => e[0]));
  const max = Math.max(...entries.map((e) => e[0]));
  const years = [];
  for (let y = min; y <= max; y++) years.push([y, byYear[y] || 0]);
  const top = Math.max(...years.map((e) => e[1]), 1);

  return (
    <div className="relative">
      <div className="flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setHover(null)}>
        {years.map(([y, c]) => (
          <div key={y} className="flex h-full flex-1 items-end" onMouseEnter={() => setHover([y, c])}>
            <div
              className={`w-full rounded-t-[4px] transition-colors ${hover?.[0] === y ? 'bg-brand-550' : 'bg-brand-450'}`}
              style={{ height: `${c ? Math.max(4, (c / top) * 100) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between border-t border-line pt-1 text-[11px] text-ink-3 tabular-nums">
        <span>{min}</span>
        {max !== min && <span>{max}</span>}
      </div>
      {hover && (
        <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded-md bg-tooltip px-2 py-0.5 text-xs whitespace-nowrap text-tooltip-ink">
          {hover[0]}: {fmt(hover[1])} article{hover[1] === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}

/** A 0–100 meter with a text value beside it (value is never color-only). */
export function Meter({ value, label }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-50">
        <div className="h-full rounded-full bg-brand-450 transition-all duration-500" style={{ width: `${value}%` }} />
      </div>
      <span className="w-10 text-right text-sm font-semibold text-ink tabular-nums">{value}%</span>
    </div>
  );
}
