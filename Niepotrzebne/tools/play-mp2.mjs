// Live RTDB edge cases: client reload mid-level (snapshot rejoin) and host closing the tab (migration).
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const URL = 'http://localhost:8643/';
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.ctx = ctx; p.logs = [];
  p.on('console', (m) => { if (!/404|Failed to load resource/.test(m.text())) p.logs.push(`[${tag}] ${m.text()}`); });
  p.on('pageerror', (e) => p.logs.push(`[${tag} pageerror] ${e.message}`));
  return p;
};
const log = (...a) => console.log(...a);
const ev = (p, f, a) => p.evaluate(f, a);
const A = await mk('A'), B = await mk('B');
await A.goto(URL); await A.fill('.inp.name', 'Ala'); await A.click('button.create');
await A.waitForFunction(() => window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 20000 });
const code = await ev(A, () => window.spillway.room.code);
await B.goto(URL + '?r=' + code); await B.fill('.inp.name', 'Bob'); await B.click('button.joinb');
await B.waitForFunction(() => window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 20000 });
await ev(A, () => document.querySelector('.go-btn').click());
for (const p of [A, B]) await p.waitForFunction(() => window.spillway.screen.constructor.name === 'LevelScreen', null, { timeout: 15000 });
await A.waitForTimeout(2200);
const mkLine = (x0, y0, x1, y1) => { const d = []; for (let i = 0; i <= 60; i++) d.push(Math.round((x0 + (x1 - x0) * i / 60) * 2), Math.round((y0 + (y1 - y0) * i / 60) * 2)); return d; };
await ev(A, (d) => { const s = window.spillway.screen; s.session.input({ t: 'l', d }); s.session.input({ t: 'p', on: true }); }, mkLine(240, 236, 1720, 648));
await ev(B, (d) => { const s = window.spillway.screen; s.session.input({ t: 'l', d }); s.session.input({ t: 'p', on: true }); }, mkLine(600, 236, 2080, 620));
await A.waitForTimeout(2500);

log('--- B reloads mid-level');
await B.reload();
await B.waitForFunction(() => window.spillway && window.spillway.screen && window.spillway.screen.constructor.name === 'Menu', null, { timeout: 10000 });
await B.fill('.inp.name', 'Bob');
await B.click('button.joinb');
await B.waitForFunction(() => window.spillway.screen.constructor.name === 'LevelScreen', null, { timeout: 15000 });
await B.waitForTimeout(3500);
let sA = await ev(A, () => { const w = window.spillway.screen.world; return { t: w.tick, n: w.fluid.n, lines: w.lines.length }; });
let sB = await ev(B, () => { const s = window.spillway.screen; return { t: s.world.tick, n: s.world.fluid.n, lines: s.world.lines.length, me: s.me, waitSnap: s.session.waitSnap, conf: s.session.confirmed }; });
log('after reload A', JSON.stringify(sA), 'B', JSON.stringify(sB));

log('--- host A closes the tab');
await A.ctx.close();
await B.waitForFunction(() => window.spillway.room.isHost && window.spillway.screen.session && window.spillway.screen.session.host, null, { timeout: 90000 }).then(() => log('B became host')).catch(() => log('B did NOT become host'));
await B.waitForTimeout(3000);
sB = await ev(B, () => { const s = window.spillway.screen; return s.world ? { t: s.world.tick, n: s.world.fluid.n, host: s.session.host, ended: s.world.ended } : { screen: s.constructor.name }; });
log('B after migration', JSON.stringify(sB));
await ev(B, () => window.spillway.screen.session && window.spillway.screen.session.input({ t: 'end' }));
await B.waitForFunction(() => window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 20000 }).then(() => log('B back in shop')).catch(() => log('B stuck'));
log('B money', await ev(B, () => window.spillway.room.econ.money), 'lv', await ev(B, () => window.spillway.room.meta.lv));
await ev(B, () => window.spillway.toMenu());
await B.waitForTimeout(500);
console.log([...A.logs, ...B.logs].slice(-25).join('\n'));
await browser.close();
