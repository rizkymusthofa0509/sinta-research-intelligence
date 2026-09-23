// Regenerates the README screenshots from a running instance.
//   npm run build && npm start          (in another terminal)
//   npm run screenshots                  (BASE_URL=http://localhost:5174 QUERY="machine learning")
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL || 'http://localhost:5174';
const QUERY = process.env.QUERY || 'machine learning';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../docs/screenshots');
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);

const shot = async (name, opts = {}) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, ...opts });
  console.log('saved', path.relative(process.cwd(), file));
};
const openTab = async (id, wait = 1500) => {
  await page.evaluate((t) => {
    window.location.hash = t;
    window.scrollTo(0, 0);
  }, id);
  await sleep(wait);
};

// Home
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  sessionStorage.clear();
  localStorage.removeItem('okm-theme');
});
await page.reload({ waitUntil: 'networkidle0' });
await shot('01-beranda');

// Search (live streaming → final result)
await page.type('input[aria-label="Research keyword"]', QUERY);
await page.keyboard.press('Enter');
await sleep(12000);
await shot('02-peta-bubble-live');
await page.waitForFunction((q) => document.title.toLowerCase().startsWith(q.toLowerCase()), { timeout: 6 * 60 * 1000 }, QUERY);
await sleep(4000);
await shot('03-peta-bubble');

// Bubble overlay: click the third-largest bubble
await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('svg g[role="button"]')];
  const byR = nodes.map((g) => [g, Number(g.querySelector('circle')?.getAttribute('r') || 0)]).sort((a, b) => b[1] - a[1]);
  byR[2]?.[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await sleep(1500);
await shot('04-overlay-bubble');
await page.keyboard.press('Escape');

// Results below the map
await page.evaluate(() => document.getElementById('results')?.scrollIntoView());
await sleep(800);
await shot('05-artikel-terdekat');

for (const [id, name] of [
  ['landscape', '06-lanskap-riset'],
  ['trends', '07-tren-heatmap'],
  ['gaps', '08-gap-kombinasi'],
  ['insights', '09-insights-judul'],
  ['journals', '10-jurnal-penerbit'],
]) {
  await openTab(id);
  await shot(name);
}

await openTab('generate');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Use top recommendation'))?.click());
await sleep(1200);
await shot('11-journal-generate');

await openTab('report');
await shot('12-laporan');

// Dark mode (result restored from sessionStorage after reload)
await page.evaluate(() => localStorage.setItem('okm-theme', 'dark'));
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await page.goto(`${BASE}/#search`, { waitUntil: 'networkidle0' });
await sleep(4000);
await shot('13-dark-mode');
await page.evaluate(() => localStorage.removeItem('okm-theme'));

await browser.close();
