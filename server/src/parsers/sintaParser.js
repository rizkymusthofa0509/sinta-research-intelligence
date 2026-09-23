import * as cheerio from 'cheerio';
import { extractDoi, toHttpUrl } from '../utils/urlValidator.js';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

function formatIssn(raw) {
  const digits = (raw || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (digits.length !== 8 || /^0+$/.test(digits)) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}

function parseLocaleNumber(text) {
  const t = clean(text);
  if (!t) return null;
  // SINTA uses Indonesian formatting: "11.632" (thousands) and "6,43" (decimal).
  const n = Number(t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Parse the SINTA journal list page (/journals?q=...). */
export function parseSintaJournalSearch(html, baseUrl) {
  const $ = cheerio.load(html);
  const totalText = clean($('.pagination-text').first().text()) || '';
  const total = Number(totalText.match(/Total Records\s*([\d.,]+)/i)?.[1]?.replace(/[.,]/g, '') ?? 0);

  const journals = [];
  $('.list-item').each((_, el) => {
    const item = $(el);
    const nameLink = item.find('.affil-name a').first();
    const name = clean(nameLink.text());
    const sintaUrl = toHttpUrl(nameLink.attr('href'), baseUrl);
    if (!name || !sintaUrl) return;

    let website = null;
    let googleScholarUrl = null;
    let editorUrl = null;
    item.find('.affil-abbrev a').each((__, a) => {
      const label = clean($(a).text()) || '';
      const href = toHttpUrl($(a).attr('href'));
      if (/website/i.test(label)) website = href;
      else if (/scholar/i.test(label)) googleScholarUrl = href;
      else if (/editor/i.test(label)) editorUrl = href;
    });

    const affil = item.find('.affil-loc a').first();
    const idText = clean(item.find('.profile-id').text()) || '';
    const rankText = clean(item.find('.num-stat.accredited').text()) || '';
    const rank = rankText.match(/\bS([1-6])\b/)?.[0] ?? null;
    const garudaLink = item.find('a[href*="garuda"]').first().attr('href');

    const stats = {};
    item.find('.pr-num').each((__, n) => {
      const label = clean($(n).next('.pr-txt').text());
      if (label) stats[label] = parseLocaleNumber($(n).text());
    });

    journals.push({
      sintaId: sintaUrl.match(/profile\/(\d+)/)?.[1] ?? null,
      name,
      sintaUrl,
      journalUrl: website,
      googleScholarUrl,
      editorUrl,
      garudaUrl: toHttpUrl(garudaLink),
      publisherName: clean(affil.text()),
      publisherSintaUrl: toHttpUrl(affil.attr('href'), baseUrl),
      issn: formatIssn(idText.match(/P-ISSN\s*:\s*([0-9Xx-]+)/i)?.[1]),
      eissn: formatIssn(idText.match(/E-ISSN\s*:\s*([0-9Xx-]+)/i)?.[1]),
      sintaRank: rank,
      scopusIndexed: item.find('.scopus-indexed').length > 0,
      garudaIndexed: item.find('.garuda-indexed').length > 0,
      impact: stats.Impact ?? null,
      h5Index: stats['H5-index'] ?? null,
      citations5yr: stats['Citations 5yr'] ?? null,
      citations: stats.Citations ?? null,
    });
  });

  return { total, journals };
}

/** Parse the recent-article list shown on a SINTA journal profile (Garuda tab). */
export function parseSintaJournalArticles(html) {
  const $ = cheerio.load(html);
  const articles = [];
  $('.ar-list-item').each((_, el) => {
    const item = $(el);
    const link = item.find('.ar-title a').first();
    const title = clean(link.text());
    if (!title) return;
    const metas = item.find('.ar-meta');
    const first = metas.eq(0);
    const pubText = clean(first.find('.ar-pub').text());
    const publisher = clean(first.find('a').not('.ar-pub').first().text());
    const yearText = clean(item.find('.ar-year').text());
    const doiText = clean(item.find('.ar-cited').text());
    const authorsText = /^Authors\s*:/i.test(publisher || '') ? publisher.replace(/^Authors\s*:\s*/i, '') : null;
    articles.push({
      title,
      articleUrl: toHttpUrl(link.attr('href')),
      venue: pubText,
      publisherName: authorsText ? null : publisher,
      authors: authorsText
        ? authorsText
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s && s !== '...')
        : [],
      publicationYear: Number(yearText?.match(/(19|20)\d{2}/)?.[0]) || null,
      doi: extractDoi(doiText),
    });
  });
  return articles;
}
