import { crawlerConfig, sources } from '../config/crawler.js';
import { fetchJson } from '../utils/browser.js';
import { SourceCrawler } from './SourceCrawler.js';

const digits = (v) => String(v || '').replace(/[^0-9Xx]/g, '').toUpperCase();

/**
 * ARJUNA (Akreditasi Jurnal Nasional) is the Ministry's journal accreditation
 * system. SINTA's S1–S6 rank is the "Peringkat" set by ARJUNA accreditation
 * decrees (SK). ARJUNA's public front page exposes, without login:
 *   - api/frontpage/getJurnalList?search=   one row per accreditation proposal
 *   - api/frontpage/getJurnalProgres/:id    the result of that proposal (grade + SK)
 * We use those public JSON endpoints — the same ones arjuna.kemdiktisaintek.go.id calls.
 */
export class ArjunaCrawler extends SourceCrawler {
  constructor() {
    super(sources.arjuna);
    this.apiBase = sources.arjuna.apiBase;
  }

  async searchProposals(query, { signal } = {}) {
    const url = new URL('api/frontpage/getJurnalList', this.apiBase);
    url.searchParams.set('page', '1');
    url.searchParams.set('row', '20');
    url.searchParams.set('search', query);
    url.searchParams.set('order', '');
    const { json } = await fetchJson(url.toString(), { signal });
    const rows = json?.data?.data || [];
    const byId = new Map();
    for (const r of rows) {
      if (!r.id_usulan_akreditasi || byId.has(r.id_usulan_akreditasi)) continue;
      byId.set(r.id_usulan_akreditasi, {
        proposalId: Number(r.id_usulan_akreditasi),
        journalId: r.id_jurnal,
        name: r.nama_jurnal,
        eissn: digits(r.eissn) || null,
        publisher: r.publisher || null,
        journalUrl: r.url_jurnal || null,
      });
    }
    return [...byId.values()];
  }

  async proposalResult(proposalId, { signal } = {}) {
    const url = new URL(`api/frontpage/getJurnalProgres/${encodeURIComponent(proposalId)}`, this.apiBase);
    const { json } = await fetchJson(url.toString(), { signal });
    return json?.data || null;
  }

  /**
   * Latest accreditation decree for a journal, identified by ISSN/E-ISSN (preferred) or name.
   * Returns { grade: 'S3', decree, decreeTitle, decreeDate, expired, source } or null.
   */
  async latestAccreditation({ name, issn, eissn }, { signal, sameJournal } = {}) {
    const ids = [digits(eissn), digits(issn)].filter((v) => v.length === 8);
    const query = ids[0] || name;
    if (!query) return null;
    let proposals = await this.searchProposals(query, { signal });
    // Keep only proposals of this journal (ISSN match, or a caller-provided name check).
    proposals = proposals.filter((p) => (ids.length ? ids.includes(p.eissn) : sameJournal ? sameJournal(p.name) : true));
    if (!proposals.length && ids[1] && ids[1] !== query) {
      proposals = (await this.searchProposals(ids[1], { signal })).filter((p) => ids.includes(p.eissn));
    }

    // Newest proposal first; stop at the first one with a decided grade.
    proposals.sort((a, b) => b.proposalId - a.proposalId);
    for (const p of proposals.slice(0, crawlerConfig.accreditation.maxProposalsPerJournal)) {
      const r = await this.proposalResult(p.proposalId, { signal });
      const grade = Number(r?.grade_akreditasi);
      if (r?.sts_hasil_akreditasi === '1' && grade >= 1 && grade <= 6) {
        const decreeDate = r.tgl_sk ? r.tgl_sk.slice(0, 10) : null;
        // An accreditation is valid for five years from the decree.
        const expired = decreeDate ? new Date(decreeDate).getTime() + 5 * 365.25 * 864e5 < Date.now() : false;
        return {
          grade: `S${grade}`,
          decree: r.no_sk || null,
          decreeTitle: r.judul_sk || null,
          decreeDate,
          expired,
          proposalId: p.proposalId,
          journalUrl: p.journalUrl,
          source: 'ARJUNA',
        };
      }
    }
    return null;
  }
}
