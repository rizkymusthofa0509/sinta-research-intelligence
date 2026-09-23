import { formatReference, inTextCitation } from './citation.js';

// Builds a manuscript skeleton in the common SINTA / IMRaD journal template.
// Only facts from the crawled data are filled in (counts, years, reference
// metadata). Everything the author must write is a [placeholder] — no invented
// findings, numbers or claims.

const T = {
  en: {
    abstract: 'Abstract',
    keywords: 'Keywords',
    intro: '1. Introduction',
    review: '2. Literature Review',
    method: '3. Research Method',
    results: '4. Results and Discussion',
    conclusion: '5. Conclusion',
    ack: 'Acknowledgments',
    refs: 'References',
    authors: '[First Author Name]¹, [Second Author Name]²',
    affil: '¹[Department, Faculty, University, City, Indonesia] · ²[Affiliation]',
    corr: 'Corresponding author: [email@institution.ac.id]',
    prepared: (j) => `Prepared for submission to ${j}`,
  },
  id: {
    abstract: 'Abstrak',
    keywords: 'Kata kunci',
    intro: '1. Pendahuluan',
    review: '2. Tinjauan Pustaka',
    method: '3. Metode Penelitian',
    results: '4. Hasil dan Pembahasan',
    conclusion: '5. Kesimpulan',
    ack: 'Ucapan Terima Kasih',
    refs: 'Daftar Pustaka',
    authors: '[Nama Penulis Pertama]¹, [Nama Penulis Kedua]²',
    affil: '¹[Program Studi, Fakultas, Universitas, Kota, Indonesia] · ²[Afiliasi]',
    corr: 'Penulis korespondensi: [email@institusi.ac.id]',
    prepared: (j) => `Disiapkan untuk ${j}`,
  },
};

// A paragraph is a list of segments: plain text (data-backed) or {ph: '...'} (to be written by the author).
const ph = (text) => ({ ph: text });

