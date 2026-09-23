import { interpolateRgbBasis } from 'd3';

// Single-hue sequential ramps for magnitude (heatmap), own steps per theme:
// light: pale → dark blue; dark: dim → bright blue. Zero stays empty (surface).
const SEQUENTIAL = {
  light: ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
  dark: ['#1c5cab', '#2a78d6', '#5598e7', '#86b6ef', '#b7d3f6', '#e6f0fd'],
};

// Diverging blue ↔ red with a neutral gray midpoint (palette reference pair).
const DIVERGING = {
  light: { neg: ['#e34948', '#f0a3a2'], mid: '#f0efec', pos: ['#9ec5f4', '#2a78d6'] },
  dark: { neg: ['#e66767', '#8a3a3a'], mid: '#383835', pos: ['#24476f', '#3987e5'] },
};

const luminance = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const toHex = (rgb) => {
  const m = rgb.match(/\d+/g);
  return m ? `#${m.slice(0, 3).map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : rgb;
};

/** Ink colour with the better contrast on a given fill. */
export const inkOn = (fill) => (luminance(toHex(fill)) > 0.22 ? '#0b0b0b' : '#ffffff');

/** value 0..max → fill (null for zero). */
export function sequentialScale(theme, max) {
  const interp = interpolateRgbBasis(SEQUENTIAL[theme] || SEQUENTIAL.light);
  return (v) => (v ? toHex(interp(Math.sqrt(v / Math.max(max, 1)))) : null);
}

/** lift (0 = never together, 1 = as expected, ≥2 = strongly together) → fill. */
export function divergingScale(theme) {
  const d = DIVERGING[theme] || DIVERGING.light;
  const neg = interpolateRgbBasis([d.neg[0], d.neg[1], d.mid]);
  const pos = interpolateRgbBasis([d.mid, d.pos[0], d.pos[1]]);
  return (lift) => {
    if (lift == null) return null;
    if (lift < 1) return toHex(neg(Math.max(0, lift)));
    return toHex(pos(Math.min(1, (lift - 1) / 2)));
  };
}

export const divergingStops = (theme) => {
  const d = DIVERGING[theme] || DIVERGING.light;
  return [d.neg[0], d.neg[1], d.mid, d.pos[0], d.pos[1]];
};
export const sequentialStops = (theme) => SEQUENTIAL[theme] || SEQUENTIAL.light;
