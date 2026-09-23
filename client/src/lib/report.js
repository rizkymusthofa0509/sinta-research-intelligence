import { RANKS } from '../../../shared/aggregate.js';
import { emergingTopics, researchGaps } from '../../../shared/trends.js';
import { categoryLabel } from './categories.js';
import { formatReference } from './citation.js';
import { closeness } from './similarity.js';

// Research report built only from the current result set: numbers, lists and
// references. No generated prose beyond templated sentences that restate data.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '0%');

export function buildReport({ data, derived, filters, lang = 'en', style = 'apa' }) {
  const { filtered, view, titles, journalFit, publisherFit } = derived;
  const s = view.summary;
  const en = lang === 'en';
  const topic = data.labels?.[data.rootKey] || data.analysisQuery || data.query;
  const emerging = emergingTopics(filtered, view.keywords).topics.slice(0, 8);
  const gaps = researchGaps(filtered, view.keywords).slice(0, 8);
  const score = closeness(filtered);
  const closest = [...filtered].sort((a, b) => score(b) - score(a)).slice(0, 10);
  const src = data.meta?.sources || {};
  const activeFilters = Object.entries(filters || {}).filter(([k, v]) => v && v !== 'all' && k !== 'keyword');

  const sections = [];
  sections.push({
    heading: en ? '1. Scope & sources' : '1. Cakupan & sumber',
    paragraphs: [
      en
        ? `Query: “${data.query}”. Crawled on ${new Date(data.generatedAt || Date.now()).toLocaleDateString('en-GB', { dateStyle: 'long' })}.`
        : `Kata kunci: “${data.query}”. Dihimpun pada ${new Date(data.generatedAt || Date.now()).toLocaleDateString('id-ID', { dateStyle: 'long' })}.`,
      [
        src.garuda?.ok ? `Garuda: ${src.garuda.articles} ${en ? 'articles' : 'artikel'}` : null,
        src.openalex?.ok ? `OpenAlex: ${src.openalex.articles} ${en ? 'works' : 'karya'}${data.meta?.scope === 'global' ? '' : en ? ' (Indonesian authors)' : ' (penulis Indonesia)'}` : null,
        src.arjuna ? `ARJUNA: ${src.arjuna.ranked}/${src.arjuna.journals} ${en ? 'journals with a current SINTA level' : 'jurnal dengan peringkat SINTA berlaku'}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      activeFilters.length ? `${en ? 'Filters' : 'Filter'}: ${activeFilters.map(([k, v]) => `${k}=${v}`).join(', ')}` : null,
    ].filter(Boolean),
    table: {
      head: [en ? 'Articles' : 'Artikel', en ? 'Journals' : 'Jurnal', en ? 'Authors' : 'Penulis', en ? 'Publishers' : 'Penerbit', en ? 'Years' : 'Tahun'],
      rows: [[s.articles, s.journals, s.authors, s.publishers, s.yearMin ? `${s.yearMin}–${s.yearMax}` : 'N/A']],
    },
  });

  if (data.landscape?.clusters?.length) {
    sections.push({
      heading: en ? '2. Research landscape (themes)' : '2. Lanskap riset (tema)',
      paragraphs: [
        en
          ? `Papers were grouped by ${data.landscape.method === 'embedding' ? 'semantic similarity (local multilingual embeddings)' : 'shared keywords'} into ${data.landscape.clusters.length} themes.`
          : `Artikel dikelompokkan berdasarkan ${data.landscape.method === 'embedding' ? 'kemiripan makna (embedding multibahasa lokal)' : 'kesamaan kata kunci'} menjadi ${data.landscape.clusters.length} tema.`,
      ],
      table: {
        head: [en ? 'Theme' : 'Tema', en ? 'Papers' : 'Artikel', en ? 'Distinctive keywords' : 'Kata kunci khas', en ? 'Years' : 'Tahun'],
        rows: data.landscape.clusters.map((c) => [c.label, c.size, c.keywords.map((k) => k.name).join(', '), c.yearMin ? `${c.yearMin}–${c.yearMax}` : 'N/A']),
      },
    });
  }

  sections.push({
    heading: en ? '3. Most frequent keywords' : '3. Kata kunci terbanyak',
    table: {
      head: [en ? 'Keyword' : 'Kata kunci', en ? 'Articles' : 'Artikel', en ? 'Share' : 'Porsi', en ? 'Journals' : 'Jurnal', en ? 'Related' : 'Terkait'],
      rows: view.keywords.slice(0, 15).map((k) => [k.name, k.count, pct(k.count, s.articles), k.journals, k.related.slice(0, 3).map((r) => r.name).join(', ')]),
    },
  });

  if (emerging.length) {
    sections.push({
      heading: en ? '4. Emerging topics' : '4. Topik yang sedang naik',
      table: {
        head: [en ? 'Keyword' : 'Kata kunci', en ? 'Recent' : 'Terbaru', en ? 'Earlier' : 'Sebelumnya', en ? 'Growth' : 'Pertumbuhan'],
        rows: emerging.map((t) => [t.name, t.recent, t.earlier, t.isNew ? (en ? 'New' : 'Baru') : `×${t.growth.toFixed(1)}`]),
      },
    });
  }

  if (gaps.length) {
    sections.push({
      heading: en ? '5. Candidate research gaps' : '5. Kandidat celah penelitian',
      paragraphs: [en ? 'Keyword pairs that co-occur less than expected if unrelated (verify against the full sources).' : 'Pasangan kata kunci yang jarang muncul bersama dibanding perkiraan (verifikasi ke sumber lengkap).'],
      table: {
        head: [en ? 'Combination' : 'Kombinasi', en ? 'Together' : 'Bersama', en ? 'Expected' : 'Perkiraan'],
        rows: gaps.map((g) => [`${g.a.name} + ${g.b.name}`, g.observed, g.expected]),
      },
    });
  }

  sections.push({
    heading: en ? '6. SINTA levels & journals' : '6. Peringkat SINTA & jurnal',
    table: {
      head: ['SINTA', en ? 'Articles' : 'Artikel', en ? 'Share' : 'Porsi'],
      rows: [...RANKS, 'Unranked'].map((r) => [r === 'Unranked' ? 'N/A' : r, s.byRank?.[r] || 0, pct(s.byRank?.[r] || 0, s.articles)]),
    },
    table2: {
      head: [en ? 'Journal' : 'Jurnal', 'SINTA', en ? 'Articles' : 'Artikel', en ? 'Topic fit' : 'Kecocokan topik', en ? 'Category' : 'Kategori'],
      rows: journalFit.slice(0, 12).map((j) => [j.name, j.sintaRank || 'N/A', j.articles, `${j.confidence}%`, j.categories.map((c) => categoryLabel(c)).join(', ') || 'N/A']),
    },
    paragraphs: [
      en
        ? 'Topic fit = (0.45·relevance + 0.35·keyword overlap + 0.20·recency) × SINTA selectivity. It is not an acceptance rate.'
        : 'Kecocokan topik = (0,45·relevansi + 0,35·kecocokan kata kunci + 0,20·kebaruan) × selektivitas SINTA. Bukan tingkat penerimaan.',
    ],
  });

  if (publisherFit.length) {
    sections.push({
      heading: en ? '7. Publishers' : '7. Penerbit',
      table: {
        head: [en ? 'Publisher' : 'Penerbit', en ? 'Journals' : 'Jurnal', en ? 'Articles' : 'Artikel', en ? 'Best topic fit' : 'Kecocokan terbaik'],
        rows: publisherFit.slice(0, 10).map((p) => [p.name, p.journalCount, p.articles, `${p.confidence}% (${p.bestJournal})`]),
      },
    });
  }

  sections.push({
    heading: en ? '8. Papers closest to the query' : '8. Artikel paling mirip dengan kata kunci',
    list: closest.map((a) => `${Math.round(score(a) * 100)}% — ${a.title} (${a.journalName || 'N/A'}, ${a.publicationYear || 'n.d.'})`),
  });

  if (titles.length) {
    sections.push({
      heading: en ? '9. Data-driven title ideas' : '9. Ide judul berbasis data',
      list: titles.slice(0, 8).map((t) => `${en ? t.title : t.titleId} — ${t.evidence.join(' ')}`),
    });
  }

  sections.push({
    heading: en ? 'References (closest papers)' : 'Daftar pustaka (artikel terdekat)',
    references: closest.map((a, i) => formatReference(a, style, i + 1)),
  });

  return { title: en ? `Research report: ${topic}` : `Laporan riset: ${topic}`, subtitle: 'Open Knowledge Mapping', sections };
}

const tableHtml = (t) =>
  `<table><thead><tr>${t.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

export function reportToHtml(r, { standalone = false } = {}) {
  const body = [
    `<h1>${esc(r.title)}</h1>`,
    `<p class="sub">${esc(r.subtitle)}</p>`,
    ...r.sections.map((s) =>
      [
        `<h2>${esc(s.heading)}</h2>`,
        ...(s.paragraphs || []).map((p) => `<p>${esc(p)}</p>`),
        s.table ? tableHtml(s.table) : '',
        s.table2 ? tableHtml(s.table2) : '',
        s.list ? `<ol>${s.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '',
        s.references ? s.references.map((x) => `<p class="ref">${esc(x)}</p>`).join('') : '',
      ].join(''),
    ),
  ].join('\n');
  if (!standalone) return body;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;margin:2cm;color:#111}h1{font-size:18pt;margin:0}.sub{color:#555;margin-top:2pt}
h2{font-size:13pt;margin-top:18pt;border-bottom:1px solid #ccc;padding-bottom:2pt}table{border-collapse:collapse;width:100%;margin:6pt 0}
th,td{border:1px solid #ccc;padding:3pt 5pt;text-align:left;vertical-align:top}th{background:#f1f0ed}.ref{padding-left:1.27cm;text-indent:-1.27cm}
</style></head><body>${body}</body></html>`;
}

export function reportToMarkdown(r) {
  const lines = [`# ${r.title}`, '', `_${r.subtitle}_`, ''];
  for (const s of r.sections) {
    lines.push(`## ${s.heading}`, '');
    for (const p of s.paragraphs || []) lines.push(p, '');
    for (const t of [s.table, s.table2].filter(Boolean)) {
      lines.push(`| ${t.head.join(' | ')} |`, `| ${t.head.map(() => '---').join(' | ')} |`);
      for (const row of t.rows) lines.push(`| ${row.map((c) => String(c).replace(/\|/g, '/')).join(' | ')} |`);
      lines.push('');
    }
    if (s.list) {
      s.list.forEach((x, i) => lines.push(`${i + 1}. ${x}`));
      lines.push('');
    }
    if (s.references) {
      s.references.forEach((x) => lines.push(`- ${x}`));
      lines.push('');
    }
  }
  return lines.join('\n');
}
