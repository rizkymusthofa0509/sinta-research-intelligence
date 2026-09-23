import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildResult, filterArticles } from '../../shared/aggregate.js';
import { categorize } from '../../shared/categories.js';
import { rankJournals, recommendTitles } from '../../shared/insights.js';
import { analyzeKeywords, canonicalKeyword, findAcronyms, splitInlineKeywords } from '../../shared/keywordAnalyzer.js';
import { isPathAllowed, parseRobots } from '../src/utils/robots.js';
import { doiToUrl, isPublicHttpUrl } from '../src/utils/urlValidator.js';

test('canonical keywords merge spelling variants but not different concepts', () => {
  for (const v of ['Machine Learning', 'machine learning', 'MACHINE LEARNING', 'Machine-Learning']) {
    assert.equal(canonicalKeyword(v), 'machine learning');
  }
  assert.equal(canonicalKeyword('Neural Networks'), 'neural network');
  assert.equal(canonicalKeyword('Naïve Bayes'), 'naive bayes');
  assert.equal(canonicalKeyword("children's"), 'children');
  assert.equal(canonicalKeyword('Diagnosis'), 'diagnosis');
  assert.notEqual(canonicalKeyword('Deep Learning'), canonicalKeyword('Machine Learning'));
});

test('acronyms defined in text are aliased to their expansion', () => {
  const map = findAcronyms('We use a Support Vector Machine (SVM) and the Internet of Things (IoT).');
  assert.equal(map.get('svm'), 'support vector machine');
  assert.equal(map.get('iot'), canonicalKeyword('Internet of Things')); // small words may supply a letter
});

test('inline "Keywords:" lines are author keywords', () => {
  const r = splitInlineKeywords('Abstract text here. Keywords: stunting; balita; gizi buruk');
  assert.deepEqual(r.keywords, ['stunting', 'balita', 'gizi buruk']);
  assert.equal(r.abstract.trim(), 'Abstract text here.');
});

const corpus = [
  { id: 'a', title: 'Stunting prevention with Support Vector Machine (SVM)', abstract: 'Stunting in toddlers. Keywords: stunting; SVM' },
  { id: 'b', title: 'Faktor kejadian stunting pada balita', abstract: 'Penelitian stunting menggunakan SVM classifier.' },
  { id: 'c', title: 'Nursing care and stunting', abstract: 'Community nursing reduces stunting.' },
];

test('the query always counts, and "-ing" topics survive', () => {
  const { perArticle, queryKey } = analyzeKeywords(corpus, { query: 'Stunting' });
  assert.equal(queryKey, 'stunting');
  for (const a of corpus) assert.ok(perArticle.get(a.id).includes('stunting'), `article ${a.id}`);
  assert.ok(perArticle.get('a').includes('support vector machine'));
});

test('aggregation counts articles, journals and co-occurrence', () => {
  const articles = [
    { id: '1', journalName: 'J1', publisherName: 'P1', publicationYear: 2023, authors: ['X'], keywordIds: ['a', 'b'] },
    { id: '2', journalName: 'J1', publisherName: 'P1', publicationYear: 2024, authors: ['Y'], keywordIds: ['a', 'b'] },
    { id: '3', journalName: 'J2', publisherName: 'P2', publicationYear: 2024, authors: ['X'], keywordIds: ['a'] },
  ];
  const r = buildResult(articles, { a: 'A', b: 'B' }, { rootKey: 'a' });
  assert.equal(r.summary.articles, 3);
  assert.equal(r.summary.journals, 2);
  assert.equal(r.summary.authors, 2);
  const a = r.keywords.find((k) => k.id === 'a');
  assert.equal(a.count, 3);
  assert.equal(a.journals, 2);
  assert.deepEqual(r.links, [{ source: 'a', target: 'b', weight: 2, jaccard: 2 / 3 }]);
  assert.equal(filterArticles(articles, { yearFrom: 2024 }).length, 2);
  assert.equal(filterArticles(articles, { keyword: 'b' }).length, 2);
});

test('journal fit confidence stays within 3–97% and is ordered', () => {
  const articles = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    journalName: i < 8 ? 'Big' : 'Small',
    sintaRank: i < 8 ? 'S4' : 'S1',
    publicationYear: 2020 + (i % 5),
    keywordIds: ['x', i % 2 ? 'y' : 'z'],
  }));
  const rows = rankJournals(articles, { targetKeywordIds: ['x', 'y'] });
  assert.equal(rows[0].name, 'Big');
  for (const r of rows) assert.ok(r.confidence >= 3 && r.confidence <= 97);
  const titles = recommendTitles(articles, buildResult(articles, { x: 'X', y: 'Y', z: 'Z' }, { rootKey: 'x' }).keywords, { rootKey: 'x', queryLabel: 'X' });
  assert.ok(titles.every((t) => t.evidence.length > 0));
});

test('categories follow Garuda core subjects, falling back to detailed areas', () => {
  assert.deepEqual(categorize(['Social'], ['Computer Science & IT']), ['social']);
  assert.deepEqual(categorize([], ['Computer Science & IT']), ['engineering']);
  assert.deepEqual(categorize([], []), []);
});

test('robots.txt rules for "*"', () => {
  const rules = parseRobots('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/ok\nCrawl-delay: 2');
  assert.equal(rules.crawlDelay, 2);
  assert.equal(isPathAllowed(rules, '/documents?q=x'), true);
  assert.equal(isPathAllowed(rules, '/private/x'), false);
  assert.equal(isPathAllowed(rules, '/private/ok/1'), true);
});

test('URL safety: no private hosts, DOI links normalised', () => {
  assert.equal(isPublicHttpUrl('http://localhost:3000'), false);
  assert.equal(isPublicHttpUrl('http://192.168.1.2/x'), false);
  assert.equal(isPublicHttpUrl('file:///etc/passwd'), false);
  assert.equal(isPublicHttpUrl('https://garuda.kemdiktisaintek.go.id/documents'), true);
  assert.equal(doiToUrl('DOI: 10.35586/jyur.v11i2.9649.'), 'https://doi.org/10.35586/jyur.v11i2.9649');
});

test('title-like queries are planned into concepts; short queries stay direct', async () => {
  const { planQuery, relevanceModel, relevanceTo } = await import('../../shared/queryPlanner.js');
  assert.equal(planQuery('Artificial Intelligence').strategy, 'direct');
  const plan = planQuery('Pengembangan Sistem Eksplorasi Topik Penelitian Berbasis Web Crawling');
  assert.equal(plan.strategy, 'expanded');
  assert.deepEqual(
    plan.concepts.map((c) => c.query),
    ['Pengembangan Sistem Eksplorasi Topik Penelitian Berbasis Web Crawling', 'eksplorasi topik', 'topic exploration', 'web crawling'],
  );
  const model = relevanceModel('Pengembangan Sistem Eksplorasi Topik Penelitian Berbasis Web Crawling', plan);
  const phrase = relevanceTo({ title: 'Implementasi Web Crawling untuk Informasi Wisata' }, model);
  const loose = relevanceTo({ title: 'Web design for crawling robots' }, model);
  assert.ok(phrase.score > loose.score, 'a whole concept outranks scattered words');
  assert.equal(relevanceTo({ title: 'Eksplorasi topik dengan web crawling' }, model).score, 1);
});
