// Spillway: deterministic level state (tanks, cups, mixer, marker lines, items, power-ups) driven by input events.

import { Fluid } from './fluid.js';

export const RAINBOW = 4;
export const CUP_W = 108;
export const CUP_H = 150;
export const DROP_AREA = 18;
export const LINE_R = 4;
export const ERASE_R = 16;
export const ICE_TICKS = 240;
export const MAGNET_TICKS = 300;
export const ITEM_KEYS = ['funnel', 'pipe', 'tramp', 'fan', 'lift'];
export const POWER_KEYS = ['ice', 'magnet', 'refill'];

export const COS24 = [], SIN24 = [];
{
  const r6 = Math.sqrt(6), r2 = Math.sqrt(2), r3 = Math.sqrt(3);
  const q = [1, (r6 + r2) / 4, r3 / 2, r2 / 2, 0.5, (r6 - r2) / 4, 0];
  for (let i = 0; i < 24; i++) {
    let c = q[i % 6], s = q[6 - (i % 6)];
    for (let r = 0; r < ((i / 6) | 0); r++) { const t = c; c = -s; s = t; }
    COS24.push(c); SIN24.push(s);
  }
}

export function rng(seed) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.get = () => a;
  f.set = (v) => { a = v >>> 0; };
  return f;
}

export function itemShape(k, x, y, a, f) {
  const c = COS24[a], s = SIN24[a];
  const P = (lx, ly) => [x + lx * c - ly * s, y + lx * s + ly * c];
  const seg = (l1, l2, r, o = {}) => { const [ax, ay] = P(...l1), [bx, by] = P(...l2); return { ax, ay, bx, by, r, fr: 0.01, ...o }; };
  const segs = [], zones = [];
  if (k === 'funnel') {
    segs.push(seg([-64, -46], [-13, 12], 4), seg([64, -46], [13, 12], 4));
  } else if (k === 'pipe') {
    segs.push(seg([-90, -17], [90, -17], 4), seg([-90, 17], [90, 17], 4));
  } else if (k === 'tramp') {
    segs.push(seg([-52, 0], [52, 0], 5, { re: 0.7, kick: 1.6, fr: 0 }));
  } else if (k === 'fan') {
    segs.push(seg([-14, -30], [-14, 30], 5));
    const [zx, zy] = P(150, 0);
    zones.push({ type: 0, x: zx, y: zy, ux: c, uy: s, vx: -s, vy: c, hl: 150, hw: 34, f: f || 0.13, damp: 0 });
  } else if (k === 'lift') {
    segs.push(seg([-150, -21], [150, -21], 4), seg([-150, 21], [150, 21], 4));
    zones.push({ type: 0, x, y, ux: c, uy: s, vx: -s, vy: c, hl: 150, hw: 18, f: 0.34, damp: 0.25 });
  }
  return { segs, zones };
}

function segRectHit(ax, ay, bx, by, r) {
  const [rx, ry, rw, rh] = r;
  const inside = (x, y) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
  if (inside(ax, ay) || inside(bx, by)) return true;
  const ed = [[rx, ry, rx + rw, ry], [rx + rw, ry, rx + rw, ry + rh], [rx + rw, ry + rh, rx, ry + rh], [rx, ry + rh, rx, ry]];
  for (const [cx, cy, dx, dy] of ed) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    if ((d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0)) return true;
  }
  return false;
}

function distSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
  let t = l2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - ax - ex * t, dy = py - ay - ey * t;
  return Math.sqrt(dx * dx + dy * dy);
}

export function layout(level, n) {
  const tanks = [];
  const [tx0, tx1, ty] = level.tanks;
  for (let i = 0; i < n; i++) tanks.push({ x: n === 1 ? (tx0 + tx1) / 2 : tx0 + (tx1 - tx0) * i / (n - 1), y: ty, p: i });
  const order = (level.order || [0, 1, 2, 3]).filter((c) => c < n);
  const [cx0, cx1, cy] = level.shelf;
  const cups = order.map((c, i) => ({ x: order.length === 1 ? (cx0 + cx1) / 2 : cx0 + (cx1 - cx0) * i / (order.length - 1), y: cy, c }));
  if (level.mixer && n > 1 && level.rainbowCup) cups.push({ x: level.rainbowCup[0], y: level.rainbowCup[1], c: RAINBOW });
  return { tanks, cups };
}

