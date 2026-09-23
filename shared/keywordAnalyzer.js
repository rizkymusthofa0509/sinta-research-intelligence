import { ACADEMIC_WORDS, COMMON_WORDS, GENERIC_UNIGRAMS, ID_COMMON_WORDS, STOPWORDS } from './stopwords.js';

/**
 * Keyword extraction
 * ------------------
 * 1. Author keywords (from the article page meta tags) are used as-is.
 * 2. Title + abstract are split into candidate phrases at stopwords and
 *    punctuation (RAKE style); 1–4 word n-grams inside each chunk become candidates
 *    (single words from titles only; phrases cutting through the query are skipped).
 * 3. Everything is mapped to a canonical form (see canonicalKeyword) and
 *    acronyms defined in the corpus ("Internet of Things (IoT)") are aliased
 *    to their expansion.
 * 4. Corpus-level selection: a phrase must appear in ≥ minDf articles; a
 *    shorter phrase is dropped when a longer phrase containing it covers
 *    ≥ 90% of its articles ("language processing" → "natural language processing").
 * Counts are document frequency: the number of articles containing the keyword.
 */

const SMALL_WORDS = new Set(['of', 'and', 'in', 'for', 'on', 'the', 'to', 'a', 'an', 'dan', 'di', 'untuk', 'yang', 'pada', 'dalam', 'dengan', 'ke', 'dari']);

// Words where a trailing "s" is not a plural.
const S_EXCEPTIONS = /(ss|us|is|ics|ous|sis|xis|ys|as|os)$/;
const S_WORDS = new Set(['bayes', 'means', 'series', 'species', 'diabetes', 'news', 'status', 'corpus', 'lens', 'aids', 'covid', 'mathematics', 'physics', 'economics', 'ethics', 'logistics', 'analytics', 'robotics', 'genetics', 'statistics', 'linguistics', 'electronics', 'sales', 'kubernetes', 'windows', 'ios', 'dss']);

