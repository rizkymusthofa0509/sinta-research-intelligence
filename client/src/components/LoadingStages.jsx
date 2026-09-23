// Crawl stages, in order, as reported by the server's progress events.
export const STAGES = [
  { id: 'queue', label: 'Waiting for a free crawler slot…' },
  { id: 'sinta', label: 'Searching SINTA…' },
  { id: 'articles', label: 'Finding journals & extracting articles…' },
  { id: 'journals', label: 'Looking up journals (category, publisher)…' },
  { id: 'ranks', label: 'Reading SINTA accreditation (ARJUNA)…' },
  { id: 'enrich', label: 'Reading author keywords…' },
  { id: 'keywords', label: 'Analyzing keywords…' },
  { id: 'map', label: 'Building topic map…' },
];
