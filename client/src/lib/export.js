function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = (s) =>
  String(s || 'export')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'export';

const CSV_COLUMNS = [
  ['title', 'Title'],
  ['authors', 'Authors'],
  ['publicationYear', 'Year'],
  ['journalName', 'Journal'],
  ['publisherName', 'Publisher'],
  ['sintaRank', 'SINTA rank'],
  ['categories', 'Category'],
  ['issn', 'ISSN'],
  ['eissn', 'E-ISSN'],
  ['doi', 'DOI'],
  ['doiUrl', 'DOI URL'],
  ['articleUrl', 'Article URL'],
  ['journalUrl', 'Journal website'],
  ['sintaUrl', 'SINTA URL'],
  ['garudaUrl', 'Garuda URL'],
  ['source', 'Source'],
  ['keywords', 'Author keywords'],
  ['keywordNames', 'Extracted keywords'],
  ['abstract', 'Abstract'],
];

function csvCell(value) {
  if (value === null || value === undefined || value === '') return '';
  const text = Array.isArray(value) ? value.join('; ') : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportCsv(articles, labels, query) {
  const rows = [CSV_COLUMNS.map(([, h]) => h).join(',')];
  for (const a of articles) {
    const record = { ...a, keywordNames: (a.keywordIds || []).map((k) => labels[k] || k) };
    rows.push(CSV_COLUMNS.map(([key]) => csvCell(record[key])).join(','));
  }
  // BOM so Excel opens UTF-8 correctly.
  download(`${slug(query)}-articles.csv`, '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
}

export function exportJson(payload, query) {
  download(`${slug(query)}-results.json`, JSON.stringify(payload, null, 2), 'application/json');
}

export function exportText(filename, content, type = 'text/plain;charset=utf-8') {
  download(filename, content, type);
}
