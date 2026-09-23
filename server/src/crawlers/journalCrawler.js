import { crawlerConfig } from '../config/crawler.js';
import { parseArticleMeta, toOjsLandingUrl } from '../parsers/journalParser.js';
import { fetchHtml } from '../utils/browser.js';
import { mapLimit } from '../utils/concurrency.js';
import { createLogger } from '../utils/logger.js';
import { isPublicHttpUrl } from '../utils/urlValidator.js';

const log = createLogger('journal-pages');

/**
 * Visit article landing pages on the journals' own websites and read the
 * standard scholarly meta tags (author keywords, authors, DOI, ISSN).
 * Lazy and bounded: stops at the time budget; articles not reached keep only
 * the keywords extracted from title + abstract.
 */
export async function enrichFromArticlePages(articles, { signal, onProgress, onArticle, budgetMs } = {}) {
  const cfg = crawlerConfig.enrichment;
  const targets = articles
    .filter((a) => a.articleUrl && isPublicHttpUrl(a.articleUrl))
    .slice(0, cfg.maxArticles);
  const deadline = Date.now() + (budgetMs ?? cfg.timeBudgetMs);
  let done = 0;
  let enriched = 0;

  await mapLimit(
    targets,
    cfg.concurrency,
    async (article) => {
      const url = toOjsLandingUrl(article.articleUrl);
      try {
        const { html } = await fetchHtml(url, {
          signal,
          timeoutMs: cfg.navigationTimeoutMs,
          retries: 0,
        });
        const meta = parseArticleMeta(html, url);
        article.pageMeta = { ...meta, url };
        if (meta.keywords.length) enriched += 1;
        onArticle?.(article);
      } catch (err) {
        if (err.code === 'ABORTED') throw err;
        article.pageMeta = { error: err.code || 'ERROR', url };
      }
      done += 1;
      onProgress?.({ done, total: targets.length, enriched });
    },
    { signal, deadline },
  );

  log.info(`Article pages: ${done}/${targets.length} visited, ${enriched} with author keywords`);
  return { visited: done, total: targets.length, enriched, timedOut: done < targets.length };
}
