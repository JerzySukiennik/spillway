import { Session } from '../../src/game/session.js';
import { LEVELS } from '../../src/sim/levels.js';

let T = 0;
const now = () => T;
const pending = [];
const deliver = (at, fn) => pending.push({ at, fn, seq: pending.length });
let rnd = 7;
const lat = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return 40 + (rnd % 160); };

const bus = { frames: new Map(), inputs: new Map(), snap: null, reqs: new Set(), subs: { frame: [], input: [], snap: [], req: [] } };
let inKey = 0;
function chanFor(uid) {
  let lastArrival = 0;
  const ordered = (fn) => { const at = Math.max(T + lat(), lastArrival + 1); lastArrival = at; deliver(at, fn); };
  const subs = [];
  const sub = (k, f) => { const s = { f, alive: true, uid }; bus.subs[k].push(s); subs.push(s); return s; };
  return {
    sendInput: (e) => { const k = 'k' + (++inKey); const v = JSON.parse(JSON.stringify({ u: uid, e })); ordered(() => { bus.inputs.set(k, v); for (const s of bus.subs.input) if (s.alive) s.f(k, v); }); },
    onInput: (cb) => { const s = sub('input', cb); for (const [k, v] of bus.inputs) deliver(T + lat(), () => s.alive && bus.inputs.has(k) && cb(k, v)); },
    writeFrame: (seq, f, consumed, prune) => { const v = JSON.parse(JSON.stringify(f)); ordered(() => { bus.frames.set(seq, v); for (const k of consumed) bus.inputs.delete(k); for (const p of prune) bus.frames.delete(p); for (const s of bus.subs.frame) if (s.alive) { const a = T + lat(); deliver(a, () => s.alive && s.f(seq, v)); } }); },
    onFrame: (cb) => { const s = sub('frame', cb); for (const [k, v] of [...bus.frames].sort((a, b) => a[0] - b[0])) deliver(T + lat(), () => s.alive && cb(k, v)); },
    writeSnap: (v) => ordered(() => { bus.snap = v; for (const s of bus.subs.snap) if (s.alive) deliver(T + lat(), () => s.alive && s.f(v)); }),
    onSnap: (cb) => { const s = sub('snap', cb); if (bus.snap) deliver(T + lat(), () => cb(bus.snap)); },
    requestSnap: () => ordered(() => { bus.reqs.add(uid); for (const s of bus.subs.req) if (s.alive) s.f(uid); }),
    onReq: (cb) => { sub('req', cb); },
    clearReq: (u) => bus.reqs.delete(u),
    close: () => subs.forEach((s) => { s.alive = false; }),
  };
}

const lv = LEVELS[3];
const ord = ['A', 'B', 'C'];
const cfg = { n: 3, seed: 11, up: { ink: 1, tank: 0, pump: 1 }, inv: [{ ice: 1 }, { funnel: 1 }, { magnet: 1 }] };
const mk = (uid, host, late) => new Session({ level: lv, cfg: JSON.parse(JSON.stringify(cfg)), chan: chanFor(uid), host, me: ord.indexOf(uid), uid, ord, startAt: 1000, now, late });
const S = { A: mk('A', true), B: mk('B', false), C: mk('C', false) };
const line = (x0, y0, x1, y1) => { const d = []; for (let i = 0; i <= 40; i++) d.push(Math.round((x0 + (x1 - x0) * i / 40) * 2), Math.round((y0 + (y1 - y0) * i / 40) * 2)); return d; };

const script = [
  [1100, 'A', { t: 'l', d: line(150, 240, 1250, 420) }],
  [1150, 'B', { t: 'l', d: line(380, 240, 1380, 420) }],
  [1200, 'C', { t: 'l', d: line(560, 240, 1700, 500) }],
  [1300, 'A', { t: 'p', on: true }], [1320, 'B', { t: 'p', on: true }], [1500, 'C', { t: 'p', on: true }],
  [4000, 'B', { t: 'i', k: 'funnel', x: 2600, y: 1200, a: 0 }],
  [6000, 'C', { t: 'u', k: 'magnet', x: 2800, y: 1300 }],
  [7000, 'A', { t: 'u', k: 'ice' }],
  [9000, 'B', { t: 'e', d: line(800, 300, 900, 340) }],
];
let corrupted = false, migrated = false;
for (T = 0; T < 60000; T += 16) {
  pending.sort((a, b) => a.at - b.at || a.seq - b.seq);
  while (pending.length && pending[0].at <= T) pending.shift().fn();
  for (const [at, who, e] of script) if (at > T - 16 && at <= T && S[who]) S[who].input({ ...e });
  for (const k of Object.keys(S)) S[k].update();
  if (!corrupted && S.C.world.tick > 500) { S.C.world.fluid.x[3] += 0.001; corrupted = true; console.log('corrupted C at', S.C.world.tick); }
  if (!migrated && T > 20000) {
    migrated = true;
    console.log('host A dies at tick', S.A.world.tick, 'B at', S.B.world.tick, 'C at', S.C.world.tick);
    S.A.destroy(); delete S.A;
    S.B.becomeHost();
  }
  if (Object.values(S).every((s) => s.world.ended)) break;
}
for (const [k, s] of Object.entries(S)) console.log(k, s.host ? 'host' : 'client', 'tick', s.world.tick, 'ended', s.world.ended, s.world.checksum(), 'got', s.world.got.join(','));
const sums = Object.values(S).map((s) => s.world.checksum());
console.log(sums.every((x) => x === sums[0]) ? 'ALL IN SYNC' : 'DESYNC');
{ const w = Object.values(S)[0].world, f = w.fluid; let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,v=0; for (let i=0;i<f.n;i++){minx=Math.min(minx,f.x[i]);maxx=Math.max(maxx,f.x[i]);miny=Math.min(miny,f.y[i]);maxy=Math.max(maxy,f.y[i]);v=Math.max(v,Math.hypot(f.vx[i],f.vy[i]));}
console.log('bbox',minx|0,maxx|0,miny|0,maxy|0,'maxv',v,'lines',w.lines.length,'mixer',w.mixer.store, w.mixer.queue, 'tanks', w.tanks.map(t=>t.left), 'emptyAt', w.emptyAt, 'calm', w.calm); }