export class World {
  constructor(level, cfg) {
    const n = cfg.n, up = cfg.up || {};
    this.lv = level;
    this.n = n;
    this.tick = 0;
    this.fluid = new Fluid(3200, level.w + 200);
    this.rand = rng(cfg.seed || 1);
    const water = Math.round(level.water * (1 + 0.2 * (up.tank || 0)));
    this.rate = 0.8 * (1 + 0.3 * (up.pump || 0));
    this.inkMax = Math.round(level.ink * (1 + 0.25 * (up.ink || 0)));
    const L = layout(level, n);
    this.tanks = L.tanks.map((t) => ({ ...t, left: water, total: water, on: false, acc: 0 }));
    this.cups = L.cups.map((c) => ({ ...c, count: 0, wrong: 0, splash: 0 }));
    this.mixer = level.mixer ? { x: level.mixer[0], y: level.mixer[1], store: [0, 0, 0, 0], queue: 0, need: Array.from({ length: n }, (_, i) => i), pulse: 0 } : null;
    this.ink = new Array(n).fill(this.inkMax);
    this.inv = (cfg.inv || []).slice(0, n).map((o) => ({ ...o }));
    while (this.inv.length < n) this.inv.push({});
    this.lines = [];
    this.items = [];
    this.magnets = [];
    this.iceUntil = 0;
    this.nextId = 1;
    this.got = [0, 0, 0, 0, 0];
    this.lost = [0, 0, 0, 0, 0];
    this.wrong = 0;
    this.ended = false;
    this.emptyAt = -1;
    this.calm = 0;
    this.fx = [];
    this.rebuild();
  }

  rebuild() {
    const S = [], Z = [];
    const lv = this.lv;
    for (const poly of lv.rocks || []) {
      for (let i = 0; i < poly.length; i += 2) {
        const j = (i + 2) % poly.length;
        S.push({ ax: poly[i], ay: poly[i + 1], bx: poly[j], by: poly[j + 1], r: 2, fr: 0.02 });
      }
    }
    for (const w of lv.walls || []) S.push({ ax: w[0], ay: w[1], bx: w[2], by: w[3], r: w[4] || 5, fr: 0.02 });
    for (const t of this.tanks) {
      const poly = [t.x - 32, t.y - 44, t.x + 32, t.y - 44, t.x + 32, t.y + 40, t.x + 10, t.y + 40, t.x + 10, t.y + 52, t.x - 10, t.y + 52, t.x - 10, t.y + 40, t.x - 32, t.y + 40];
      for (let i = 0; i < poly.length; i += 2) { const j = (i + 2) % poly.length; S.push({ ax: poly[i], ay: poly[i + 1], bx: poly[j], by: poly[j + 1], r: 2 }); }
    }
    for (const c of this.cups) {
      const l = c.x - CUP_W / 2, r = c.x + CUP_W / 2, b = c.y, t = c.y - CUP_H;
      S.push({ ax: l, ay: t, bx: l, by: b, r: 4 }, { ax: l, ay: b, bx: r, by: b, r: 4 }, { ax: r, ay: b, bx: r, by: t, r: 4 });
    }
    const m = this.mixer;
    if (m) {
      S.push({ ax: m.x - 100, ay: m.y - 88, bx: m.x - 18, by: m.y - 4, r: 4, fr: 0.01 }, { ax: m.x + 100, ay: m.y - 88, bx: m.x + 18, by: m.y - 4, r: 4, fr: 0.01 });
      const poly = [m.x - 46, m.y, m.x + 46, m.y, m.x + 46, m.y + 56, m.x - 46, m.y + 56];
      for (let i = 0; i < 8; i += 2) { const j = (i + 2) % 8; S.push({ ax: poly[i], ay: poly[i + 1], bx: poly[j], by: poly[j + 1], r: 3 }); }
    }
    for (const it of lv.fixed || []) {
      const sh = itemShape(it.k, it.x, it.y, it.a, it.f);
      S.push(...sh.segs); Z.push(...sh.zones);
    }
    for (const L of this.lines) S.push({ ax: L.ax, ay: L.ay, bx: L.bx, by: L.by, r: LINE_R, fr: 0.006 });
    for (const it of this.items) {
      const sh = itemShape(it.k, it.x, it.y, it.a);
      S.push(...sh.segs); Z.push(...sh.zones);
    }
    for (const g of this.magnets) Z.push({ type: 1, x: g.x, y: g.y, r: 210, r2: 210 * 210, f: 0.42 });
    this.fluid.setSegments(S);
    this.fluid.zones = Z;
  }

