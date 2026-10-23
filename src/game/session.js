// Spillway: deterministic lockstep. The host owns the clock and publishes input batches; every client runs the same World a few ticks behind.

import { World } from '../sim/world.js';

export const STEP = 1000 / 60;
const BATCH = 6;
const CHECK = 120;
const KEEP = 400;

export class Session {
  constructor({ level, cfg, chan, host, me, uid, ord, startAt, now, late }) {
    this.world = new World(level, cfg);
    this.chan = chan;
    this.host = host;
    this.me = me;
    this.uid = uid;
    this.ord = ord;
    this.startAt = startAt;
    this.now = now;
    this.acc = 0;
    this.lastT = 0;
    this.localId = 0;
    this.inbox = [];
    this.batch = [];
    this.consumed = [];
    this.seen = new Set();
    this.seq = 0;
    this.lastSeq = -1;
    this.frames = new Map();
    this.queue = new Map();
    this.checks = new Map();
    this.confirmed = 0;
    this.waitSnap = false;
    this.applied = [];
    this.lastFrameAt = now();
    this.ended = false;
    chan.onFrame((seq, f) => this.onFrame(seq, f));
    chan.onSnap((s) => this.onSnap(s));
    if (host) this.listenHost();
    if (late && !host) this.askSnap();
  }

  listenHost() {
    this.chan.onInput((key, v) => {
      if (this.seen.has(key) || !v || !v.e) return;
      this.seen.add(key);
      const e = v.e;
      if (e.t !== 'end') { e.p = this.ord.indexOf(v.u); if (e.p < 0) { this.consumed.push(key); return; } }
      this.inbox.push({ e, key });
    });
    this.chan.onReq((u) => {
      if (!this.host) return;
      this.flush();
      this.chan.writeSnap({ seq: this.seq - 1, t: this.world.tick, at: this.now(), s: JSON.stringify(this.world.snapshot()) });
      this.chan.clearReq(u);
    });
  }

  input(e) {
    e.u = this.uid;
    e.i = ++this.localId;
    if (this.host) { if (e.t !== 'end') e.p = this.me; this.inbox.push({ e }); }
    else this.chan.sendInput(e);
    return e.i;
  }

  update() {
    const t = this.now();
    if (t < this.startAt) { this.lastT = t; return; }
    if (!this.lastT) this.lastT = t;
    let dt = t - this.lastT;
    this.lastT = t;
    if (dt > 250) dt = 250;
    const w = this.world;
    if (this.host) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8 && !w.ended) { this.hostStep(); this.acc -= STEP; n++; }
      if (n === 8) this.acc = 0;
    } else {
      if (this.waitSnap) return;
      const lag = this.confirmed - w.tick;
      const speed = lag > 240 ? 4 : Math.max(0.6, Math.min(2.5, 1 + (lag - 10) * 0.05));
      this.acc += dt * speed;
      let n = 0;
      const cap = lag > 240 ? 30 : 8;
      while (this.acc >= STEP && w.tick < this.confirmed && n < cap && !this.waitSnap) { this.clientStep(); this.acc -= STEP; n++; }
      if (w.tick >= this.confirmed) this.acc = Math.min(this.acc, STEP);
    }
    if (w.ended) this.ended = true;
  }

  hostStep() {
    const w = this.world, tick = w.tick + 1;
    for (const it of this.inbox.splice(0)) {
      w.apply(it.e);
      this.batch.push([tick, it.e]);
      if (it.key) this.consumed.push(it.key);
      this.applied.push(it.e);
    }
    w.step();
    if (w.tick % BATCH === 0 || w.ended) this.flush();
  }

  flush() {
    const w = this.world;
    if (w.tick === this.confirmed && !this.batch.length && this.seq > 0) return;
    const f = { t: w.tick };
    if (this.batch.length) f.e = this.batch;
    if (w.tick % CHECK === 0) f.h = w.checksum();
    if (w.ended) f.end = 1;
    const prune = this.seq >= KEEP ? [this.seq - KEEP] : [];
    this.chan.writeFrame(this.seq, f, this.consumed, prune);
    this.seq++;
    this.batch = [];
    this.consumed = [];
    this.confirmed = w.tick;
    this.lastSeq = this.seq - 1;
  }

  onFrame(seq, f) {
    if (this.host || !f) return;
    this.lastFrameAt = this.now();
    if (seq <= this.lastSeq) return;
    this.frames.set(seq, f);
    if (this.waitSnap) return;
    this.drain();
  }

  drain() {
    while (this.frames.has(this.lastSeq + 1)) {
      const g = this.frames.get(++this.lastSeq);
      this.frames.delete(this.lastSeq);
      for (const [tick, e] of g.e || []) {
        if (tick <= this.world.tick) continue;
        if (!this.queue.has(tick)) this.queue.set(tick, []);
        this.queue.get(tick).push(e);
      }
      if (g.h) this.checks.set(g.t, g.h);
      if (g.t > this.confirmed) this.confirmed = g.t;
    }
    if (this.frames.size > 40 && !this.waitSnap) this.askSnap();
  }

  clientStep() {
    const w = this.world, tick = w.tick + 1;
    const evs = this.queue.get(tick);
    if (evs) {
      for (const e of evs) { w.apply(e); this.applied.push(e); }
      this.queue.delete(tick);
    }
    w.step();
    const h = this.checks.get(w.tick);
    if (h !== undefined) {
      this.checks.delete(w.tick);
      if (h !== w.checksum()) { console.warn('desync at', w.tick); this.askSnap(); }
    }
  }

  askSnap() {
    this.waitSnap = true;
    this.snapAskedAt = this.now();
    this.chan.requestSnap();
  }

  onSnap(s) {
    if (this.host || !this.waitSnap || !s || typeof s.s !== 'string') return;
    if (s.at && s.at < this.snapAskedAt - 1500) return;
    try { this.world.restore(JSON.parse(s.s)); } catch (err) { console.warn('snapshot', err); return; }
    this.lastSeq = s.seq;
    this.confirmed = s.t;
    for (const k of [...this.frames.keys()]) if (k <= s.seq) this.frames.delete(k);
    for (const k of [...this.queue.keys()]) if (k <= s.t) this.queue.delete(k);
    this.checks.clear();
    this.waitSnap = false;
    this.acc = 0;
    this.drain();
  }

  becomeHost() {
    if (this.host) return;
    if (this.waitSnap) return false;
    while (this.world.tick < this.confirmed) this.clientStep();
    this.host = true;
    this.seq = this.lastSeq + 1;
    this.batch = [];
    this.consumed = [];
    this.acc = 0;
    this.lastT = this.now();
    this.listenHost();
    return true;
  }

  takeApplied() { return this.applied.splice(0); }

  stalled() { return !this.host && this.now() - this.lastFrameAt > 2500 && this.now() > this.startAt + 2500; }

  destroy() { this.chan.close(); }
}
