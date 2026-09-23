// Query planning for title-like keywords.
//
// Garuda matches all words of a query, so a full working title ("Pengembangan
// Sistem Eksplorasi Topik Penelitian Berbasis Web Crawling") usually finds
// nothing. The planner keeps the full phrase as the first attempt and derives
// the core concepts of the title ("eksplorasi topik", "web crawling"), plus
// English equivalents for common Indonesian research terms, to search next.

import { canonicalKeyword } from './keywordAnalyzer.js';
import { ACADEMIC_WORDS, GENERIC_UNIGRAMS, STOPWORDS } from './stopwords.js';

// Words that frame a title but are not its topic.
const FRAME_WORDS = new Set(
  `pengembangan sistem berbasis rancang bangun perancangan implementasi penerapan analisis aplikasi studi kasus
  menggunakan metode model pendekatan evaluasi optimasi optimalisasi pemanfaatan peran pengaruh hubungan faktor
  terhadap pada dalam untuk dengan melalui sebagai tinjauan literatur sistematis penelitian riset kajian upaya strategi
  development system systems based design implementation application analysis study case using method model approach
  evaluation optimization role effect influence factor factors toward towards through review systematic research framework
  proposed novel new improved`
    .split(/\s+/)
    .filter(Boolean),
);

// Small bilingual glossary for frequent research terms (Indonesian → English).
const GLOSSARY = {
  eksplorasi: 'exploration', topik: 'topic', penelitian: 'research', perayapan: 'crawling', 'web crawling': 'web crawling',
  kecerdasan: 'intelligence', buatan: 'artificial', pembelajaran: 'learning', mesin: 'machine', mendalam: 'deep',
  jaringan: 'network', saraf: 'neural', citra: 'image', pengolahan: 'processing', klasifikasi: 'classification',
  prediksi: 'prediction', deteksi: 'detection', pengenalan: 'recognition', sentimen: 'sentiment', teks: 'text',
  informasi: 'information', data: 'data', penambangan: 'mining', kesehatan: 'health', pendidikan: 'education',
  pertanian: 'agriculture', keuangan: 'finance', pemasaran: 'marketing', digital: 'digital', keamanan: 'security',
  visualisasi: 'visualization', rekomendasi: 'recommendation', pencarian: 'search', kata: 'word', kunci: 'key',
  bahasa: 'language', alami: 'natural', gizi: 'nutrition', anak: 'child', balita: 'toddler', ibu: 'mother',
  hamil: 'pregnant', ekonomi: 'economy', usaha: 'business', kecil: 'small', menengah: 'medium', mikro: 'micro',
  kurikulum: 'curriculum', siswa: 'student', guru: 'teacher', lingkungan: 'environment', energi: 'energy',
  terbarukan: 'renewable', pariwisata: 'tourism', hukum: 'law', perlindungan: 'protection', konsumen: 'consumer',
};

const isFrame = (w) => FRAME_WORDS.has(w) || ACADEMIC_WORDS.has(w) || STOPWORDS.has(w);

function words(text) {
  return (String(text || '').match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) || []).map((w) => canonicalKeyword(w)).filter(Boolean);
}

/** Content terms of a query, used for relevance scoring. */
export function queryTerms(query) {
  return [...new Set(words(query).filter((w) => !isFrame(w) && !GENERIC_UNIGRAMS.has(w) && w.length > 2))];
}

/** English rendering of an Indonesian phrase when every word is in the glossary (head-first → head-last). */
function translate(phrase) {
  if (GLOSSARY[phrase]) return GLOSSARY[phrase] === phrase ? null : GLOSSARY[phrase];
  const parts = phrase.split(' ');
  if (!parts.every((p) => GLOSSARY[p])) return null;
  const en = parts.map((p) => GLOSSARY[p]).reverse().join(' ');
  return en === phrase ? null : en;
}

