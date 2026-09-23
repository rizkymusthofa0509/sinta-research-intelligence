import { categorize } from '../../../shared/categories.js';
import { crawlerConfig } from '../config/crawler.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('journals');

/** Loose key for comparing journal names: lower-case, no abbreviation in parentheses, no punctuation. */
export function journalKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(the|jurnal|journal)\b/g, (w) => (w === 'the' ? ' ' : 'journal'))
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSimilarity(a, b) {
  const A = new Set(a.split(' '));
  const B = new Set(b.split(' '));
  const inter = [...A].filter((t) => B.has(t)).length;
  return inter / (A.size + B.size - inter || 1);
}

function pickMatch(name, candidates) {
  const key = journalKey(name);
  const exact = candidates.find((c) => journalKey(c.name) === key);
  if (exact) return exact;
  // SINTA sometimes appends/omits a subtitle; accept only very close names.
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = tokenSimilarity(key, journalKey(c.name));
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 0.8 ? best : null;
}

// Memory-only cache shared across searches. Holds public journal metadata,
// never user queries, and expires after crawlerConfig.journalCacheTtlMs.
const cache = new Map();
const inflight = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > crawlerConfig.journalCacheTtlMs) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= crawlerConfig.journalCacheMaxEntries) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

/** Merge a Garuda journal profile into journal info without overwriting SINTA data. */
export function mergeProfile(info, profile, sintaBaseUrl) {
  return {
    coreSubjects: profile.coreSubjects,
    subjectAreas: profile.subjectAreas.length ? profile.subjectAreas : info.subjectAreas || [],
    issn: info.issn || profile.issn,
    eissn: info.eissn || profile.eissn,
    publisherName: info.publisherName || profile.publisherName,
    journalUrl: info.journalUrl || profile.journalUrl,
    sintaId: info.sintaId || profile.sintaId,
    sintaUrl: info.sintaUrl || (profile.sintaId ? `${sintaBaseUrl}/journals/profile/${profile.sintaId}` : null),
    profileLoaded: true,
  };
}

export class JournalResolver {
  constructor({ sinta, garuda, arjuna }) {
    this.sinta = sinta;
    this.garuda = garuda;
    this.arjuna = arjuna;
  }

  /**
   * Accreditation rank (S1–S6) from ARJUNA's latest decree for this journal.
   * An expired decree (> 5 years) is kept as history but does not count as a current rank.
   */
  async loadRank(info, { signal } = {}) {
    if (!info || info.rankLoaded) return info;
    const acc = await this.arjuna.latestAccreditation(
      { name: info.name, issn: info.issn, eissn: info.eissn },
      { signal, sameJournal: (n) => journalKey(n) === journalKey(info.name) },
    );
    info.rankLoaded = true;
    if (acc) {
      info.accreditation = acc;
      if (!acc.expired && !info.sintaRank) {
        info.sintaRank = acc.grade;
        info.rankSource = `ARJUNA (SK ${acc.decree || 'N/A'}, ${acc.decreeDate || 'N/A'})`;
      }
      info.journalUrl ||= acc.journalUrl;
      // SINTA lists every accredited journal by ISSN; a search link is the safest pointer.
      if (!info.sintaUrl && (info.eissn || info.issn)) {
        info.sintaUrl = `${this.sinta.baseUrl}/journals?q=${String(info.eissn || info.issn).replace('-', '')}`;
      }
    }
    return info;
  }

  /**
   * Resolve one journal name. Garuda (journal directory + profile) gives the
   * publisher, ISSN, subject area/category, website and the journal's SINTA id;
   * SINTA itself is asked for the accreditation rank. Returns null when the
   * journal cannot be identified.
   */
  async resolve(name, { signal } = {}) {
    const key = journalKey(name);
    if (!key) return null;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    if (inflight.has(key)) return inflight.get(key);

    const task = (async () => {
      const query = name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
      let info = null;
      let complete = true;

      try {
        const candidates = await this.garuda.searchJournals(query, { signal });
        const match = pickMatch(name, candidates);
        if (match) {
          info = { ...match, name: match.name, coreSubjects: [], sintaRank: null, sintaUrl: null, rankSource: null, profileLoaded: false };
        }
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        complete = false;
        log.debug(`Garuda journal lookup failed for "${name}": ${err.message}`);
      }

      // Accreditation rank from SINTA (by ISSN when we have one, else by name).
      try {
        const q = info?.eissn || info?.issn || query;
        const { journals } = await this.sinta.lookupJournals(q.replace('-', ''), { signal });
        const s = info?.eissn || info?.issn
          ? journals.find((j) => [j.issn, j.eissn].some((v) => v && (v === info.issn || v === info.eissn))) || pickMatch(name, journals)
          : pickMatch(name, journals);
        if (s) {
          info = {
            ...(info || { name: s.name, coreSubjects: [], subjectAreas: [] }),
            sintaRank: s.sintaRank,
            rankSource: s.sintaRank ? 'SINTA' : null,
            sintaUrl: s.sintaUrl,
            sintaId: s.sintaId,
            publisherSintaUrl: s.publisherSintaUrl,
            journalUrl: info?.journalUrl || s.journalUrl,
            publisherName: info?.publisherName || s.publisherName,
            issn: info?.issn || s.issn,
            eissn: info?.eissn || s.eissn,
            scopusIndexed: s.scopusIndexed,
            impact: s.impact,
            h5Index: s.h5Index,
          };
        }
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        // SINTA refusing access (403) is expected; the rank simply stays N/A.
        if (err.code !== 'HOST_BLOCKED' && err.code !== 'FORBIDDEN') complete = false;
      }

      if (info) info.categories = categorize(info.coreSubjects, info.subjectAreas);
      // Only cache complete answers; transient failures may succeed next time.
      if (complete || info) cacheSet(key, info);
      return info;
    })().finally(() => inflight.delete(key));

    inflight.set(key, task);
    return task;
  }

  /**
   * Add the Garuda journal profile (core subject, website, SINTA id) to a
   * resolved journal. One extra request, so the search pipeline only does this
   * for the most relevant journals; the UI loads the rest on demand.
   */
  async loadProfile(info, { signal } = {}) {
    if (!info?.garudaUrl || info.profileLoaded) return info;
    const profile = await this.garuda.fetchJournalProfile(info.garudaUrl, { signal });
    Object.assign(info, mergeProfile(info, profile, this.sinta.baseUrl));
    info.categories = categorize(info.coreSubjects, info.subjectAreas);
    return info;
  }

  /** Resolve many names with a concurrency cap and time budget. Returns Map(key → info|null). */
  async resolveMany(names, { signal, onProgress, deadline } = {}) {
    const unique = [...new Map(names.filter(Boolean).map((n) => [journalKey(n), n])).entries()];
    const results = new Map();
    let done = 0;
    const queue = unique.slice(0, crawlerConfig.sintaResolve.maxJournals);
    const workers = Array.from({ length: Math.min(crawlerConfig.sintaResolve.concurrency, queue.length) }, async () => {
      while (queue.length) {
        if (deadline && Date.now() > deadline) return;
        const [key, name] = queue.shift();
        const info = await this.resolve(name, { signal });
        results.set(key, info);
        done += 1;
        onProgress?.({ done, total: unique.length, name, info });
      }
    });
    await Promise.all(workers);
    return results;
  }
}
