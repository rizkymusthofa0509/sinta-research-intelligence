import { CATEGORIES } from '../../../shared/categories.js';

export { CATEGORIES };

const byId = new Map(CATEGORIES.map((c) => [c.id, c]));

export function categoryLabel(id, { bilingual = false } = {}) {
  if (id === 'unknown') return 'Unknown';
  const c = byId.get(id);
  if (!c) return id;
  return bilingual ? `${c.label} · ${c.labelId}` : c.label;
}
