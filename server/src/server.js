import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { serverConfig } from './config/crawler.js';
import searchRoutes from './routes/search.js';
import { warmUp } from './services/semantic.js';
import { closeBrowser } from './utils/browser.js';
import { createLogger } from './utils/logger.js';

const log = createLogger('server');
const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use('/api', searchRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// In production (`npm run build && npm start`) the API also serves the built UI.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const server = app.listen(serverConfig.port, () => {
  log.info(`API listening on http://localhost:${serverConfig.port}`);
  // Load the local embedding model in the background (downloads once on first run).
  warmUp();
});
server.requestTimeout = 0; // crawling can take minutes; SSE keeps the connection alive

async function shutdown(signal) {
  log.info(`${signal} received, closing`);
  server.close();
  await closeBrowser();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