function singularize(word) {
  if (S_WORDS.has(word)) return word;
  if (/ies$/.test(word) && word.length > 5) return word.slice(0, -3) + 'y'; // technologies → technology
  if (word.length <= 4 || S_EXCEPTIONS.test(word)) return word;
  if (/(ches|shes|xes|sses)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/**
 * "Machine Learning", "machine-learning", "MACHINE LEARNING" → "machine learning".
 * Only the last word is singularised ("neural networks" → "neural network");
 * no stemming or translation, so different concepts stay separate.
 */
export function canonicalKeyword(text) {
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // "naïve" → "naive"
    .replace(/['’]s\b/g, '') // possessive: "children's" → "children"
    .replace(/[‐-―_/]+/g, ' ')
    .replace(/[-]+/g, ' ')
    .replace(/[^\p{L}\p{N}+#.\s]/gu, ' ')
    .replace(/(?<!\w)\.|\.(?!\w)/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  words[words.length - 1] = singularize(words[words.length - 1]);
  return words.join(' ');
}

export function displayCase(canonical) {
  return canonical
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}'’+#.-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]|[.,;:!?()[\]{}"“”]/gu;

function tokenize(text) {
  return (text.match(TOKEN_RE) || []).map((orig) => ({ orig, norm: orig.toLowerCase() }));
}

function isBreak(tok) {
  const n = tok.norm;
  if (CONNECTORS.has(n)) return false;
  return /^[.,;:!?()[\]{}"“”]$/.test(n) || STOPWORDS.has(n) || /^\d+([.,]\d+)?$/.test(n) || n.length < 2;
}

/** Find "Long Form (LF)" definitions and return Map(acronym canonical → expansion canonical). */
export function findAcronyms(text) {
  const map = new Map();
  const re = /((?:[\p{L}][\p{L}-]*\s+){1,6}?[\p{L}][\p{L}-]*)\s*\(\s*([A-Z][A-Za-z0-9]{1,7})\s*\)/gu;
  for (const m of text.matchAll(re)) {
    const acronym = m[2].replace(/s$/, '');
    const letters = acronym.replace(/[^A-Za-z]/g, '').toLowerCase();
    const words = m[1].split(/[\s-]+/).filter(Boolean);
    // Take the shortest tail of words whose initials spell the acronym.
    // Small words may or may not contribute a letter: "IoT" = Internet of Things, "SVM" = Support Vector Machine.
    for (let start = words.length - 1; start >= 0; start--) {
      const tail = words.slice(start);
      const all = tail.map((w) => w[0].toLowerCase()).join('');
      const content = tail.filter((w) => !SMALL_WORDS.has(w.toLowerCase())).map((w) => w[0].toLowerCase()).join('');
      if (content === letters || all === letters) {
        map.set(canonicalKeyword(acronym), canonicalKeyword(tail.join(' ')));
        break;
      }
      if (content.length > letters.length) break;
    }
  }
  return map;
}

/** Canonical form of every word in a text (each word singularised), for phrase lookups. */
function canonicalWords(text) {
  return (text.match(TOKEN_RE) || []).map((t) => canonicalKeyword(t)).filter(Boolean).join(' ');
}

/** Expand defined acronyms inside a canonical phrase: "ai system" → "artificial intelligence system". */
function expandAcronyms(canonical, aliases) {
  if (aliases.has(canonical)) return aliases.get(canonical);
  const words = canonical.split(' ');
  if (words.length === 1) return canonical;
  return words.map((w) => aliases.get(w) ?? w).join(' ');
}

// Indonesian verb forms (meng-/meny- prefixes, di-/me-…-kan) are never topic heads or tails.
const ID_VERB = /^(meng|meny)\p{L}{3,}$|^(mem|men|me|di|ber|ter|per)\p{L}{3,}(kan|lah)$/u;
const EDGE_BAD = (w) =>
  STOPWORDS.has(w) || ACADEMIC_WORDS.has(w) || ID_COMMON_WORDS.has(w) || ID_VERB.test(w) || /ly$/.test(w) || /^\d/.test(w);
// Connector words allowed inside a phrase ("internet of things", "quality of service").
const CONNECTORS = new Set(['of']);

/**
 * Extract candidate phrases (canonical) with their surface forms from one text.
 * Single-word candidates are only taken when allowUnigrams is set (titles):
 * abstracts are full of single verbs/adjectives that are not topics.
 */
function candidatesFromText(text, aliases, { allowUnigrams = true, queryWords = [] } = {}) {
  const found = new Map(); // canonical -> surface
  const cleaned = text.replace(/\(\s*[A-Z][A-Za-z0-9]{1,7}s?\s*\)/g, ' , '); // drop "(IoT)" after its expansion
  const tokens = tokenize(cleaned);
  let chunk = [];
  const flush = () => {
    // Where the query phrase occurs in this chunk: n-grams that cut through such an
    // occurrence ("teknologi artificial" from "teknologi artificial intelligence") are skipped.
    const hits = [];
    if (queryWords.length > 1) {
      for (let q = 0; q + queryWords.length <= chunk.length; q++) {
        if (queryWords.every((w, k) => canonicalKeyword(chunk[q + k].orig) === w || chunk[q + k].norm === w)) hits.push(q);
      }
    }
    const cutsQuery = (i, n) =>
      hits.some((q) => {
        const overlap = Math.min(i + n, q + queryWords.length) - Math.max(i, q);
        return overlap > 0 && !(i <= q && i + n >= q + queryWords.length);
      });
    for (let n = 1; n <= 4; n++) {
      for (let i = 0; i + n <= chunk.length; i++) {
        if (cutsQuery(i, n)) continue;
        const gram = chunk.slice(i, i + n);
        // Phrases must not start or end with a filler word; 4-word phrases need a connector ("internet of things of …").
        if (ACADEMIC_WORDS.has(gram[0].norm) || ACADEMIC_WORDS.has(gram[gram.length - 1].norm)) continue;
        if (n === 4 && !gram.some((t) => CONNECTORS.has(t.norm))) continue;
        if (gram.filter((t) => CONNECTORS.has(t.norm)).length > 1) continue;
        const surface = gram.map((t) => t.orig).join(' ');
        let canonical = canonicalKeyword(surface);
        if (!canonical || canonical.length < 3) continue;
        const words = canonical.split(' ');
        if (EDGE_BAD(words[0]) || EDGE_BAD(words[words.length - 1])) continue;
        if (words.length === 1) {
          // Acronyms defined in the corpus are always fine ("IoT").
          if (!aliases.has(canonical)) {
            if (!allowUnigrams || GENERIC_UNIGRAMS.has(canonical) || canonical.length < 4) continue;
            // Adverbs and past-tense verbs. ("-ing" words stay: learning, mining, nursing, stunting.)
            if (/(ly|ed)$/.test(canonical) && canonical.length > 5) continue;
          }
        } else if (words.every((w) => COMMON_WORDS.has(w) || GENERIC_UNIGRAMS.has(w))) {
          continue; // phrases made only of generic words ("digital development") are not topics
        }
        canonical = expandAcronyms(canonical, aliases);
        if (!found.has(canonical)) found.set(canonical, surface);
      }
    }
    chunk = [];
  };
  for (const tok of tokens) {
    if (isBreak(tok)) flush();
    else chunk.push(tok);
    if (chunk.length >= 7) flush(); // very long runs are rarely one concept
  }
  flush();
  return found;
}

/** Pick the display label: a short acronym or a mixed-case author spelling, else Title Case. */
function labelFor(canonical, surface) {
  if (!surface || canonicalKeyword(surface) !== canonical) return displayCase(canonical);
  const isUpper = surface === surface.toUpperCase();
  const isLower = surface === surface.toLowerCase();
  if (isUpper && surface.replace(/\s/g, '').length <= 6) return surface; // "IoT", "SVM", "UMKM"
  if (!isUpper && !isLower && /^[A-Z]/.test(surface)) return surface; // "Internet of Things", "YOLOv8"
  return displayCase(canonical);
}

/**
 * Many Indonesian abstracts end with "Keywords: a; b; c" or "Kata kunci: a, b, c".
 * Those are genuine author keywords; split them off the abstract text.
 */
export function splitInlineKeywords(abstract) {
  if (!abstract) return { abstract: abstract || '', keywords: [] };
  const m = abstract.match(/\b(?:key\s?words?|kata[\s-]?kunci)\s*[:：\-–—]\s*(.+)$/i);
  if (!m) return { abstract, keywords: [] };
  // The keyword line ends at the first sentence break (an English abstract may follow).
  const line = m[1].split(/\.\s+(?=[A-Z])|\s{2,}|\b(?:abstract|abstrak)\b/i)[0];
  const list = line
    .split(/\s*[;,•|]\s*/)
    .map((k) => k.replace(/[.\s]+$/, '').trim())
    .filter((k) => k.length >= 2 && k.length <= 60 && k.split(/\s+/).length <= 6);
  // A sentence-long "list" means the match was not a keyword line.
  if (!list.length || list.length > 12) return { abstract, keywords: [] };
  return { abstract: abstract.slice(0, m.index), keywords: list };
}

function containsPhrase(longer, shorter) {
  return ` ${longer} `.includes(` ${shorter} `);
}

/**
 * Analyse a corpus of normalised articles. Mutates nothing; returns
 *   { perArticle: Map(articleId → string[] canonical keywords), labels: {canonical: display}, aliases }
 */
export function analyzeKeywords(articles, { query = '', minDf = 2, maxPerArticle = 25 } = {}) {
  const corpusText = articles.map((a) => `${a.title || ''}. ${a.abstract || ''}`).join('\n');
  const aliases = findAcronyms(corpusText);
  const queryKey = expandAcronyms(canonicalKeyword(query), aliases);
  const queryWords = queryKey.split(' ').filter(Boolean);

  const surfaces = new Map(); // canonical -> Map(surface -> count)
  const addSurface = (canonical, surface, weight = 1) => {
    if (!surfaces.has(canonical)) surfaces.set(canonical, new Map());
    const m = surfaces.get(canonical);
    m.set(surface, (m.get(surface) || 0) + weight);
  };

  const authorSets = new Map();
  const textSets = new Map();
  const df = new Map();
  const authorDf = new Map();

  for (const a of articles) {
    const authorKw = new Set();
    const { abstract, keywords: inlineKeywords } = splitInlineKeywords(a.abstract);
    for (const kw of [...(a.keywords || []), ...inlineKeywords]) {
      let c = canonicalKeyword(kw);
      if (!c || c.length < 2 || c.split(' ').length > 6) continue;
      c = expandAcronyms(c, aliases);
      authorKw.add(c);
      addSurface(c, kw.trim(), 3); // author spelling is the preferred label
    }
    const fromText = candidatesFromText(a.title || '', aliases, { allowUnigrams: true, queryWords });
    for (const [c, surface] of candidatesFromText(abstract || '', aliases, { allowUnigrams: false, queryWords })) {
      if (!fromText.has(c)) fromText.set(c, surface);
    }
    for (const [c, surface] of fromText) addSurface(c, surface);
    const textKw = new Set(fromText.keys());
    // The searched topic always counts when the article mentions it.
    if (queryKey && ` ${canonicalWords(`${a.title || ''} ${abstract || ''}`)} `.includes(` ${queryKey} `)) textKw.add(queryKey);

    authorSets.set(a.id, authorKw);
    textSets.set(a.id, textKw);
    for (const c of new Set([...authorKw, ...textKw])) df.set(c, (df.get(c) || 0) + 1);
    for (const c of authorKw) authorDf.set(c, (authorDf.get(c) || 0) + 1);
  }

  const threshold = articles.length < 15 ? 1 : minDf;

  // Candidate vocabulary. Fragments of the query itself ("machine" for
  // "machine learning") are dropped: they only echo the search term.
  const isQueryFragment = (c) => c !== queryKey && queryKey.includes(' ') && containsPhrase(queryKey, c);
  // "artificial intelligence technology", "teknologi artificial intelligence": the query plus
  // only generic words adds nothing beyond the query itself.
  const isQueryEcho = (c) => {
    if (!queryKey || c === queryKey || !containsPhrase(c, queryKey)) return false;
    const rest = ` ${c} `.replace(` ${queryKey} `, ' ').trim().split(' ').filter(Boolean);
    return rest.every((w) => GENERIC_UNIGRAMS.has(w) || STOPWORDS.has(w) || CONNECTORS.has(w) || ID_VERB.test(w));
  };
  let vocab = [...df.entries()].filter(
    ([c, n]) => (n >= threshold || authorDf.has(c) || c === queryKey) && !isQueryFragment(c) && !isQueryEcho(c),
  );

  // Subsumption: drop a phrase when a longer phrase containing it covers ≥ 90% of its articles.
  const byLength = [...vocab].sort((x, y) => y[0].split(' ').length - x[0].split(' ').length);
  const dropped = new Set();
  for (const [shorter, nShort] of vocab) {
    if (shorter === queryKey || authorDf.get(shorter) >= 2) continue;
    for (const [longer, nLong] of byLength) {
      if (longer.split(' ').length <= shorter.split(' ').length) break;
      if (!dropped.has(longer) && containsPhrase(longer, shorter) && nLong >= 0.9 * nShort) {
        dropped.add(shorter);
        break;
      }
    }
  }
  vocab = vocab.filter(([c]) => !dropped.has(c));
  const keep = new Set(vocab.map(([c]) => c));

  const perArticle = new Map();
  for (const a of articles) {
    const set = new Set([...authorSets.get(a.id)].filter((c) => keep.has(c)));
    const ranked = [...textSets.get(a.id)]
      .filter((c) => keep.has(c) && !set.has(c))
      .sort((x, y) => (df.get(y) || 0) - (df.get(x) || 0) || y.split(' ').length - x.split(' ').length);
    for (const c of ranked) {
      if (set.size >= maxPerArticle) break;
      set.add(c);
    }
    perArticle.set(a.id, [...set]);
  }

  const labels = {};
  for (const c of keep) {
    const forms = surfaces.get(c);
    let best = null;
    let bestCount = -1;
    if (forms) {
      for (const [surface, count] of forms) {
        // Titles are often ALL CAPS; prefer a mixed-case spelling when one exists.
        const allCaps = surface === surface.toUpperCase() && /[A-Z]{4,}/.test(surface);
        const score = count - (allCaps ? 1000 : 0);
        if (score > bestCount) {
          best = surface;
          bestCount = score;
        }
      }
    }
    labels[c] = labelFor(c, best);
  }

  const acronyms = Object.fromEntries([...aliases.entries()].filter(([, exp]) => keep.has(exp)));
  return { perArticle, labels, aliases: acronyms, queryKey };
}
