// Headless Chrome (real GPU via ANGLE/Metal) screenshot + console harness for Spillway.
// node shot.mjs <url> <out.png> [waitMs] [width] [height] [setupJS] [dpr]
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const [url, out = 'shot.png', wait = '4000', w = '1680', h = '1050', setup = '', dpr = '1'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));
await page.goto(url, { waitUntil: 'load' });
if (setup) { await page.waitForTimeout(300); try { const r = await page.evaluate(setup); if (r !== undefined) logs.push('[setup] ' + JSON.stringify(r)); } catch (e) { logs.push('[setup error] ' + e.message); } }
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: true });
console.log(logs.slice(-60).join('\n'));
await browser.close();
