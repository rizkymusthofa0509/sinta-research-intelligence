import * as d3 from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../lib/format.js';
import { useTheme } from '../lib/theme.js';
import Icon from './Icon.jsx';

// Sequential blue ramp, weak → strong: colour = strength of co-occurrence with the searched topic.
// Light surface: strong = darker. Dark surface: its own steps where strong = brighter
// (more contrast against the background), so the reading stays the same in both themes.
const THEMES = {
  light: {
    // Ordinal ramps validated with the dataviz palette checker (monotone L, step gaps, ≥2:1 vs surface).
    ramp: ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'],
    root: '#082448',
    whiteText: (bin, isRoot) => isRoot || bin >= 2, // ≥ 4.4:1 for white labels
    link: '#86b6ef',
    linkActive: '#2a78d6',
  },
  dark: {
    ramp: ['#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6'],
    root: '#e6f0fd',
    whiteText: (bin, isRoot) => !isRoot && bin <= 1,
    link: '#3d6fae',
    linkActive: '#86b6ef',
  },
};

function useSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/** Split a label into ≤3 lines that fit a circle of radius r at font size fs. */
function fitLabel(text, r, fs) {
  const maxChars = Math.max(3, Math.floor((1.75 * r) / (fs * 0.55)));
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length <= maxChars) line = next;
    else {
      if (line) lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 3 || lines.some((l) => l.length > maxChars)) return null;
  // Three lines only fit when the circle is tall enough.
  if (lines.length * fs * 1.1 > 1.5 * r) return null;
  return lines;
}

/**
 * Full-bleed force-directed keyword bubble map (fills its positioned parent).
 *  - radius  = linear scale of log(articleCount + 1)  (no random sizes)
 *  - colour  = co-occurrence strength (Jaccard) with the searched topic
 *  - links   = keywords appearing together in articles; thicker = stronger
 * onSelect(id, anchor) — anchor = { x, y, r } of the clicked bubble in container pixels.
 * topInset keeps the layout clear of UI floating over the top of the map.
 */
