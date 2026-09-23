import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combination, emergingTopics, heatmap, researchGaps } from '../../shared/trends.js';
import { buildResult } from '../../shared/aggregate.js';
import { categoryFromTopic, mapWork, rebuildAbstract } from '../src/crawlers/OpenAlexCrawler.js';
import { buildLandscape, kmeans, pca2 } from '../src/services/landscape.js';

test('OpenAlex: abstract rebuilt from the inverted index, fields mapped', () => {
  assert.equal(rebuildAbstract({ web: [0], crawling: [1], works: [2] }), 'web crawling works');
  assert.deepEqual(categoryFromTopic({ field: { display_name: 'Social Sciences' }, subfield: { display_name: 'Education' } }), ['education']);
  assert.deepEqual(categoryFromTopic({ field: { display_name: 'Computer Science' } }), ['engineering']);
  const a = mapWork({
    id: 'https://openalex.org/W1',
    doi: 'https://doi.org/10.1/ABC',
    title: 'A crawler',
    publication_year: 2024,
    authorships: [{ author: { display_name: 'Ani' }, institutions: [{ country_code: 'ID' }] }],
    primary_location: { landing_page_url: 'https://x.org/a', source: { display_name: 'J', issn: ['12345678', '8765-4321'], host_organization_name: 'P' } },
    keywords: [{ display_name: 'Web crawler', score: 0.9 }, { display_name: 'Noise', score: 0.2 }],
  });
  assert.equal(a.doi, '10.1/ABC');
  assert.deepEqual(a.openalexKeywords, ['Web crawler']);
  assert.equal(a.openalexJournal.issn, '1234-5678');
  assert.deepEqual(a.countries, ['ID']);
  assert.equal(a.openalexUrl, 'https://openalex.org/works/W1');
});

test('landscape: deterministic clustering separates two obvious groups', () => {
  const v = (x, y) => {
    const n = Math.hypot(x, y);
    return [x / n, y / n, 0];
  };
  const vectors = [v(1, 0.05), v(1, 0.1), v(1, 0), v(0.05, 1), v(0.1, 1), v(0, 1)];
  const a = kmeans(vectors, 2).labels;
  const b = kmeans(vectors, 2).labels;
  assert.deepEqual(a, b, 'same input → same clusters');
  assert.equal(new Set(a.slice(0, 3)).size, 1);
  assert.equal(new Set(a.slice(3)).size, 1);
  assert.notEqual(a[0], a[3]);
  assert.equal(pca2(vectors).length, 6);
  const articles = vectors.map((_, i) => ({ id: String(i), keywordIds: i < 3 ? ['alpha', 'x'] : ['beta', 'x'], publicationYear: 2024 }));
  const land = buildLandscape(articles, vectors, { alpha: 'Alpha', beta: 'Beta' }, { method: 'embedding' });
  assert.equal(land.clusters.length, 2);
  assert.ok(land.clusters.some((c) => c.label.startsWith('Alpha')));
  assert.ok(Object.values(land.points).every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1));
});

const make = () => {
  const arts = [];
  let id = 0;
  const add = (n, year, kws) => {
    for (let i = 0; i < n; i++) arts.push({ id: String(id++), publicationYear: year, keywordIds: kws, sintaRank: 'S3', categories: ['engineering'] });
  };
  add(6, 2020, ['a', 'b']);
  add(6, 2021, ['a', 'c']);
  add(8, 2025, ['a', 'd']);
  add(4, 2026, ['d', 'e']);
  add(4, 2026, ['b', 'e']);
  return arts;
};

test('emerging topics find keywords that only appear recently', () => {
  const arts = make();
  const { keywords } = buildResult(arts, {}, { rootKey: null });
  const { topics, window } = emergingTopics(arts, keywords);
  assert.equal(window.recentFrom, 2025);
  assert.ok(topics.find((t) => t.id === 'd' && t.isNew));
  assert.ok(!topics.find((t) => t.id === 'c'), 'c only appears early');
});

test('gaps, heatmap and combinations', () => {
  const arts = make();
  const { keywords } = buildResult(arts, {}, { rootKey: null });
  const gaps = researchGaps(arts, keywords);
  assert.ok(gaps.some((g) => [g.a.id, g.b.id].sort().join() === 'a,e' && g.observed === 0));
  const hm = heatmap(arts, keywords, { dimension: 'year' });
  const ai = hm.rows.findIndex((r) => r.id === 'a');
  assert.equal(hm.cells[ai][hm.columns.indexOf('2025')], 8);
  assert.equal(combination(arts, ['a', 'e']).verdict, 'untouched');
  assert.equal(combination(arts, ['a', 'd']).verdict, 'established');
});
