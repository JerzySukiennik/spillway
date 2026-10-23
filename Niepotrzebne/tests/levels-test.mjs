import { World, layout, CUP_H } from '../../src/sim/world.js';
import { LEVELS } from '../../src/sim/levels.js';

const stroke = (pts) => { const d = []; for (let k = 1; k < pts.length; k++) { const [x0, y0] = pts[k - 1], [x1, y1] = pts[k]; const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10)); for (let i = k === 1 ? 0 : 1; i <= n; i++) d.push(Math.round((x0 + (x1 - x0) * i / n) * 2), Math.round((y0 + (y1 - y0) * i / n) * 2)); } return d; };
const len = (pts) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);

function run(li, n, plan, opts = {}) {
  const lv = LEVELS[li];
  const w = new World(lv, { n, seed: 5, inv: [] });
  const L = layout(lv, n);
  const strokes = plan(L, lv);
  const inkUse = new Array(n).fill(0);
  for (const s of strokes) { if (s.at) continue; w.apply({ t: 'l', p: s.p, d: stroke(s.pts) }); inkUse[s.p] += len(s.pts); }
  const pumps = opts.pumps || ((t, p) => true);
  let t = 0;
  while (!w.ended && t < 9000) {
    for (const s of strokes) if (s.at === t) { if (s.erase) w.apply({ t: 'e', p: s.p, d: stroke(s.pts) }); else { w.apply({ t: 'l', p: s.p, d: stroke(s.pts) }); inkUse[s.p] += len(s.pts); } }
    for (let p = 0; p < n; p++) { const on = pumps(t, p); if (on !== w.tanks[p].on) w.apply({ t: 'p', p, on }); }
    w.step(); t++;
  }
  const r = w.result();
  const per = w.tanks[0].total;
  const got = r.got.slice(0, n).map((g) => Math.round(g / per * 100) + '%').join(' ');
  console.log(`L${li + 1} ${lv.name.padEnd(15)} n=${n} ticks=${t} got[${got}] rainbow=${r.got[4]} wrong=${r.wrong} ink=${inkUse.map((v) => Math.round(v)).join('/')}/${w.inkMax} left=${w.ink.map((v) => Math.round(v)).join('/')}`);
  return r;
}

const straight = (via = [], gap = 34) => (L) => L.tanks.map((t) => {
  const cup = L.cups.find((c) => c.c === t.p);
  const i = t.p;
  return { p: i, pts: [[t.x - 60, 236], ...via.map(([x, y]) => [x, y - i * gap]), [cup.x - 38, cup.y - CUP_H - 22]] };
});

const plans = [
  straight(),
  straight([[1260, 444]]),
  straight([[1700, 452]]),
  straight([[1300, 410]]),
  null,
  straight([[1560, 470], [1900, 490]]),
  straight([[1690, 448], [1850, 462]]),
  straight(),
  null,
  null,
];

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
for (let li = 0; li < LEVELS.length; li++) {
  if (only && !only.includes(li + 1)) continue;
  for (const n of [1, 2, 4]) if (plans[li]) run(li, n, plans[li]);
}

if (!only || only.includes(4)) {
  run(3, 2, (L) => {
    const rc = L.cups.find((c) => c.c === 4);
    return [
      { p: 0, pts: [[L.tanks[0].x - 40, 232], [1240, 410]] },
      { p: 1, pts: [[L.tanks[1].x - 40, 232], [1380, 410]] },
      { p: 0, pts: [[1270, 606], [rc.x + 6, rc.y - CUP_H - 26]] },
    ];
  });
}
if (!only || only.includes(5)) {
  run(4, 1, straight());
  run(4, 2, (L) => {
    const c0 = L.cups.find((c) => c.c === 0), c1 = L.cups.find((c) => c.c === 1);
    const s1 = [[L.tanks[1].x - 40, 232], [c1.x + 6, c1.y - CUP_H - 26]];
    const s0 = [[L.tanks[0].x - 40, 232], [c0.x + 6, c0.y - CUP_H - 26]];
    return [{ p: 1, pts: s1 }, { p: 1, at: 1700, erase: true, pts: s1 }, { p: 0, at: 1700, pts: s0 }];
  }, { pumps: (t, p) => p === 1 ? t < 900 : t > 1720 });
}
if (!only || only.includes(9)) {
  run(8, 1, (L) => [{ p: 0, pts: [[L.tanks[0].x - 40, 232], [1700, 425]] }, { p: 0, pts: [[1660, 600], [L.cups[0].x + 6, L.cups[0].y - CUP_H - 26]] }]);
  run(8, 2, (L) => [
    { p: 0, pts: [[L.tanks[0].x - 40, 232], [1560, 420]] }, { p: 0, pts: [[1520, 640], [L.cups.find((c) => c.c === 0).x + 6, L.cups[0].y - CUP_H - 26]] },
    { p: 1, pts: [[L.tanks[1].x - 40, 232], [1740, 400]] }, { p: 1, pts: [[1700, 590], [L.cups.find((c) => c.c === 1).x + 6, L.cups[0].y - CUP_H - 56]] },
  ]);
}
if (!only || only.includes(10)) {
  run(9, 1, straight([[1540, 420], [2300, 440]]));
}
