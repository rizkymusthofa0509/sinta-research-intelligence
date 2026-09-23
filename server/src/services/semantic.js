import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crawlerConfig } from '../config/crawler.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('semantic');
const cfg = crawlerConfig.semantic;
const CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.models');

// Local multilingual sentence-embedding model (Indonesian + English in one space).
// Nothing is sent to an external service; the model file is downloaded once.
let extractorPromise = null;
let status = cfg.enabled ? 'idle' : 'disabled'; // idle | loading | ready | failed | disabled

export function semanticStatus() {
  return status;
}

export function loadModel() {
  if (!cfg.enabled) return Promise.resolve(null);
  if (!extractorPromise) {
    status = 'loading';
    const started = Date.now();
    extractorPromise = import('@huggingface/transformers')
      .then(async ({ pipeline, env }) => {
        env.cacheDir = CACHE_DIR;
        env.allowLocalModels = true;
        const extractor = await pipeline('feature-extraction', cfg.model, { dtype: cfg.dtype });
        status = 'ready';
        log.info(`Model ${cfg.model} ready in ${Date.now() - started}ms`);
        return extractor;
      })
      .catch((err) => {
        status = 'failed';
        extractorPromise = null;
        log.warn(`Embedding model unavailable: ${err.message}`);
        return null;
      });
  }
  return extractorPromise;
}

/** Start loading in the background at server start so the first search is not delayed. */
export function warmUp() {
  loadModel();
}

/** Resolve the model within `waitMs`, or null if it is not ready by then. */
async function modelWithin(waitMs) {
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), waitMs).unref?.());
  return Promise.race([loadModel(), timeout]);
}

/** Text used to represent an article: title plus the start of the abstract. */
export const articleText = (a) => `${a.title || ''}. ${(a.abstract || '').slice(0, 600)}`.trim();

/**
 * Embed texts (L2-normalised, 384 dims). Returns null when the model is unavailable.
 * Runs in batches and yields between them so the server stays responsive.
 */
export async function embed(texts, { signal, waitMs = cfg.maxWaitMs } = {}) {
  const extractor = await modelWithin(waitMs);
  if (!extractor) return null;
  const out = [];
  for (let i = 0; i < texts.length; i += cfg.batchSize) {
    if (signal?.aborted) return null;
    const batch = texts.slice(i, i + cfg.batchSize).map((t) => t || ' ');
    const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
    out.push(...tensor.tolist());
    await new Promise((r) => setImmediate(r));
  }
  return out;
}

export const cosine = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};
