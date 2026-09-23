import * as cheerio from 'cheerio';
import { extractDoi, toHttpUrl } from '../utils/urlValidator.js';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim() || null;

/**
 * Garuda links to the OJS galley (".../article/view/9649/3914"), which is a PDF
 * viewer without metadata. The landing page ".../article/view/9649" carries the
 * Highwire/Dublin Core meta tags, so we derive it.
 */
export function toOjsLandingUrl(url) {
  if (!url) return null;
  const m = url.match(/^(.*\/article\/view\/\d+)(?:\/\d+)?\/?$/);
  return m ? m[1] : url;
}

function splitKeywords(values) {
  const out = [];
  for (const v of values) {
    for (const part of v.split(/\s*[;,•|]\s*|\s+[-–]\s+/)) {
      const k = clean(part?.replace(/^(keywords?|kata kunci)\s*:?\s*/i, ''));
      if (k && k.length >= 2 && k.length <= 80) out.push(k);
    }
  }
  return out;
}

/** Read article metadata from standard scholarly meta tags (OJS, Highwire, DC). */
export function parseArticleMeta(html, pageUrl) {
  const $ = cheerio.load(html);
  const metas = (names) =>
    $('meta')
      .filter((_, m) => names.includes(($(m).attr('name') || $(m).attr('property') || '').toLowerCase()))
      .map((_, m) => clean($(m).attr('content')))
      .get()
      .filter(Boolean);

  const keywords = splitKeywords(metas(['citation_keywords', 'dc.subject', 'keywords']));
  // Keep the first spelling of each keyword (citation_keywords come before DC.Subject).
  const unique = [];
  const seen = new Set();
  for (const k of keywords) {
    if (!seen.has(k.toLowerCase())) {
      seen.add(k.toLowerCase());
      unique.push(k);
    }
  }

  return {
    keywords: unique,
    authors: metas(['citation_author', 'dc.creator']),
    doi: extractDoi(metas(['citation_doi', 'dc.identifier.doi'])[0]),
    journalTitle: metas(['citation_journal_title'])[0] ?? null,
    issn: metas(['citation_issn'])[0] ?? null,
    publisher: metas(['citation_publisher', 'dc.publisher'])[0] ?? null,
    date: metas(['citation_date', 'citation_publication_date', 'dc.date.issued'])[0] ?? null,
    abstract: metas(['citation_abstract', 'dc.description', 'description'])[0] ?? null,
    pdfUrl: toHttpUrl(metas(['citation_pdf_url'])[0], pageUrl),
  };
}
