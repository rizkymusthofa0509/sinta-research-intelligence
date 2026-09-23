import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseGarudaJournal, parseGarudaJournalSearch, parseGarudaSearch, parseVenue } from '../src/parsers/garudaParser.js';
import { parseArticleMeta, toOjsLandingUrl } from '../src/parsers/journalParser.js';
import { parseSintaJournalSearch } from '../src/parsers/sintaParser.js';

// Fixtures are real public pages saved from garuda.kemdiktisaintek.go.id and sinta.kemdiktisaintek.go.id.
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('Garuda search page: totals and article fields', () => {
  const r = parseGarudaSearch(fixture('garuda-search.html'), 'https://garuda.kemdiktisaintek.go.id/documents?q=artificial+intelligence');
  assert.equal(r.total, 12148);
  assert.equal(r.totalPages, 1215);
  assert.equal(r.items.length, 10);
  const first = r.items[0];
  assert.equal(first.journalName, 'Jurnal Yuridis');
  assert.equal(first.publicationYear, 2024);
  assert.equal(first.doi, '10.35586/jyur.v11i2.9649');
  assert.deepEqual(first.authors, ['Wahid Inayah Tullah', 'Chandra Airlangga Ar Fakhsal']);
  assert.match(first.articleUrl, /^https:\/\/ejournal\.upnvj\.ac\.id\//);
  assert.match(first.garudaUrl, /\/documents\/detail\/5765183$/);
  assert.ok(first.abstract.length > 100);
  // Missing DOI stays null (never invented).
  assert.ok(r.items.some((i) => i.doi === null));
});

test('venue line parsing keeps journal names with colons', () => {
  assert.deepEqual(parseVenue('Jurnal Negara Hukum: Membangun Hukum Untuk Keadilan Vol 12, No 2 (2021): JNH VOL 12'), {
    journalName: 'Jurnal Negara Hukum: Membangun Hukum Untuk Keadilan',
    issue: 'Vol 12, No 2 (2021): JNH VOL 12',
    year: 2021,
  });
  assert.equal(parseVenue('IAES International Journal of Artificial Intelligence (IJ-AI) Vol 15, No 3: June 2026').year, 2026);
  assert.equal(parseVenue(null).journalName, null);
});

test('SINTA journal list: rank, ISSN and links', () => {
  const r = parseSintaJournalSearch(fixture('sinta-journals.html'), 'https://sinta.kemdiktisaintek.go.id/journals');
  assert.equal(r.total, 21);
  const ijai = r.journals[0];
  assert.equal(ijai.sintaRank, 'S1');
  assert.equal(ijai.issn, '2089-4872');
  assert.equal(ijai.eissn, '2252-8938');
  assert.equal(ijai.sintaUrl, 'https://sinta.kemdiktisaintek.go.id/journals/profile/6731');
  assert.equal(ijai.publisherName, 'Institute of Advanced Engineering and Science');
  assert.equal(ijai.impact, 6.43);
  assert.equal(ijai.citations, 13521);
});

test('Garuda journal profile: core subject, SINTA id, website', () => {
  const j = parseGarudaJournal(fixture('garuda-journal.html'), 'https://garuda.kemdiktisaintek.go.id/journal/view/14393');
  assert.deepEqual(j.coreSubjects, ['Social']);
  assert.deepEqual(j.subjectAreas, ['Law, Crime, Criminology & Criminal Justice']);
  assert.equal(j.sintaId, '5158');
  assert.equal(j.issn, '1693-4458');
  assert.equal(j.journalUrl, 'https://ejournal.upnvj.ac.id/index.php/Yuridis');
});

test('Garuda journal search results', () => {
  const list = parseGarudaJournalSearch(fixture('garuda-journal-search.html'), 'https://garuda.kemdiktisaintek.go.id/journal?q=x');
  assert.equal(list.length, 4);
  assert.ok(list.every((j) => j.garudaUrl.startsWith('https://garuda.kemdiktisaintek.go.id/journal/view/')));
  assert.equal(list[0].issn, '2614-2031');
});

test('OJS article meta and landing URL', () => {
  assert.equal(toOjsLandingUrl('https://x.ac.id/index.php/J/article/view/9649/3914'), 'https://x.ac.id/index.php/J/article/view/9649');
  const meta = parseArticleMeta(
    `<meta name="citation_keywords" content="Machine learning; Random forest"><meta name="citation_author" content="A B">
     <meta name="citation_doi" content="10.1234/abc.1"><meta name="DC.Subject" content="machine learning">`,
    'https://x.ac.id/a',
  );
  assert.deepEqual(meta.keywords, ['Machine learning', 'Random forest']);
  assert.equal(meta.doi, '10.1234/abc.1');
  assert.deepEqual(meta.authors, ['A B']);
});
