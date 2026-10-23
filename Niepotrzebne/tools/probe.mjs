// Quick probe: solo -> shop -> continue, prints screen and errors.
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const logs = [];
page.on('console', (m) => { if (!/404/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto('http://localhost:8643/');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('button.solo').click()); await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.go-btn').click()); await page.waitForTimeout(2500);
logs.push(await page.evaluate(() => window.spillway.screen.constructor.name + ' ' + JSON.stringify(window.spillway.room.meta)));
console.log(logs.join('\n'));
await browser.close();