export default function BubbleMap({ keywords, links, rootKey, selectedId, onSelect, queryLabel, topInset = 0 }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const positions = useRef(new Map());
  const [tooltip, setTooltip] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const [zoomHint, setZoomHint] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRef = useRef(d3.zoomIdentity); // kept across rebuilds so live updates do not reset the view
  const zoomApi = useRef(null);
  const { width, height } = useSize(wrapRef);
  const { resolved: themeName } = useTheme();
  const theme = THEMES[themeName] || THEMES.light;

  // Strength of each keyword's tie to the root topic (0..1), binned onto the ramp.
  const model = useMemo(() => {
    const jac = new Map();
    for (const l of links) {
      if (l.source === rootKey || l.source?.id === rootKey) jac.set(l.target?.id ?? l.target, l.jaccard);
      else if (l.target === rootKey || l.target?.id === rootKey) jac.set(l.source?.id ?? l.source, l.jaccard);
    }
    const maxJ = Math.max(0.0001, ...jac.values());
    const maxCount = Math.max(1, ...keywords.map((k) => k.count));
    return keywords.map((k) => {
      const strength = k.id === rootKey ? 1 : rootKey ? (jac.get(k.id) ?? 0) / maxJ : k.count / maxCount;
      const bin = Math.min(theme.ramp.length - 1, Math.floor(strength * theme.ramp.length));
      return { ...k, strength, bin, fill: k.id === rootKey ? theme.root : theme.ramp[bin] };
    });
  }, [keywords, links, rootKey, theme]);

  // Build / rebuild the simulation when data or size changes.
  useEffect(() => {
    if (!width || !height || !svgRef.current) return undefined;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    if (!model.length) return undefined;

    const W = width;
    const H = height;
    const cy = topInset + (H - topInset) / 2; // visual centre below the floating search bar
    const counts = model.map((k) => Math.log(k.count + 1));
    const minR = Math.max(10, Math.min(W, H) / 45);
    const maxR = Math.min(110, Math.min(W, H - topInset) / (model.length > 30 ? 6.5 : 5.5));
    const r = d3.scaleLinear().domain([d3.min(counts), d3.max(counts)]).range([minR, maxR]);
    if (d3.min(counts) === d3.max(counts)) r.range([maxR * 0.6, maxR * 0.6]);
    // Keep total bubble area under ~50% of the canvas so the layout can breathe.
    const area = d3.sum(model, (k) => Math.PI * r(Math.log(k.count + 1)) ** 2);
    const shrink = Math.min(1, Math.sqrt((0.3 * W * (H - topInset)) / area));

    // New bubbles (live streaming) start next to their most related existing bubble.
    const anchorOf = new Map();
    for (const l of [...links].sort((a, b) => b.weight - a.weight)) {
      const s = l.source?.id ?? l.source;
      const t = l.target?.id ?? l.target;
      if (!positions.current.has(s) && positions.current.has(t) && !anchorOf.has(s)) anchorOf.set(s, t);
      if (!positions.current.has(t) && positions.current.has(s) && !anchorOf.has(t)) anchorOf.set(t, s);
    }
    const nodes = model.map((k, i) => {
      const prev = positions.current.get(k.id);
      const anchor = positions.current.get(anchorOf.get(k.id));
      const angle = i * 2.399; // golden-angle spread, deterministic
      return {
        ...k,
        r: r(Math.log(k.count + 1)) * shrink,
        prevR: prev?.r ?? 0,
        isNew: !prev,
        x: prev?.x ?? (anchor ? anchor.x + Math.cos(angle) * 30 : W / 2 + (Math.cos(angle) * W) / 4),
        y: prev?.y ?? (anchor ? anchor.y + Math.sin(angle) * 30 : cy + (Math.sin(angle) * H) / 4),
      };
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const root = byId.get(rootKey);
    if (root) {
      root.fx = W / 2;
      root.fy = cy;
    }
    const edges = links
      .filter((l) => byId.has(l.source?.id ?? l.source) && byId.has(l.target?.id ?? l.target))
      .map((l) => ({ ...l, source: l.source?.id ?? l.source, target: l.target?.id ?? l.target }));

    // Everything that zooms/pans lives in one viewport group.
    const viewport = svg.append('g').attr('class', 'viewport');
    const gLinks = viewport.append('g').attr('class', 'links');
    const gNodes = viewport.append('g').attr('class', 'nodes');
    // Outside labels live in their own top layer so neighbouring bubbles never cover them.
    const gLabels = viewport.append('g').attr('class', 'outside-labels').style('pointer-events', 'none');

    const linkSel = gLinks
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', theme.link)
      .attr('stroke-linecap', 'round')
      .attr('stroke-width', (d) => 1 + 3 * d.jaccard)
      .attr('stroke-opacity', (d) => 0.18 + 0.5 * d.jaccard);

    const nodeSel = gNodes
      .selectAll('g')
      .data(nodes, (d) => d.id)
      .join('g')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.name}: ${d.count} articles, ${d.journals} journals, ${d.publishers} publishers`)
      .style('cursor', 'pointer')
      .style('outline', 'none');

    // Existing bubbles grow/shrink from their previous size; only new ones pop in.
    nodeSel
      .append('circle')
      .attr('r', (d) => d.prevR)
      .attr('fill', (d) => d.fill)
      .style('stroke', 'var(--bg)')
      .attr('stroke-width', 2)
      .attr('vector-effect', 'non-scaling-stroke')
      .transition()
      .duration((d) => (d.isNew ? 650 : 450))
      .delay((d, i) => (d.isNew ? Math.min(i * 12, 400) : 0))
      .ease(d3.easeBackOut.overshoot(1.1))
      .attr('r', (d) => d.r);

    const rankOf = new Map([...nodes].sort((a, b) => b.count - a.count).map((n, i) => [n.id, i]));
    // Collision padding is decided once at scale 1 so zooming never reshuffles the layout.
    for (const d of nodes) d.outsideLabel = !fitLabel(d.name, d.r, 9) && rankOf.get(d.id) < 20;

    /**
     * Labels are laid out in screen pixels: at zoom k a bubble is r·k wide on screen,
     * so zooming in reveals names that did not fit before. Font sizes are divided by k
     * to stay a constant, readable size.
     */
    let firstRender = true;
    const renderLabels = (k) => {
      const outside = [];
      nodeSel.each(function (d) {
        const g = d3.select(this);
        g.select('text.inside').remove();
        const R = d.r * k;
        const whiteText = theme.whiteText(d.bin, d.id === rootKey);
        let fs = Math.max(9, Math.min(17, R / 3.3));
        let lines = fitLabel(d.name, R, fs);
        while (!lines && fs > 9) {
          fs -= 1;
          lines = fitLabel(d.name, R, fs);
        }
        if (lines) {
          const text = g
            .append('text')
            .attr('class', 'inside')
            .attr('text-anchor', 'middle')
            .attr('font-size', fs / k)
            .attr('font-weight', d.id === rootKey ? 700 : 600)
            .attr('fill', whiteText ? '#ffffff' : '#0b0b0b')
            .style('pointer-events', 'none')
            .style('opacity', firstRender && d.isNew ? 0 : 1);
          lines.forEach((line, i) =>
            text
              .append('tspan')
              .attr('x', 0)
              .attr('dy', i === 0 ? `${(-(lines.length - 1) * 0.55 + 0.35).toFixed(2)}em` : '1.1em')
              .text(line),
          );
          if (firstRender && d.isNew) text.transition().delay(350).duration(400).style('opacity', 1);
        } else if (rankOf.get(d.id) < 20 || k >= 1.6) {
          outside.push(d);
        }
      });
      gLabels
        .selectAll('text')
        .data(outside, (d) => d.id)
        .join('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', 11 / k)
        .attr('font-weight', 500)
        .style('fill', 'var(--ink-2)')
        .style('stroke', 'var(--bg)')
        .attr('stroke-width', 3 / k)
        .attr('paint-order', 'stroke')
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y + d.r + 12 / k)
        .text((d) => (d.name.length > 26 ? `${d.name.slice(0, 25)}…` : d.name));
      firstRender = false;
    };
    renderLabels(zoomRef.current.k);
    let labelFrame = null;
    const scheduleLabels = (k) => {
      cancelAnimationFrame(labelFrame);
      labelFrame = requestAnimationFrame(() => {
        renderLabels(k);
        applySelection();
      });
    };
    const labelSel = () => gLabels.selectAll('text');

    // Screen position of a bubble under the current zoom (for tooltips and the overlay).
    const toScreen = (d) => {
      const t = zoomRef.current;
      const [x, y] = t.apply([d.x, d.y]);
      return { x, y, r: d.r * t.k };
    };

    // Zoom & pan: Ctrl/⌘ + wheel or trackpad pinch, two-finger touch, drag on empty space.
    const isNode = (event) => Boolean(event.target?.closest?.('g[role="button"]'));
    let panned = false;
    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 8])
      .filter((event) => {
        if (event.type === 'wheel') {
          if (event.ctrlKey || event.metaKey) return true;
          setZoomHint(true);
          clearTimeout(zoomApi.hintTimer);
          zoomApi.hintTimer = setTimeout(() => setZoomHint(false), 1400);
          return false; // plain scrolling keeps scrolling the page
        }
        if (event.type.startsWith('touch')) return event.touches?.length >= 2;
        if (event.type === 'dblclick') return !isNode(event);
        return !event.button && !isNode(event);
      })
      .on('start', () => {
        panned = false;
      })
      .on('zoom', (event) => {
        panned = true;
        zoomRef.current = event.transform;
        viewport.attr('transform', event.transform);
        setTooltip(null);
        setZoomLevel(event.transform.k);
        scheduleLabels(event.transform.k);
      });
    svg.call(zoom).style('touch-action', 'pan-y');
    svg.call(zoom.transform, zoomRef.current);
    svg.on('click.background', (event) => {
      if (event.target === svgRef.current && !panned) onSelect(null);
      panned = false;
    });

    const fit = () => {
      const pad = 24;
      const x0 = d3.min(nodes, (n) => n.x - n.r) - pad;
      const x1 = d3.max(nodes, (n) => n.x + n.r) + pad;
      const y0 = d3.min(nodes, (n) => n.y - n.r) - pad;
      const y1 = d3.max(nodes, (n) => n.y + n.r + (n.outsideLabel ? 16 : 0)) + pad;
      const k = Math.max(0.3, Math.min(2.5, W / (x1 - x0), (H - topInset) / (y1 - y0)));
      const t = d3.zoomIdentity.translate(W / 2 - (k * (x0 + x1)) / 2, topInset + (H - topInset) / 2 - (k * (y0 + y1)) / 2).scale(k);
      svg.transition().duration(500).call(zoom.transform, t);
    };
    zoomApi.current = {
      zoomBy: (f) => svg.transition().duration(250).call(zoom.scaleBy, f, [W / 2, topInset + (H - topInset) / 2]),
      reset: () => svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity),
      fit,
    };

    // Re-applied after labels are re-rendered on zoom.
    const applySelection = () => svgRef.current?.__applySelection?.();

    const showTip = (event, d) => {
      const [x, y] = d3.pointer(event, wrapRef.current);
      setTooltip({ x, y, d });
    };

    nodeSel
      .on('mouseenter mousemove', showTip)
      .on('mouseleave', () => setTooltip(null))
      .on('focus', (event, d) => {
        const p = toScreen(d);
        setTooltip({ x: p.x, y: p.y - p.r, d });
      })
      .on('blur', () => setTooltip(null))
      .on('click', (event, d) => {
        setTooltip(null);
        onSelect(d.id, toScreen(d));
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(d.id, toScreen(d));
        }
      });

    // Spread the bubbles over the whole canvas: repulsion and link length scale with the
    // space each bubble "owns"; centring is weak and follows the canvas aspect ratio,
    // so wide screens spread horizontally instead of clumping in the middle.
    const usableH = H - topInset;
    const spacing = Math.sqrt((W * usableH) / Math.max(nodes.length, 1));
    const sim = d3
      .forceSimulation(nodes)
      .force(
        'link',
        d3
          .forceLink(edges)
          .id((d) => d.id)
          .distance((l) => l.source.r + l.target.r + spacing * (0.25 + 0.55 * (1 - l.jaccard)))
          .strength((l) => 0.02 + 0.25 * l.jaccard),
      )
      .force('charge', d3.forceManyBody().strength((d) => -(spacing * 0.6 + d.r * 1.2)).distanceMax(Math.max(W, usableH)))
      .force('collide', d3.forceCollide((d) => d.r + (d.outsideLabel ? 16 : 6)).iterations(3))
      .force('x', d3.forceX(W / 2).strength(0.05 * Math.min(1, usableH / W)))
      .force('y', d3.forceY(cy).strength(0.05 * Math.min(1, W / usableH)))
      .alpha(positions.current.size ? (nodes.some((n) => n.isNew) ? 0.35 : 0.15) : 1)
      .alphaDecay(0.03);

    sim.on('tick', () => {
      // Keep bubbles clear of the floating zoom controls (right) and stats/legend (bottom).
      for (const n of nodes) {
        n.x = Math.max(n.r + 8, Math.min(W - n.r - 56, n.x));
        n.y = Math.max(topInset * 0.6 + n.r, Math.min(H - n.r - 52, n.y));
      }
      linkSel
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodeSel.attr('transform', (d) => `translate(${d.x},${d.y})`);
      const k = zoomRef.current.k;
      labelSel().attr('x', (d) => d.x).attr('y', (d) => d.y + d.r + 12 / k);
    });
    const remember = () => nodes.forEach((n) => positions.current.set(n.id, { x: n.x, y: n.y, r: n.r }));
    sim.on('end', remember);

    nodeSel.call(
      d3
        .drag()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.25).restart();
          d.fx = d.x;
          d.fy = d.y;
          setTooltip(null);
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) sim.alphaTarget(0);
          if (d.id !== rootKey) {
            d.fx = null;
            d.fy = null;
          }
        }),
    );

    svgRef.current.__sel = { nodeSel, linkSel, labelSel };
    return () => {
      remember();
      sim.stop();
      cancelAnimationFrame(labelFrame);
      svg.on('.zoom', null).on('click.background', null);
    };
    // onSelect is stable from the parent (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, links, width, height, rootKey, topInset, theme]);

  // Selection highlight without rebuilding the simulation. Stored on the SVG so the
  // zoom handler can re-apply it after labels are re-rendered.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.__applySelection = (animate = false) => {
      const sel = el.__sel;
      if (!sel) return;
      const current = selectedRef.current;
      const neighbors = new Set([current]);
      if (current) {
        sel.linkSel.each((l) => {
          if (l.source.id === current) neighbors.add(l.target.id);
          if (l.target.id === current) neighbors.add(l.source.id);
        });
      }
      const tr = (selection) => (animate ? selection.transition().duration(250) : selection);
      tr(sel.nodeSel).style('opacity', (d) => (!current || neighbors.has(d.id) ? 1 : 0.22));
      tr(sel.labelSel()).style('opacity', (d) => (!current || neighbors.has(d.id) ? 1 : 0.15));
      sel.nodeSel
        .select('circle')
        .style('stroke', (d) => (d.id === current ? 'var(--ink)' : 'var(--bg)'))
        .attr('stroke-width', (d) => (d.id === current ? 3 : 2));
      tr(sel.linkSel)
        .attr('stroke', (l) => (current && (l.source.id === current || l.target.id === current) ? theme.linkActive : theme.link))
        .attr('stroke-opacity', (l) => (!current ? 0.18 + 0.5 * l.jaccard : l.source.id === current || l.target.id === current ? 0.9 : 0.05));
    };
    el.__applySelection(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, model, width]);

  return (
    <div ref={wrapRef} className="absolute inset-0 select-none">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="block"
        role="group"
        aria-label="Keyword bubble map"
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-xl border border-line bg-panel px-3 py-2 text-sm shadow-lg"
          style={{ left: Math.min(Math.max(8, tooltip.x + 14), (width || 0) - 220), top: Math.max(8, tooltip.y - 10) }}
        >
          <p className="font-semibold text-ink">{tooltip.d.name}</p>
          <p className="mt-0.5 text-ink-2 tabular-nums">
            {fmt(tooltip.d.count)} articles · {fmt(tooltip.d.journals)} journals · {fmt(tooltip.d.publishers)} publishers
          </p>
          {tooltip.d.id !== rootKey && rootKey && <p className="mt-0.5 text-xs text-ink-3">Tie to “{queryLabel}”: {Math.round(tooltip.d.strength * 100)}% of strongest</p>}
          <p className="mt-1 text-xs text-brand-500">Click to see its journals · drag to move</p>
        </div>
      )}

      {/* Zoom controls */}
      <div className="absolute top-1/2 right-3 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line bg-panel/90 shadow-sm backdrop-blur" role="group" aria-label="Zoom">
        {[
          ['+', 'Zoom in', () => zoomApi.current?.zoomBy(1.5)],
          ['−', 'Zoom out', () => zoomApi.current?.zoomBy(1 / 1.5)],
        ].map(([label, title, fn]) => (
          <button key={title} onClick={fn} title={title} aria-label={title} className="h-9 w-9 border-b border-line text-lg leading-none text-ink-2 hover:bg-brand-50 hover:text-brand-600">
            {label}
          </button>
        ))}
        <button onClick={() => zoomApi.current?.fit()} title="Fit all bubbles" aria-label="Fit all bubbles" className="flex h-9 w-9 items-center justify-center border-b border-line text-ink-2 hover:bg-brand-50 hover:text-brand-600">
          <Icon name="fit" className="h-4 w-4" />
        </button>
        <button onClick={() => zoomApi.current?.reset()} title="Reset view" aria-label="Reset view" className="h-9 w-9 text-[10px] font-semibold text-ink-3 tabular-nums hover:bg-brand-50 hover:text-brand-600">
          {Math.round(zoomLevel * 100)}%
        </button>
      </div>
      {zoomHint && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-tooltip/85 px-4 py-2 text-sm text-tooltip-ink">
          Use Ctrl / ⌘ + scroll (or pinch) to zoom · drag empty space to pan
        </div>
      )}

      {/* Legend + table toggle, floating bottom-right */}
      <div className="absolute right-3 bottom-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
        <div className="hidden items-center gap-3 rounded-full border border-line bg-panel/90 px-3 py-1.5 text-[11px] text-ink-2 shadow-sm backdrop-blur md:flex">
          <span>Size = articles (log)</span>
          <span className="flex items-center gap-1.5">
            <span className="flex overflow-hidden rounded-sm">
              {[...theme.ramp, theme.root].map((c) => (
                <span key={c} className="h-2.5 w-3" style={{ background: c }} />
              ))}
            </span>
            {rootKey ? `tie to “${queryLabel}”` : 'article count'}
          </span>
          <span className="text-ink-3">Ctrl/⌘ + scroll to zoom · drag to pan</span>
          <span className="flex items-center gap-1">
            <svg width="18" height="8" aria-hidden>
              <line x1="1" y1="4" x2="17" y2="4" stroke={theme.link} strokeWidth="3" strokeLinecap="round" />
            </svg>
            appear together
          </span>
        </div>
        <button className="flex items-center gap-1.5 rounded-full border border-line bg-panel/90 px-3 py-1.5 text-xs text-ink-2 shadow-sm backdrop-blur hover:text-brand-600" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          <Icon name="table" className="h-3.5 w-3.5" /> {showTable ? 'Hide table' : 'Table'}
        </button>
      </div>

      {showTable && (
        <div className="fade-up absolute right-3 bottom-14 z-20 max-h-[60%] w-[min(32rem,calc(100%-1.5rem))] overflow-auto rounded-2xl border border-line bg-panel shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs text-ink-3 uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Keyword</th>
                <th className="px-3 py-2 text-right font-medium">Articles</th>
                <th className="px-3 py-2 text-right font-medium">Journals</th>
                <th className="px-3 py-2 text-right font-medium">Years</th>
              </tr>
            </thead>
            <tbody>
              {model.map((k) => (
                <tr key={k.id} className={`border-t border-line hover:bg-brand-50 ${k.id === selectedId ? 'bg-brand-50' : ''}`}>
                  <td className="px-3 py-1.5">
                    <button className="text-left text-brand-600 hover:underline" onClick={() => onSelect(k.id, null)}>
                      {k.name}
                    </button>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(k.count)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(k.journals)}</td>
                  <td className="px-3 py-1.5 text-right text-ink-2 tabular-nums">{k.yearMin ? (k.yearMin === k.yearMax ? k.yearMin : `${k.yearMin}–${k.yearMax}`) : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
