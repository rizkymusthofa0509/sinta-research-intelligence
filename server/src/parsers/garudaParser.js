import * as cheerio from 'cheerio';
import { extractDoi, toHttpUrl } from '../utils/urlValidator.js';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

/**
 * Split a Garuda venue line such as
 *   "Jurnal Yuridis Vol 11 No 2 (2024): Jurnal Yuridis"
 *   "IAES International Journal of Artificial Intelligence (IJ-AI) Vol 15, No 3: June 2026"
 * into journal name, issue text and year. Returns nulls when a part is not present.
 */
export function parseVenue(venue) {
  const text = clean(venue);
  if (!text) return { journalName: null, issue: null, year: null };

  const cut = text.search(/\s+(?:Vol(?:ume)?\.?\s*\d|No\.?\s*\d|Issue\s*\d|\(\d{4}\)|\d{4}\s*:)/i);
  const journalName = clean(cut > 0 ? text.slice(0, cut) : text.split(':')[0]);
  const issue = cut > 0 ? clean(text.slice(cut)) : null;

  // Prefer a year in parentheses "(2024)", then "Month 2026", then any 19xx/20xx.
  const yearMatch =
    text.match(/\((19\d{2}|20\d{2})\)/) ||
    text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December|Januari|Februari|Maret|Mei|Juni|Juli|Agustus|Oktober|Desember)\s+(19\d{2}|20\d{2})/i) ||
    text.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const currentYear = new Date().getFullYear() + 1;
  return { journalName, issue, year: year && year <= currentYear ? year : null };
}

/** Parse one Garuda document search results page. */
export function parseGarudaSearch(html, baseUrl) {
  const $ = cheerio.load(html);

  const info = clean($('.pagination-info').first().text()) || '';
  const totalMatch = info.match(/Total Record\s*:\s*([\d.,]+)/i);
  const pagesMatch = info.match(/Page\s+\d+\s+of\s+([\d.,]+)/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/[.,]/g, '')) : null;
  const totalPages = pagesMatch ? Number(pagesMatch[1].replace(/[.,]/g, '')) : null;

  const items = [];
  $('.article-item').each((_, el) => {
    const item = $(el);
    const titleLink = item.find('a.title-article').first();
    const title = clean(titleLink.text());
    if (!title) return;

    const detailUrl = toHttpUrl(titleLink.attr('href'), baseUrl);
    const garudaId = detailUrl?.match(/detail\/(\d+)/)?.[1] ?? null;

    const authors = item
      .find('a.author-article')
      .map((__, a) => ({ name: clean($(a).text()), profileUrl: toHttpUrl($(a).attr('href'), baseUrl) }))
      .get()
      .filter((a) => a.name);

    // The venue line and the publisher both use <xmp class="subtitle-article">;
    // the publisher one follows an <i>Publisher :</i> label.
    let venue = null;
    let publisher = null;
    item.find('xmp.subtitle-article, .subtitle-article').each((__, node) => {
      const n = $(node);
      const text = clean(n.text());
      if (!text || n.is('i')) return;
      const prev = n.prevAll('i.subtitle-article').first();
      if (prev.length && /publisher/i.test(prev.text()) && n.prev().is('i')) publisher = text;
      else if (!venue) venue = text;
    });

    let articleUrl = null;
    let downloadUrl = null;
    let doi = null;
    item.find('a.title-citation').each((__, a) => {
      const label = clean($(a).text()) || '';
      const href = $(a).attr('href');
      if (/original source/i.test(label)) articleUrl = toHttpUrl(href);
      else if (/download original/i.test(label)) downloadUrl = toHttpUrl(href);
      else if (/^DOI/i.test(label) || /doi\.org/i.test(href || '')) doi = extractDoi(label) || extractDoi(href);
    });

    const abstract = clean(item.find('.abstract-article').first().text());
    const { journalName, issue, year } = parseVenue(venue);

    items.push({
      garudaId,
      title,
      authors: authors.map((a) => a.name),
      authorProfiles: authors,
      abstract,
      venue,
      journalName,
      issue,
      publicationYear: year,
      publisherName: publisher,
      doi,
      articleUrl,
      downloadUrl,
      garudaUrl: detailUrl,
    });
  });

  return { total, totalPages, items };
}

/** Parse a Garuda journal profile page (/journal/view/:id). */
export function parseGarudaJournal(html, baseUrl) {
  const $ = cheerio.load(html);
  const metaText = (label) => {
    let value = null;
    $('.j-meta-pub').each((_, el) => {
      const t = clean($(el).text()) || '';
      if (new RegExp(`^${label}`, 'i').test(t)) value = t;
    });
    return value;
  };

  const issnLine = metaText('ISSN') || '';
  const fmt = (v) => {
    const d = (v || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    return d.length === 8 && !/^0+$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : null;
  };
  const coreLine = metaText('Core Subject') || '';
  const coreSubjects = coreLine
    .replace(/^Core Subject\s*:\s*/i, '')
    .split(',')
    .map((s) => clean(s))
    .filter(Boolean);
  const subjectAreas = $('.j-meta-subject a, a[href*="/area/index/"].label')
    .map((_, a) => clean($(a).text()))
    .get()
    .filter(Boolean);
  const sintaHref = $('a[href*="sinta."][href*="journals"]').first().attr('href') || '';
  const websiteHref = $('.j-meta-abbrev a, .j-website a')
    .filter((_, a) => /website/i.test($(a).text()))
    .first()
    .attr('href');
  // Garuda often links to ".../about/contact"; the journal home is the part before "/about".
  const website = toHttpUrl(websiteHref)?.replace(/\/about(\/.*)?$/, '') ?? null;

  return {
    name: clean($('.j-meta-title, .j-title').first().text()),
    publisherName: clean((metaText('Published by') || '').replace(/^Published by\s*/i, '')),
    issn: fmt(issnLine.match(/ISSN\s*:\s*([0-9Xx-]+)/)?.[1]),
    eissn: fmt(issnLine.match(/EISSN\s*:\s*([0-9Xx-]+)/)?.[1]),
    coreSubjects: [...new Set(coreSubjects)],
    subjectAreas: [...new Set(subjectAreas)],
    sintaId: sintaHref.match(/id=(\d+)/)?.[1] ?? sintaHref.match(/profile\/(\d+)/)?.[1] ?? null,
    journalUrl: website,
    garudaUrl: baseUrl,
  };
}

/** Parse Garuda's journal search (/journal?q=...). */
export function parseGarudaJournalSearch(html, baseUrl) {
  const $ = cheerio.load(html);
  const fmt = (v) => {
    const d = (v || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    return d.length === 8 && !/^0+$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4)}` : null;
  };
  const journals = [];
  $('a.title-journal').each((_, el) => {
    const link = $(el);
    const cell = link.closest('td');
    const subs = cell.find('a.subtitle-journal');
    const idLine = clean(subs.eq(1).text()) || '';
    journals.push({
      name: clean(link.text()),
      garudaUrl: toHttpUrl(link.attr('href'), baseUrl),
      publisherName: clean(subs.eq(0).text()),
      issn: fmt(idLine.match(/ISSN\s*:\s*([0-9Xx]+)/)?.[1]),
      eissn: fmt(idLine.match(/EISSN\s*:\s*([0-9Xx]+)/)?.[1]),
      subjectAreas: cell.find('a.label-journal').map((__, a) => clean($(a).text())).get().filter(Boolean),
    });
  });
  return journals.filter((j) => j.name && j.garudaUrl);
}