  inNoDraw(x, y) {
    for (const r of this.lv.nodraw || []) if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return true;
    return false;
  }

  apply(e) {
    const p = e.p;
    if (e.t === 'end') { this.finish(); return; }
    if (p === undefined || p < 0 || p >= this.n) return;
    if (e.t === 'p') {
      this.tanks[p].on = !!e.on;
    } else if (e.t === 'l') {
      const d = e.d || [];
      let changed = false;
      for (let i = 2; i + 1 < d.length; i += 2) {
        if (this.ink[p] <= 0.5) break;
        const ax = d[i - 2] / 2, ay = d[i - 1] / 2;
        let bx = d[i] / 2, by = d[i + 1] / 2;
        let L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
        if (L < 0.5) continue;
        let blocked = false;
        for (const r of this.lv.nodraw || []) if (segRectHit(ax, ay, bx, by, r)) { blocked = true; break; }
        if (blocked) continue;
        if (L > this.ink[p]) { const k = this.ink[p] / L; bx = ax + (bx - ax) * k; by = ay + (by - ay) * k; L = this.ink[p]; }
        this.ink[p] -= L;
        this.lines.push({ ax, ay, bx, by, p, id: this.nextId++ });
        changed = true;
      }
      if (changed) this.rebuild();
    } else if (e.t === 'e') {
      const d = e.d || [];
      let changed = false;
      const keep = [];
      for (const L of this.lines) {
        let hit = false;
        if (L.p === p) for (let i = 0; i + 1 < d.length; i += 2) if (distSeg(d[i] / 2, d[i + 1] / 2, L.ax, L.ay, L.bx, L.by) < ERASE_R + LINE_R) { hit = true; break; }
        if (hit) {
          const len = Math.sqrt((L.bx - L.ax) * (L.bx - L.ax) + (L.by - L.ay) * (L.by - L.ay));
          this.ink[p] = Math.min(this.inkMax, this.ink[p] + len * 0.5);
          changed = true;
        } else keep.push(L);
      }
      this.lines = keep;
      const keepI = [];
      for (const it of this.items) {
        let hit = false;
        if (it.p === p) for (let i = 0; i + 1 < d.length; i += 2) { const dx = d[i] / 2 - it.x, dy = d[i + 1] / 2 - it.y; if (dx * dx + dy * dy < 40 * 40) { hit = true; break; } }
        if (hit) { this.inv[p][it.k] = (this.inv[p][it.k] || 0) + 1; changed = true; } else keepI.push(it);
      }
      this.items = keepI;
      if (changed) this.rebuild();
    } else if (e.t === 'i') {
      if (!ITEM_KEYS.includes(e.k) || !(this.inv[p][e.k] > 0)) return;
      const x = e.x / 2, y = e.y / 2, a = ((e.a | 0) % 24 + 24) % 24;
      if (this.inNoDraw(x, y) || x < 0 || x > this.lv.w || y < 0 || y > 1000) return;
      this.inv[p][e.k]--;
      this.items.push({ id: this.nextId++, k: e.k, p, x, y, a });
      this.rebuild();
    } else if (e.t === 'u') {
      if (!POWER_KEYS.includes(e.k) || !(this.inv[p][e.k] > 0)) return;
      this.inv[p][e.k]--;
      if (e.k === 'ice') {
        const f = this.fluid;
        for (let i = 0; i < f.n; i++) f.ice[i] = ICE_TICKS;
        this.iceUntil = this.tick + ICE_TICKS;
        this.fx.push({ k: 'ice', p });
      } else if (e.k === 'magnet') {
        this.magnets.push({ x: e.x / 2, y: e.y / 2, until: this.tick + MAGNET_TICKS, p });
        this.rebuild();
        this.fx.push({ k: 'magnet', x: e.x / 2, y: e.y / 2, p });
      } else if (e.k === 'refill') {
        this.ink[p] = Math.min(this.inkMax * 1.5, this.ink[p] + this.inkMax * 0.5);
        this.fx.push({ k: 'refill', p });
      }
    }
  }