export function buildManuscript({ title, lang = 'en', style = 'apa', keywords = [], refs = [], journal, stats, titleMeta }) {
  const t = T[lang];
  const cite = (i) => inTextCitation(refs[i], style, i + 1);
  const citeMany = (idx) => idx.filter((i) => refs[i]).map(cite).join(style === 'ieee' ? '' : '; ');
  const kwList = keywords.join(', ');
  const yrs = stats.yearMin && stats.yearMax ? `${stats.yearMin}–${stats.yearMax}` : null;
  const en = lang === 'en';

  const abstract = [
    en
      ? `${stats.topic} is an active research area in Indonesian journals: ${stats.articles} articles in ${stats.journals} journals${yrs ? ` (${yrs})` : ''} were identified in Garuda/SINTA for this topic. `
      : `${stats.topic} merupakan bidang riset yang aktif di jurnal Indonesia: ${stats.articles} artikel pada ${stats.journals} jurnal${yrs ? ` (${yrs})` : ''} teridentifikasi di Garuda/SINTA untuk topik ini. `,
    ph(en ? 'State the specific problem and objective in 1–2 sentences.' : 'Tuliskan masalah spesifik dan tujuan penelitian dalam 1–2 kalimat.'),
    ' ',
    ph(en ? 'Method: design, data/sample, and analysis.' : 'Metode: desain, data/sampel, dan teknik analisis.'),
    ' ',
    ph(en ? 'Results: the main findings with key numbers.' : 'Hasil: temuan utama beserta angka kunci.'),
    ' ',
    ph(en ? 'Conclusion: contribution and implication (150–250 words in total).' : 'Kesimpulan: kontribusi dan implikasi (total 150–250 kata).'),
  ];

  const introP1 = [
    en
      ? `Research on ${stats.topic} has grown in Indonesian scholarship${yrs ? ` between ${yrs}` : ''}, with frequent attention to ${kwList || 'related topics'} `
      : `Riset tentang ${stats.topic} berkembang dalam publikasi ilmiah Indonesia${yrs ? ` pada ${yrs}` : ''}, dengan perhatian pada ${kwList || 'topik terkait'} `,
    refs.length ? citeMany([0, 1, 2]) : '',
    '. ',
    ph(en ? 'Explain why this matters (context, scale of the problem, policy or practical relevance).' : 'Jelaskan mengapa topik ini penting (konteks, skala masalah, relevansi kebijakan/praktik).'),
  ];

  const gapText = titleMeta?.evidence?.length
    ? [
        en ? 'Evidence from the crawled literature: ' : 'Bukti dari literatur yang dihimpun: ',
        titleMeta.evidence.join(' '),
        ' ',
      ]
    : [];
  const introP2 = [
    ...gapText,
    ph(en ? 'State the research gap precisely: what previous studies have not addressed.' : 'Nyatakan celah penelitian secara tepat: apa yang belum dikaji studi sebelumnya.'),
  ];
  const introP3 = [ph(en ? 'This study aims to … The contributions of this paper are: (1) …, (2) …' : 'Penelitian ini bertujuan untuk … Kontribusi artikel ini adalah: (1) …, (2) …')];

  const review = refs.slice(0, 10).map((r, i) => {
    const who = r.authors?.length ? `${r.authors[0]}${r.authors.length > 1 ? (en ? ' et al.' : ' dkk.') : ''}` : r.journalName || 'N/A';
    return [
      en ? `${who} ${cite(i)} studied “${r.title}”${r.journalName ? ` in ${r.journalName}` : ''}. ` : `${who} ${cite(i)} meneliti “${r.title}”${r.journalName ? ` dalam ${r.journalName}` : ''}. `,
      ph(en ? 'Summarise its method and key finding after reading the article.' : 'Ringkas metode dan temuan utamanya setelah membaca artikel.'),
    ];
  });
  if (!review.length) review.push([ph(en ? 'Discuss 5–10 closely related studies and position your work.' : 'Bahas 5–10 studi terkait dan posisikan penelitian Anda.')]);
  review.push([ph(en ? 'Synthesis: how these studies relate, and where your study fits.' : 'Sintesis: keterkaitan studi-studi tersebut dan posisi penelitian Anda.')]);

  const isReview = titleMeta?.type === 'review' || /systematic|bibliometric|sistematis|bibliometrik/i.test(title);
  const method = isReview
    ? [
        [ph(en ? 'Review protocol (e.g. PRISMA 2020): databases (Garuda, SINTA, Google Scholar …), search string, time window.' : 'Protokol tinjauan (mis. PRISMA 2020): basis data (Garuda, SINTA, Google Scholar …), kata kunci pencarian, rentang waktu.')],
        [ph(en ? 'Inclusion / exclusion criteria and screening steps with counts.' : 'Kriteria inklusi/eksklusi dan tahapan penyaringan beserta jumlahnya.')],
        [ph(en ? 'Data extraction and analysis (e.g. co-word analysis, VOSviewer, thematic synthesis).' : 'Ekstraksi dan analisis data (mis. analisis co-word, VOSviewer, sintesis tematik).')],
      ]
    : [
        [ph(en ? 'Research design and approach.' : 'Desain dan pendekatan penelitian.')],
        [ph(en ? 'Data / population and sample, including source and period.' : 'Data / populasi dan sampel, termasuk sumber dan periode.')],
        [ph(en ? 'Instruments, variables or system design.' : 'Instrumen, variabel, atau rancangan sistem.')],
        [ph(en ? 'Analysis technique and evaluation metrics.' : 'Teknik analisis dan metrik evaluasi.')],
      ];

  const results = [
    [ph(en ? 'Present results in logical order with tables/figures (numbered, with captions).' : 'Sajikan hasil secara runtut dengan tabel/gambar (bernomor dan berketerangan).')],
    [
      ph(en ? 'Discuss the results and compare them with previous studies' : 'Bahas hasil dan bandingkan dengan penelitian sebelumnya'),
      refs.length ? ` ${citeMany([0, 1, 2, 3].filter((i) => i < refs.length))}.` : '.',
    ],
    [ph(en ? 'Explain implications and limitations.' : 'Jelaskan implikasi dan keterbatasan.')],
  ];

  return {
    title,
    lang,
    header: journal ? t.prepared(`${journal.name}${journal.sintaRank ? ` (SINTA ${journal.sintaRank.slice(1)})` : ''}`) : null,
    guidelinesUrl: journal?.journalUrl || null,
    authors: t.authors,
    affiliation: t.affil,
    corresponding: t.corr,
    sections: [
      { heading: t.abstract, paragraphs: [abstract], kind: 'abstract' },
      { heading: t.keywords, paragraphs: [[keywords.length ? keywords.join('; ') : ph('3–5 keywords')]], kind: 'keywords' },
      { heading: t.intro, paragraphs: [introP1, introP2, introP3] },
      { heading: t.review, paragraphs: review },
      { heading: t.method, paragraphs: method },
      { heading: t.results, paragraphs: results },
      { heading: t.conclusion, paragraphs: [[ph(en ? 'Answer the research objective directly; add recommendations for future research.' : 'Jawab tujuan penelitian secara langsung; sertakan saran penelitian selanjutnya.')]] },
      { heading: t.ack, paragraphs: [[ph(en ? 'Funding and acknowledgments (optional).' : 'Pendanaan dan ucapan terima kasih (opsional).')]] },
    ],
    references: refs.map((r, i) => formatReference(r, style, i + 1)),
    refsHeading: t.refs,
    style,
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const segHtml = (seg) => (typeof seg === 'string' ? esc(seg) : `<span class="placeholder">[${esc(seg.ph)}]</span>`);
const segMd = (seg) => (typeof seg === 'string' ? seg : `**[${seg.ph}]**`);

export function manuscriptToHtml(m, { standalone = false } = {}) {
  const body = [
    m.header ? `<p style="text-align:center;font-size:12px;opacity:.7">${esc(m.header)}</p>` : '',
    `<h1>${esc(m.title)}</h1>`,
    `<p style="text-align:center">${esc(m.authors)}</p>`,
    `<p style="text-align:center;font-size:13px">${esc(m.affiliation)}<br/>${esc(m.corresponding)}</p>`,
    ...m.sections.map(
      (s) =>
        `<h2>${esc(s.heading)}</h2>` +
        s.paragraphs.map((p) => `<p${s.kind === 'abstract' ? ' style="font-style:italic"' : ''}>${p.map(segHtml).join('')}</p>`).join(''),
    ),
    `<h2>${esc(m.refsHeading)}</h2>`,
    m.references.length ? m.references.map((r) => `<p class="ref">${esc(r)}</p>`).join('') : `<p>${segHtml({ ph: 'References' })}</p>`,
  ].join('\n');
  if (!standalone) return body;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title>
<style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.5;margin:2.5cm}h1{font-size:14pt;text-align:center}h2{font-size:12pt;text-transform:uppercase;margin-top:18pt}p{text-align:justify}.ref{padding-left:1.27cm;text-indent:-1.27cm}.placeholder{background:#fff7e6;color:#8a5a00}</style>
</head><body>${body}</body></html>`;
}

export function manuscriptToMarkdown(m) {
  const lines = [];
  if (m.header) lines.push(`_${m.header}_`, '');
  lines.push(`# ${m.title}`, '', m.authors, '', m.affiliation, '', m.corresponding, '');
  for (const s of m.sections) {
    lines.push(`## ${s.heading}`, '');
    for (const p of s.paragraphs) lines.push(p.map(segMd).join(''), '');
  }
  lines.push(`## ${m.refsHeading}`, '');
  m.references.forEach((r) => lines.push(m.style === 'ieee' ? r : `- ${r}`));
  return lines.join('\n');
}
