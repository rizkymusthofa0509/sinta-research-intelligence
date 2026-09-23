import { CATEGORIES } from '../../../shared/categories.js';
import { crawlerConfig, serverConfig } from '../config/crawler.js';
import { SearchError, countDocuments, getJournalProfile, runSearch } from '../services/searchService.js';
import { Semaphore } from '../utils/concurrency.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('api');
const searchSlots = new Semaphore(serverConfig.maxConcurrentSearches, { maxQueue: serverConfig.maxQueuedSearches });

/** Validate query-string parameters; throws SearchError(400) on bad input. */
function parseParams(query) {
  // Accept "artificial-intelligence" as well as "artificial intelligence".
  const raw = String(query.q ?? '').trim();
  const q = (/\s/.test(raw) ? raw : raw.replace(/-/g, ' ')).replace(/\s+/g, ' ').trim();
  if (q.length < 2) throw new SearchError('INVALID_QUERY', 'Please enter a keyword (at least 2 characters).', 400);
  if (q.length > 120) throw new SearchError('INVALID_QUERY', 'Keyword is too long (max 120 characters).', 400);

  const limit = query.limit ? Number(query.limit) : crawlerConfig.defaultLimit;
  if (!crawlerConfig.allowedLimits.includes(limit)) {
    throw new SearchError('INVALID_LIMIT', `limit must be one of ${crawlerConfig.allowedLimits.join(', ')}`, 400);
  }
  const category = query.category && query.category !== 'all' ? String(query.category) : null;
  if (category && !CATEGORIES.some((c) => c.id === category)) {
    throw new SearchError('INVALID_CATEGORY', 'Unknown category', 400);
  }
  const deep = query.deep === '1' || query.deep === 'true';
  const sources = String(query.sources || 'garuda,openalex')
    .split(',')
    .filter((x) => x === 'garuda' || x === 'openalex');
  if (!sources.length) throw new SearchError('INVALID_SOURCES', 'Choose at least one source (garuda, openalex).', 400);
  const scope = query.scope === 'global' ? 'global' : 'id';
  return { query: q, limit, category, deep, sources, scope };
}

function errorBody(err) {
  if (err instanceof SearchError) return { status: err.status, body: { error: err.code, message: err.message } };
  if (err.code === 'BUSY') {
    return { status: 503, body: { error: 'BUSY', message: 'The explorer is busy with other searches. Please try again in a minute.' } };
  }
  return { status: 500, body: { error: 'INTERNAL', message: 'Unexpected error while crawling. Please try again later.' } };
}

/** GET /api/search — plain JSON response. */
export async function search(req, res) {
  const controller = new AbortController();
  res.on('close', () => !res.writableEnded && controller.abort());
  try {
    const params = parseParams(req.query);
    const result = await searchSlots.run(() => runSearch({ ...params, signal: controller.signal }), controller.signal);
    res.json(result);
  } catch (err) {
    if (err.code === 'ABORTED') return;
    if (!(err instanceof SearchError)) log.error(err.stack || err.message);
    const { status, body } = errorBody(err);
    res.status(status).json(body);
  }
}

/** GET /api/search/stream — Server-Sent Events with progress, then the result. */
export async function searchStream(req, res) {
  const controller = new AbortController();
  let params;
  try {
    params = parseParams(req.query);
  } catch (err) {
    const { status, body } = errorBody(err);
    return res.status(status).json(body);
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event, data) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  // Named heartbeat events (not comments) so the client can detect a stalled stream.
  const heartbeat = setInterval(() => send('ping', { t: Date.now() }), 10000);
  res.on('close', () => {
    clearInterval(heartbeat);
    if (!res.writableEnded) controller.abort();
  });

  try {
    if (searchSlots.active >= searchSlots.max) send('progress', { stage: 'queue', message: 'Waiting for a free crawler slot…' });
    const result = await searchSlots.run(
      () =>
        runSearch({
          ...params,
          signal: controller.signal,
          onProgress: (p) => send('progress', p),
          // New/updated articles as they are crawled; the browser grows the map live.
          onArticles: (articles) => send('articles', { articles }),
          onPlan: (plan) => send('plan', plan),
        }),
      controller.signal,
    );
    send('result', result);
  } catch (err) {
    if (err.code === 'ABORTED') return;
    if (!(err instanceof SearchError)) log.error(err.stack || err.message);
    send('failure', errorBody(err).body);
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
}

/** GET /api/count?q=… — documents each source reports for a query (verifies research gaps). */
export async function count(req, res) {
  const q = String(req.query.q || '').replace(/\s+/g, ' ').trim();
  if (q.length < 2 || q.length > 160) return res.status(400).json({ error: 'INVALID_QUERY', message: 'Query must be 2–160 characters.' });
  const controller = new AbortController();
  res.on('close', () => !res.writableEnded && controller.abort());
  try {
    res.json(await countDocuments(q, { scope: req.query.scope === 'global' ? 'global' : 'id', signal: controller.signal }));
  } catch (err) {
    if (err.code === 'ABORTED') return;
    res.status(502).json({ error: 'SOURCE_UNAVAILABLE', message: 'Could not reach the sources right now.' });
  }
}

/** GET /api/journal-profile?url=https://garuda.kemdiktisaintek.go.id/journal/view/123 */
export async function journalProfile(req, res) {
  let url;
  try {
    url = new URL(String(req.query.url || ''));
  } catch {
    return res.status(400).json({ error: 'INVALID_URL', message: 'A Garuda journal URL is required.' });
  }
  // Only Garuda journal pages: this endpoint must never become a generic proxy.
  if (url.protocol !== 'https:' || url.hostname !== 'garuda.kemdiktisaintek.go.id' || !/^\/journal\/view\/\d+\/?$/.test(url.pathname) || url.search) {
    return res.status(400).json({ error: 'INVALID_URL', message: 'Only Garuda journal profile URLs are accepted.' });
  }
  const controller = new AbortController();
  res.on('close', () => !res.writableEnded && controller.abort());
  try {
    res.json(await getJournalProfile(url.toString(), { signal: controller.signal }));
  } catch (err) {
    if (err.code === 'ABORTED') return;
    res.status(502).json({ error: err.code || 'SOURCE_UNAVAILABLE', message: 'Garuda journal profile is currently unavailable.' });
  }
}

/** GET /api/meta — options the UI needs (limits, categories). */
export function meta(_req, res) {
  res.json({
    limits: crawlerConfig.allowedLimits,
    defaultLimit: crawlerConfig.defaultLimit,
    categories: CATEGORIES.map(({ id, label, labelId, sintaAreaId, areas }) => ({ id, label, labelId, sintaAreaId, areas })),
    sources: [
      { id: 'garuda', label: 'Garuda', url: 'https://garuda.kemdiktisaintek.go.id', role: 'Article search (title, authors, abstract, DOI, article URL)' },
      { id: 'sinta', label: 'SINTA', url: 'https://sinta.kemdiktisaintek.go.id', role: 'Journal accreditation rank, ISSN, publisher, journal website' },
      { id: 'articlePage', label: 'Journal websites', url: null, role: 'Author keywords from article meta tags (optional deep mode)' },
    ],
  });
}