  emit(x, y, vx, vy, c) {
    this.fluid.add(x, y, vx, vy, c);
  }

  step() {
    if (this.ended) return;
    this.tick++;
    const f = this.fluid, R = this.rand;
    for (const t of this.tanks) {
      if (t.on && t.left > 0) {
        t.acc += this.rate;
        while (t.acc >= 1 && t.left > 0) {
          this.emit(t.x + (R() - 0.5) * 6, t.y + 58, (R() - 0.5) * 0.3, 1.6, t.p);
          t.left--; t.acc -= 1;
        }
      } else t.acc = 0;
    }
    const m = this.mixer;
    if (m) {
      const need = m.need;
      if (need.length > 1) {
        let ok = true;
        for (const c of need) if (m.store[c] < 1) ok = false;
        if (ok) { for (const c of need) m.store[c]--; m.queue += need.length; if (!m.pulse) this.fx.push({ k: 'mix' }); m.pulse = 20; }
      } else if (m.store[need[0]] > 0) { m.queue += m.store[need[0]]; m.store[need[0]] = 0; }
      if (m.queue > 0 && (this.tick & 1) === 0) {
        this.emit(m.x + (R() - 0.5) * 6, m.y + 66, 0, 2, need.length > 1 ? RAINBOW : need[0]);
        m.queue--;
      }
      if (m.pulse > 0) m.pulse--;
    }
    if (this.magnets.length && this.magnets.some((g) => g.until <= this.tick)) {
      this.magnets = this.magnets.filter((g) => g.until > this.tick);
      this.rebuild();
    }
    f.step((i) => { this.lost[f.col[i]]++; this.fx.push({ k: 'fall', x: f.x[i], c: f.col[i] }); });
    this.absorb();
    this.checkEnd();
  }

  absorb() {
    const f = this.fluid, cups = this.cups, m = this.mixer;
    for (let i = f.n - 1; i >= 0; i--) {
      const x = f.x[i], y = f.y[i], c = f.col[i];
      let taken = false;
      for (const cup of cups) {
        if (x <= cup.x - CUP_W / 2 + 4 || x >= cup.x + CUP_W / 2 - 4 || y >= cup.y + 2 || y < cup.y - CUP_H) continue;
        const surf = cup.y - 4 - Math.min(CUP_H - 12, (cup.count + cup.wrong) * DROP_AREA / (CUP_W - 8));
        if (y < surf - 6) continue;
        if (c === cup.c) { cup.count++; this.got[c]++; this.fx.push({ k: 'got', x, y, c }); }
        else { cup.wrong++; this.wrong++; this.lost[c]++; this.fx.push({ k: 'wrong', x, y, c }); }
        cup.splash = 12;
        taken = true;
        break;
      }
      if (!taken && m && x > m.x - 22 && x < m.x + 22 && y > m.y - 16 && y < m.y + 4) {
        if (c < 4) m.store[c]++;
        else m.queue++;
        taken = true;
      }
      if (taken) f.remove(i);
    }
    for (const cup of cups) if (cup.splash > 0) cup.splash--;
  }

  checkEnd() {
    const empty = this.tanks.every((t) => t.left === 0) && (!this.mixer || this.mixer.queue === 0);
    if (!empty) { this.emptyAt = -1; this.calm = 0; return; }
    if (this.emptyAt < 0) this.emptyAt = this.tick;
    const f = this.fluid;
    let moving = 0;
    for (let i = 0; i < f.n; i++) if (f.vx[i] * f.vx[i] + f.vy[i] * f.vy[i] > 0.09) { moving++; break; }
    this.calm = moving || this.tick < this.iceUntil ? 0 : this.calm + 1;
    if (f.n === 0 || this.calm > 150 || this.tick - this.emptyAt > 2400) this.finish();
  }