/**
 * Plan the searches for a query.
 *   { strategy: 'direct' | 'expanded', concepts: [{ query, kind: 'full'|'concept'|'translation' }] }
 */
export function planQuery(query, { maxConcepts = 5 } = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim();
  const all = words(q);
  const content = all.filter((w) => !isFrame(w));
  if (all.length <= 3 || content.length <= 2) {
    return { strategy: 'direct', concepts: [{ query: q, kind: 'full' }] };
  }

  // Split the title at frame words: "…sistem [eksplorasi topik] penelitian berbasis [web crawling]".
  const segments = [];
  let current = [];
  for (const w of all) {
    if (isFrame(w)) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(w);
  }
  if (current.length) segments.push(current);

  const concepts = [];
  const add = (text, kind) => {
    const t = text.trim();
    if (t.length >= 3 && !concepts.some((c) => c.query === t)) concepts.push({ query: t, kind });
  };
  // Long segments become overlapping pairs so each search stays findable.
  for (const seg of segments.sort((a, b) => b.length - a.length)) {
    if (seg.length <= 3) add(seg.join(' '), 'concept');
    else for (let i = 0; i + 2 <= seg.length; i += 2) add(seg.slice(i, i + 2).join(' '), 'concept');
  }
  // A lone single-word segment is too broad on its own unless nothing else exists.
  const multi = concepts.filter((c) => c.query.includes(' '));
  const base = multi.length ? multi : concepts;
  const withTranslations = [];
  for (const c of base) {
    withTranslations.push(c);
    const en = translate(c.query);
    if (en) withTranslations.push({ query: en, kind: 'translation', of: c.query });
  }
  return {
    strategy: 'expanded',
    concepts: [{ query: q, kind: 'full' }, ...withTranslations.slice(0, maxConcepts)],
  };
}

/**
 * What "similar to my query" means: its key terms, and its concepts as phrases
 * (a translation belongs to the same concept group as its source).
 */
export function relevanceModel(query, plan) {
  const terms = queryTerms(query);
  const groups = new Map();
  const concepts = plan?.strategy === 'expanded' ? plan.concepts.filter((c) => c.kind !== 'full') : [{ query, kind: 'full' }];
  for (const c of concepts) {
    const key = c.of || c.query;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(words(c.query).join(' '));
  }
  return { terms, groups: [...groups.values()] };
}

/**
 * Similarity of an article to the query (0..1):
 *   0.6 × share of concept groups present as whole phrases + 0.4 × share of key terms present.
 * An article that uses "web crawling" as a phrase ranks above one that merely mentions "web".
 */
export function relevanceTo(article, model) {
  const { terms, groups } = model;
  if (!terms.length) return { score: 0, matched: [] };
  const text = ` ${words(`${article.title || ''} ${article.abstract || ''} ${(article.keywords || []).join(' ')}`).join(' ')} `;
  const matched = terms.filter((t) => text.includes(` ${t} `));
  const phraseHits = groups.filter((variants) => variants.some((v) => v && text.includes(` ${v} `))).length;
  const score = (groups.length ? 0.6 * (phraseHits / groups.length) : 0) + 0.4 * (matched.length / terms.length);
  return { score: Math.round(score * 100) / 100, matched };
}

/**
 * For an expanded plan, the keyword map is centred on the concept that found the
 * most articles (the full title rarely appears verbatim in any article).
 */
export function analysisQueryFor(plan, articles, fallback) {
  if (!plan || plan.strategy !== 'expanded') return fallback;
  const counts = new Map();
  for (const a of articles) if (a.matchedQuery) counts.set(a.matchedQuery, (counts.get(a.matchedQuery) || 0) + 1);
  const concept = plan.concepts
    .filter((c) => c.kind !== 'full')
    .sort((x, y) => (counts.get(y.query) || 0) - (counts.get(x.query) || 0))[0];
  const full = counts.get(plan.concepts[0].query) || 0;
  return concept && (counts.get(concept.query) || 0) > full ? concept.query : fallback;
}
