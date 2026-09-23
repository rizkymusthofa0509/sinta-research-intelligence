// Reference formatting from crawled metadata only. Missing parts are omitted, never invented.

function splitName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { last: parts[0], initials: '' };
  const last = parts.pop();
  return { last, initials: parts.map((p) => `${p[0].toUpperCase()}.`).join(' ') };
}

function apaAuthors(authors) {
  if (!authors?.length) return null;
  const names = authors.map((a) => {
    const { last, initials } = splitName(a);
    return initials ? `${last}, ${initials}` : last;
  });
  if (names.length === 1) return names[0];
  if (names.length <= 20) return `${names.slice(0, -1).join(', ')}, & ${names[names.length - 1]}`;
  return `${names.slice(0, 19).join(', ')}, … ${names[names.length - 1]}`;
}

function ieeeAuthors(authors) {
  if (!authors?.length) return null;
  const names = authors.map((a) => {
    const { last, initials } = splitName(a);
    return initials ? `${initials} ${last}` : last;
  });
  if (names.length > 6) return `${names[0]} et al.`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

const volumeIssue = (issue) => {
  if (!issue) return null;
  const vol = issue.match(/Vol(?:ume)?\.?\s*(\d+)/i)?.[1];
  const no = issue.match(/No\.?\s*(\d+)/i)?.[1];
  return { vol, no };
};

export function formatReference(a, style = 'apa', index = 1) {
  const vi = volumeIssue(a.issue);
  const link = a.doiUrl || a.articleUrl;
  if (style === 'ieee') {
    const parts = [
      `[${index}]`,
      ieeeAuthors(a.authors) ? `${ieeeAuthors(a.authors)},` : null,
      `“${a.title},”`,
      a.journalName ? `${a.journalName},` : null,
      vi?.vol ? `vol. ${vi.vol},` : null,
      vi?.no ? `no. ${vi.no},` : null,
      a.publicationYear ? `${a.publicationYear}` : 'n.d.',
    ].filter(Boolean);
    return `${parts.join(' ')}${link ? `, ${a.doi ? `doi: ${a.doi}` : link}` : ''}.`;
  }
  const authors = apaAuthors(a.authors) || a.journalName || 'Anonymous';
  const year = a.publicationYear ? `(${a.publicationYear})` : '(n.d.)';
  const journal = a.journalName ? ` ${a.journalName}${vi?.vol ? `, ${vi.vol}` : ''}${vi?.no ? `(${vi.no})` : ''}.` : '';
  return `${authors} ${year}. ${a.title}.${journal}${link ? ` ${link}` : ''}`;
}

export function inTextCitation(a, style = 'apa', index = 1) {
  if (style === 'ieee') return `[${index}]`;
  const first = a.authors?.[0] ? splitName(a.authors[0]).last : a.journalName || 'Anonymous';
  const etal = a.authors?.length > 2 ? ' et al.' : a.authors?.length === 2 ? ` & ${splitName(a.authors[1]).last}` : '';
  return `(${first}${etal}, ${a.publicationYear || 'n.d.'})`;
}
