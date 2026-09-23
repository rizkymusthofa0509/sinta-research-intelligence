// Central crawler configuration. Every limit that protects the crawled sites lives here.

const env = (key, fallback) => {
  const value = process.env[key];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
};

export const serverConfig = {
  port: env('API_PORT', 5174),
  // How many searches may run at the same time. Others wait in line.
  maxConcurrentSearches: env('MAX_CONCURRENT_SEARCHES', 2),
  maxQueuedSearches: env('MAX_QUEUED_SEARCHES', 6),
};

export const crawlerConfig = {
  // The crawler identifies itself honestly. We do not impersonate a browser to
  // get past a site's bot filter: if a site refuses this agent, we treat that
  // source as unavailable.
  userAgent: process.env.CRAWLER_USER_AGENT || 'OpenKnowledgeMapping/1.0 (academic research tool; respects robots.txt)',
  // After this many consecutive 401/403/challenge responses a host is paused.
  blockedHostThreshold: 2,
  blockedHostCooldownMs: 15 * 60 * 1000,

  // Browser/page behaviour
  headless: true,
  navigationTimeoutMs: env('NAV_TIMEOUT_MS', 25000),
  maxOpenPages: env('MAX_OPEN_PAGES', 4),
  retries: 2,
  retryBaseDelayMs: 1500,

  // Politeness: minimum gap between two requests to the same host, and
  // how many requests to the same host may be in flight at once.
  defaultHostDelayMs: env('HOST_DELAY_MS', 1000),
  perHostConcurrency: 1,
  // SINTA and Garuda serve many small list pages; allow 2 parallel requests
  // with a shorter gap. Still far below what a human clicking around produces.
  hostOverrides: {
    'sinta.kemdiktisaintek.go.id': { delayMs: 600, concurrency: 2 },
    'garuda.kemdiktisaintek.go.id': { delayMs: 600, concurrency: 2 },
    'apiarjuna.kemdiktisaintek.go.id': { delayMs: 400, concurrency: 2 },
    'api.openalex.org': { delayMs: 250, concurrency: 2 },
  },

  // Resource types we never need (we only read server-rendered HTML).
  blockedResourceTypes: ['image', 'media', 'font', 'stylesheet', 'other', 'manifest', 'texttrack'],

  // Result limits
  allowedLimits: [25, 50, 100, 250, 500],
  defaultLimit: 100,

  // Journal metadata cache (memory only, never written to disk)
  journalCacheTtlMs: 30 * 60 * 1000,
  journalCacheMaxEntries: 2000,

  // Deep keyword extraction from article landing pages (OJS meta tags)
  enrichment: {
    concurrency: 4,
    timeBudgetMs: env('ENRICH_BUDGET_MS', 60000),
    navigationTimeoutMs: 12000,
    maxArticles: 250,
  },

  // How many journal profile pages to read during a search (the rest load on demand).
  eagerProfiles: 12,

  // Local sentence-embedding model for semantic similarity and the research landscape.
  // Runs on this server (no external API); downloaded once into server/.models.
  semantic: {
    enabled: process.env.SEMANTIC !== 'off',
    model: process.env.SEMANTIC_MODEL || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
    dtype: 'q8',
    batchSize: 32,
    maxWaitMs: env('SEMANTIC_WAIT_MS', 45000),
  },

  // Accreditation rank from ARJUNA (official decrees behind SINTA's S1–S6).
  accreditation: {
    concurrency: 3,
    maxProposalsPerJournal: 4,
    timeBudgetMs: env('RANK_BUDGET_MS', 90000),
  },

  // Journal → SINTA resolution
  sintaResolve: {
    concurrency: 3,
    maxJournals: 150,
    timeBudgetMs: env('SINTA_BUDGET_MS', 90000),
  },
};

export const sources = {
  garuda: {
    id: 'garuda',
    label: 'Garuda (Kemdiktisaintek)',
    baseUrl: 'https://garuda.kemdiktisaintek.go.id',
    pageSize: 10,
  },
  openalex: {
    id: 'openalex',
    label: 'OpenAlex',
    baseUrl: 'https://openalex.org',
    apiBase: 'https://api.openalex.org',
    // Optional contact e-mail puts requests in OpenAlex's "polite pool".
    mailto: process.env.OPENALEX_MAILTO || null,
  },
  arjuna: {
    id: 'arjuna',
    label: 'ARJUNA (Akreditasi Jurnal Nasional)',
    baseUrl: 'https://arjuna.kemdiktisaintek.go.id',
    apiBase: 'https://apiarjuna.kemdiktisaintek.go.id/',
  },
  sinta: {
    id: 'sinta',
    label: 'SINTA',
    baseUrl: 'https://sinta.kemdiktisaintek.go.id',
    pageSize: 10,
  },
};

// Hosts the SINTA/Garuda crawlers are allowed to visit. Article enrichment may
// visit other public hosts, but those go through the public-URL validator.
export const trustedSourceHosts = [
  'sinta.kemdiktisaintek.go.id',
  'garuda.kemdiktisaintek.go.id',
  'apiarjuna.kemdiktisaintek.go.id',
  'api.openalex.org',
];