  finish() {
    if (this.ended) return;
    const f = this.fluid;
    for (let i = 0; i < f.n; i++) this.lost[f.col[i]]++;
    if (this.mixer) for (let c = 0; c < 4; c++) this.lost[c] += this.mixer.store[c];
    this.ended = true;
  }

  result() {
    const normal = this.got[0] + this.got[1] + this.got[2] + this.got[3];
    const total = this.tanks.reduce((s, t) => s + t.total, 0);
    return { got: this.got.slice(), lost: this.lost.slice(), wrong: this.wrong, total, money: normal + this.got[RAINBOW] * 2, inv: this.inv.map((o) => ({ ...o })) };
  }

  checksum() {
    return this.tick + ':' + this.fluid.checksum() + ':' + this.tanks.map((t) => t.left).join(',') + ':' + this.got.join(',');
  }

  snapshot() {
    const f = this.fluid, n = f.n;
    const pack = (a) => Array.from(a.subarray(0, n));
    return {
      tick: this.tick, rand: this.rand.get(), nextId: this.nextId,
      fl: { n, x: pack(f.x), y: pack(f.y), px: pack(f.px), py: pack(f.py), vx: pack(f.vx), vy: pack(f.vy), c: pack(f.col), i: pack(f.ice) },
      tanks: this.tanks.map((t) => [t.left, t.on ? 1 : 0, t.acc]),
      cups: this.cups.map((c) => [c.count, c.wrong]),
      mixer: this.mixer ? [...this.mixer.store, this.mixer.queue] : null,
      ink: this.ink.slice(), inv: this.inv.map((o) => ({ ...o })),
      lines: this.lines.map((L) => [L.ax, L.ay, L.bx, L.by, L.p, L.id]),
      items: this.items.map((it) => [it.id, it.k, it.p, it.x, it.y, it.a]),
      magnets: this.magnets.map((g) => [g.x, g.y, g.until, g.p]),
      iceUntil: this.iceUntil, got: this.got.slice(), lost: this.lost.slice(), wrong: this.wrong,
      ended: this.ended, emptyAt: this.emptyAt, calm: this.calm,
    };
  }

  restore(s) {
    const f = this.fluid, F = s.fl;
    f.n = F.n;
    for (let i = 0; i < F.n; i++) {
      f.x[i] = F.x[i]; f.y[i] = F.y[i]; f.px[i] = F.px[i]; f.py[i] = F.py[i];
      f.vx[i] = F.vx[i]; f.vy[i] = F.vy[i]; f.col[i] = F.c[i]; f.ice[i] = F.i[i];
    }
    this.tick = s.tick; this.rand.set(s.rand); this.nextId = s.nextId;
    s.tanks.forEach((t, i) => { this.tanks[i].left = t[0]; this.tanks[i].on = !!t[1]; this.tanks[i].acc = t[2]; });
    s.cups.forEach((c, i) => { this.cups[i].count = c[0]; this.cups[i].wrong = c[1]; });
    if (this.mixer && s.mixer) { this.mixer.store = s.mixer.slice(0, 4); this.mixer.queue = s.mixer[4]; }
    this.ink = s.ink.slice(); this.inv = s.inv.map((o) => ({ ...o }));
    this.lines = s.lines.map((L) => ({ ax: L[0], ay: L[1], bx: L[2], by: L[3], p: L[4], id: L[5] }));
    this.items = s.items.map((it) => ({ id: it[0], k: it[1], p: it[2], x: it[3], y: it[4], a: it[5] }));
    this.magnets = s.magnets.map((g) => ({ x: g[0], y: g[1], until: g[2], p: g[3] }));
    this.iceUntil = s.iceUntil; this.got = s.got.slice(); this.lost = s.lost.slice(); this.wrong = s.wrong;
    this.ended = s.ended; this.emptyAt = s.emptyAt; this.calm = s.calm;
    this.rebuild();
  }
}
