// Two-player online run against the live RTDB: create, join, buy, cursors, play level 1, compare worlds.
import { createRequire } from 'node:module';
const require = createRequire('/Users/jurek/openclaw/node_modules/');
const { chromium } = require('playwright-core');

const OUT = process.argv[2] || '.';
const URL = process.argv[3] || 'http://localhost:8643/';
const W = 1440, H = 900;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const mk = async (tag) => {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.logs = [];
  p.on('console', (m) => { if (!/404|Failed to load resource/.test(m.text())) p.logs.push(`[${tag} ${m.type()}] ${m.text()}`); });
  p.on('pageerror', (e) => p.logs.push(`[${tag} pageerror] ${e.message}\n${e.stack}`));
  return p;
};
const A = await mk('A'), B = await mk('B');
const log = (...a) => console.log(...a);
const ev = (p, f, arg) => p.evaluate(f, arg);

await A.goto(URL);
await A.fill('.inp.name', 'Ala');
await A.click('button.create');
await A.waitForFunction(() => window.spillway.room && window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 20000 });
const code = await ev(A, () => window.spillway.room.code);
log('room', code);
await B.goto(URL + '?r=' + code);
await B.fill('.inp.name', 'Bob');
await B.click('button.joinb');
await B.waitForFunction(() => window.spillway.screen && window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 20000 });
await A.waitForTimeout(1200);
log('A sees players', await ev(A, () => Object.values(window.spillway.room.players).map((p) => p.n + ':' + p.on).join(',')));
log('B sees players', await ev(B, () => Object.values(window.spillway.room.players).map((p) => p.n + ':' + p.on).join(',')));

await A.mouse.move(500, 400); await A.mouse.move(520, 420);
await A.waitForTimeout(800);
log('B sees cursor els', await ev(B, () => window.spillway.screen.curEls.size));

await ev(A, () => { window.spillway.screen.cam = 1200; });
await A.waitForTimeout(400);
await A.screenshot({ path: `${OUT}/mp-01-shop-A.png` });
const before = await ev(B, () => window.spillway.room.econ.money);
await ev(A, () => document.querySelector('.stall[data-k="funnel"] .buy').click());
await A.waitForTimeout(1200);
log('money B before/after A bought funnel', before, await ev(B, () => window.spillway.room.econ.money), 'A inv', JSON.stringify(await ev(A, () => window.spillway.room.econ.inv)));

await ev(B, () => document.querySelector('.go-btn').click());
await A.waitForFunction(() => window.spillway.screen.constructor.name === 'LevelScreen', null, { timeout: 15000 });
await B.waitForFunction(() => window.spillway.screen.constructor.name === 'LevelScreen', null, { timeout: 15000 });
const infoA = await ev(A, () => { const s = window.spillway.screen; return { me: s.me, host: s.session.host, scale: s.scale, cam: s.cam, tanks: s.world.tanks.map((t) => [t.x, t.y]), cups: s.world.cups.map((c) => [c.x, c.y, c.c]) }; });
const infoB = await ev(B, () => { const s = window.spillway.screen; return { me: s.me, host: s.session.host }; });
log('A', JSON.stringify(infoA), 'B', JSON.stringify(infoB));
await A.waitForTimeout(2300);

const toS = (wx, wy, cam, scale) => [(wx - cam) * scale, wy * scale];
async function draw(p, pts, cam, scale) {
  await ev(p, (c) => { window.spillway.screen.cam = c; }, cam);
  await p.waitForTimeout(120);
  const [x0, y0] = toS(...pts[0], cam, scale);
  await p.mouse.move(x0, y0); await p.mouse.down();
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = toS(...pts[k - 1], cam, scale), [c, d] = toS(...pts[k], cam, scale);
    const n = Math.ceil(Math.hypot(c - a, d - b) / 6);
    for (let i = 1; i <= n; i++) { await p.mouse.move(a + (c - a) * i / n, b + (d - b) * i / n); if (i % 5 === 0) await p.waitForTimeout(10); }
  }
  await p.mouse.up();
}
const sc = infoA.scale;
const plan = (i) => {
  const t = infoA.tanks[i], cup = infoA.cups.find((c) => c[2] === i);
  const end = [cup[0] - 38, cup[1] - 150 - 22 - (i === 1 ? 0 : 0)];
  const start = [t[0] - 60, 236];
  const mid = [start[0] + (end[0] - start[0]) * 0.5, start[1] + (end[1] - start[1]) * 0.5];
  return [start, mid, end];
};
const pa = plan(0), pb = plan(1);
await draw(A, [pa[0], pa[1]], -60, sc);
await draw(B, [pb[0], pb[1]], -60, sc);
await draw(A, [pa[1], pa[2]], 700, sc);
await draw(B, [pb[1], pb[2]], 700, sc);
await ev(A, () => { window.spillway.screen.cam = -60; });
await ev(B, () => { window.spillway.screen.cam = 400; });
await A.waitForTimeout(700);
await A.mouse.move(700, 300);
await A.keyboard.down('Space'); await B.keyboard.down('Space');
await A.waitForTimeout(2500);
await B.mouse.move(600, 500); await B.mouse.move(640, 520);
await A.waitForTimeout(500);
await A.screenshot({ path: `${OUT}/mp-02-level-A.png` });
await B.screenshot({ path: `${OUT}/mp-03-level-B.png` });
await A.waitForTimeout(3000);
await A.keyboard.up('Space'); await B.keyboard.up('Space');
const sA = await ev(A, () => { const w = window.spillway.screen.world; return { tick: w.tick, cs: w.checksum() }; });
const sB = await ev(B, () => { const w = window.spillway.screen.world, s = window.spillway.screen.session; return { tick: w.tick, cs: w.checksum(), confirmed: s.confirmed, lag: s.confirmed - w.tick }; });
log('mid A', JSON.stringify(sA), 'B', JSON.stringify(sB));
await A.waitForFunction(() => window.spillway.screen.world && window.spillway.screen.world.ended, null, { timeout: 60000 }).catch(() => log('A did not end'));
await B.waitForFunction(() => window.spillway.screen.world && window.spillway.screen.world.ended, null, { timeout: 60000 }).catch(() => log('B did not end'));
const eA = await ev(A, () => { const w = window.spillway.screen.world; return w ? { tick: w.tick, cs: w.checksum(), got: w.got } : null; });
const eB = await ev(B, () => { const w = window.spillway.screen.world; return w ? { tick: w.tick, cs: w.checksum(), got: w.got } : null; });
log('end A', JSON.stringify(eA)); log('end B', JSON.stringify(eB)); log(eA && eB && eA.cs === eB.cs ? 'WORLDS MATCH' : 'WORLDS DIFFER');
await A.waitForFunction(() => window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 15000 }).catch(() => log('A no shop'));
await B.waitForFunction(() => window.spillway.screen.constructor.name === 'ShopScreen', null, { timeout: 15000 }).catch(() => log('B no shop'));
await B.waitForTimeout(800);
await B.screenshot({ path: `${OUT}/mp-04-results-B.png` });
log('money A/B', await ev(A, () => window.spillway.room.econ.money), await ev(B, () => window.spillway.room.econ.money), 'lv', await ev(B, () => window.spillway.room.meta.lv));
await ev(A, () => window.spillway.toMenu());
await ev(B, () => window.spillway.toMenu());
await A.waitForTimeout(800);
console.log([...A.logs, ...B.logs].slice(-30).join('\n'));
await browser.close();
