import { Fluid, P } from '../../src/sim/fluid.js';

const seg = (ax, ay, bx, by, r = 3, o = {}) => ({ ax, ay, bx, by, r, ...o });
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

function box(N = 600, rate = 2) {
  const f = new Fluid(4000, 1000);
  f.setSegments([seg(100, 300, 100, 900), seg(100, 900, 300, 900), seg(300, 900, 300, 300)]);
  let emitted = 0, maxV = 0;
  for (let t = 0; t < 2600; t++) {
    if (emitted < N && t % rate === 0) { f.add(200 + (rnd() - 0.5) * 6, 120, 0, 3, 0); emitted++; }
    f.step();
  }
  let inBox = 0, top = 1e9, sumV = 0; for (let i = 0; i < f.n; i++) sumV += Math.hypot(f.vx[i], f.vy[i]);
  for (let i = 0; i < f.n; i++) {
    const v = Math.hypot(f.vx[i], f.vy[i]); maxV = Math.max(maxV, v);
    if (f.x[i] > 100 && f.x[i] < 300 && f.y[i] < 900) { inBox++; top = Math.min(top, f.y[i]); }
  }
  let nn = 0;
  for (let i = 0; i < f.n; i++) { let b = 1e9; for (let j = 0; j < f.n; j++) if (j !== i) { const d = Math.hypot(f.x[i] - f.x[j], f.y[i] - f.y[j]); if (d < b) b = d; } nn += b; }
  const h = 900 - 3 - 3 - top, inner = 200 - 6 - 6;
  console.log(`box: meanV=${(sumV/f.n).toFixed(3)} n=${f.n} inBox=${inBox} maxV=${maxV.toFixed(3)} fillH=${h.toFixed(1)} area/p=${(h * inner / inBox).toFixed(1)} meanNN=${(nn / f.n).toFixed(2)}`);
}

function slope() {
  const f = new Fluid(4000, 1200);
  f.setSegments([seg(100, 400, 700, 600, 4)]);
  let emitted = 0, killed = 0;
  for (let t = 0; t < 1400; t++) {
    if (emitted < 300 && t % 2 === 0) { f.add(150 + (rnd() - 0.5) * 6, 300, 0, 2, 0); emitted++; }
    f.step(() => killed++);
  }
  console.log(`slope: emitted=${emitted} killed=${killed} remaining=${f.n}`);
}

function tunnel() {
  const f = new Fluid(4000, 1000);
  f.setSegments([seg(100, 900, 900, 900, 4)]);
  let through = 0;
  for (let t = 0; t < 900; t++) {
    if (t < 400 && t % 2 === 0) f.add(150 + rnd() * 700, -350, (rnd() - 0.5) * 4, 9, 0);
    f.step();
  }
  for (let i = 0; i < f.n; i++) if (f.y[i] > 900 && f.x[i] > 100 && f.x[i] < 900) through++;
  console.log(`tunnel: through=${through} n=${f.n}`);
}

function perf() {
  const f = new Fluid(4000, 3000);
  f.setSegments([seg(100, 200, 100, 900), seg(100, 900, 1100, 900), seg(1100, 900, 1100, 200), seg(300, 500, 700, 600, 4), seg(800, 450, 500, 700, 4)]);
  let e = 0;
  for (let t = 0; t < 1500; t++) { if (e < 1500 && t % 1 === 0) { f.add(150 + rnd() * 900, 100, 0, 2, e & 3); e++; } f.step(); }
  const t0 = performance.now();
  for (let t = 0; t < 300; t++) f.step();
  const ms = (performance.now() - t0) / 300;
  let maxV = 0; for (let i = 0; i < f.n; i++) maxV = Math.max(maxV, Math.hypot(f.vx[i], f.vy[i]));
  console.log(`perf: n=${f.n} ${ms.toFixed(2)} ms/step maxV=${maxV.toFixed(3)}`);
}

function determinism() {
  const run = () => { seed = 7; const f = new Fluid(3000, 1200); f.setSegments([seg(100, 300, 100, 900), seg(100, 900, 600, 900), seg(600, 900, 600, 300), seg(200, 500, 500, 650, 4)]); for (let t = 0; t < 800; t++) { if (t % 2 === 0) f.add(150 + rnd() * 300, 100, 0, 2, t & 3); f.step(); } return f.checksum(); };
  const a = run(), b = run();
  console.log(`determinism: ${a === b ? 'OK' : 'MISMATCH'} ${a}`);
}

const arg = process.argv[2];
if (arg) Object.assign(P, JSON.parse(arg));
box(); slope(); tunnel(); perf(); determinism();
