// Spillway: room state (players, shared money, phase, cursors) online over Firebase RTDB, or offline for solo play.

import { firebaseConfig } from './firebase-config.js';
import { START_MONEY } from '../game/catalog.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const ROOT = 'rooms';
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SOLO_KEY = 'spillway.solo';
export const MAX_PLAYERS = 4;

class Emitter {
  constructor() { this.ls = {}; }
  on(k, f) { (this.ls[k] ||= new Set()).add(f); return () => this.ls[k].delete(f); }
  emit(k, ...a) { for (const f of this.ls[k] || []) f(...a); }
}

const emptyEcon = () => ({ money: START_MONEY, up: { ink: 0, tank: 0, pump: 0 }, inv: {} });
const pad = (n) => String(n).padStart(7, '0');

function playerId() {
  let id = '';
  try { id = sessionStorage.getItem('spillway.uid') || ''; } catch {}
  if (!id) {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    id = 'p' + Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
    try { sessionStorage.setItem('spillway.uid', id); } catch {}
  }
  return id;
}

let fbP = null;
export function firebase() {
  fbP ||= (async () => {
    const [appM, M] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-database.js`)]);
    const app = appM.getApps().find((a) => a.name === 'spillway') || appM.initializeApp(firebaseConfig, 'spillway');
    const db = M.getDatabase(app);
    let offset = 0;
    M.onValue(M.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
    await M.get(M.ref(db, '.info/serverTimeOffset')).catch(() => {});
    return { M, db, uid: playerId(), now: () => Date.now() + offset };
  })();
  fbP.catch(() => { fbP = null; });
  return fbP;
}

export function sortedPlayers(players) {
  return Object.entries(players || {}).filter(([, p]) => p && p.on).sort((a, b) => (a[1].j || 0) - (b[1].j || 0) || (a[0] < b[0] ? -1 : 1));
}

export class OnlineRoom extends Emitter {
  static async create(name) {
    const F = await firebase();
    OnlineRoom.sweep(F);
    for (let tries = 0; tries < 8; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CH[Math.floor(Math.random() * CODE_CH.length)];
      const r = F.M.ref(F.db, `${ROOT}/${code}`);
      const s = await F.M.get(F.M.child(r, 'meta'));
      if (s.exists()) continue;
      await F.M.set(r, { meta: { host: F.uid, phase: 'shop', lv: 0, created: F.M.serverTimestamp(), beat: F.M.serverTimestamp() }, econ: emptyEcon() });
      const room = new OnlineRoom(F, code, name);
      await room.open();
      return room;
    }
    throw new Error('Nie udało się utworzyć pokoju, spróbuj jeszcze raz.');
  }

  static async join(code, name) {
    const F = await firebase();
    code = code.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(code)) throw new Error('Kod pokoju to 4 litery.');
    const s = await F.M.get(F.M.ref(F.db, `${ROOT}/${code}`));
    if (!s.exists() || !s.val().meta) throw new Error('Nie ma takiego pokoju.');
    const v = s.val();
    const on = sortedPlayers(v.players).filter(([u]) => u !== F.uid);
    if (on.length >= MAX_PLAYERS) throw new Error('Pokój jest pełny (4 osoby).');
    const room = new OnlineRoom(F, code, name);
    await room.open();
    return room;
  }

  static async sweep(F) {
    try {
      const q = F.M.query(F.M.ref(F.db, ROOT), F.M.orderByChild('meta/beat'), F.M.endAt(F.now() - 8 * 3600e3), F.M.limitToFirst(10));
      const s = await F.M.get(q);
      s.forEach((c) => { F.M.remove(c.ref).catch(() => {}); });
    } catch {}
  }

  constructor(F, code, name) {
    super();
    this.F = F; this.M = F.M; this.code = code; this.me = F.uid; this.name = name;
    this.online = true;
    this.meta = {}; this.players = {}; this.econ = emptyEcon(); this.cursors = {};
    this.unsub = [];
    this.base = `${ROOT}/${code}`;
  }

  ref(p) { return this.M.ref(this.F.db, p ? `${this.base}/${p}` : this.base); }
  now() { return this.F.now(); }
  get isHost() { return this.meta.host === this.me; }

  async open() {
    const M = this.M;
    const pRef = this.ref(`players/${this.me}`);
    const s = await M.get(pRef);
    await M.update(pRef, s.exists() && s.val().j ? { n: this.name, on: true } : { n: this.name, on: true, j: M.serverTimestamp() });
    const arm = () => {
      M.onDisconnect(this.ref(`players/${this.me}/on`)).set(false);
      M.onDisconnect(this.ref(`cur/${this.me}`)).remove();
    };
    arm();
    let first = true;
    this.unsub.push(M.onValue(M.ref(this.F.db, '.info/connected'), (c) => {
      if (c.val() === true) { if (!first) { M.update(pRef, { on: true, n: this.name }); arm(); } first = false; }
    }));
    await new Promise((res) => {
      let got = 0;
      const done = () => { if (++got === 3) res(); };
      let a = false, b = false, c = false;
      this.unsub.push(M.onValue(this.ref('meta'), (x) => { this.meta = x.val() || {}; this.emit('meta', this.meta); this.checkHost(); if (!a) { a = true; done(); } }));
      this.unsub.push(M.onValue(this.ref('players'), (x) => { this.players = x.val() || {}; this.emit('players', this.players); this.checkHost(); if (!b) { b = true; done(); } }));
      this.unsub.push(M.onValue(this.ref('econ'), (x) => { this.econ = { ...emptyEcon(), ...(x.val() || {}) }; this.econ.up = { ink: 0, tank: 0, pump: 0, ...(this.econ.up || {}) }; this.econ.inv ||= {}; this.emit('econ', this.econ); if (!c) { c = true; done(); } }));
    });
    const curRef = this.ref('cur');
    const upd = (x) => { if (x.key === this.me) return; this.cursors[x.key] = x.val(); this.emit('cursor', x.key, x.val()); };
    this.unsub.push(M.onChildAdded(curRef, upd), M.onChildChanged(curRef, upd), M.onChildRemoved(curRef, (x) => { delete this.cursors[x.key]; this.emit('cursor', x.key, null); }));
    this.beat = setInterval(() => { if (this.isHost) M.update(this.ref('meta'), { beat: M.serverTimestamp() }).catch(() => {}); }, 60000);
  }

  order() { return sortedPlayers(this.players).slice(0, MAX_PLAYERS).map(([u]) => u); }

  checkHost() {
    clearTimeout(this.hostT);
    const h = this.meta.host;
    if (h && this.players[h] && this.players[h].on) return;
    this.hostT = setTimeout(() => {
      const h2 = this.meta.host;
      if (h2 && this.players[h2] && this.players[h2].on) return;
      const cand = sortedPlayers(this.players)[0];
      if (!cand || cand[0] !== this.me) return;
      this.M.runTransaction(this.ref('meta/host'), (cur) => (cur === h2 || cur === null ? this.me : undefined)).catch(() => {});
    }, 1800);
  }

  handHost() {
    const other = sortedPlayers(this.players).find(([u]) => u !== this.me);
    if (other) return this.M.set(this.ref('meta/host'), other[0]);
    return null;
  }

  setCursor(c) { this.M.set(this.ref(`cur/${this.me}`), c).catch(() => {}); }

  async buy(kind, key, price) {
    const me = this.me;
    const r = await this.M.runTransaction(this.ref('econ'), (e) => {
      if (!e) return e;
      if ((e.money || 0) < price) return undefined;
      e.money -= price;
      if (kind === 'up') { e.up ||= {}; e.up[key] = (e.up[key] || 0) + 1; }
      else { e.inv ||= {}; e.inv[me] ||= {}; e.inv[me][key] = (e.inv[me][key] || 0) + 1; }
      return e;
    });
    return r.committed;
  }

  pressGo() { return this.M.set(this.ref('meta/go'), { by: this.me, at: this.M.serverTimestamp() }); }

  async startLevel(lv) {
    const ord = this.order();
    const e = this.econ;
    const cfg = { up: { ...e.up }, inv: ord.map((u) => ({ ...((e.inv || {})[u] || {}) })) };
    const run = this.M.push(this.ref('run')).key;
    await this.M.update(this.ref(), {
      'meta/phase': 'level', 'meta/lv': lv, 'meta/run': run, 'meta/seed': (Math.random() * 2 ** 31) | 0,
      'meta/ord': ord, 'meta/cfg': cfg, 'meta/at': this.now() + 1800, 'meta/go': null, run: null,
    });
  }

  async finishLevel(res, nextLv) {
    const ord = this.meta.ord || [];
    await this.M.runTransaction(this.ref('econ'), (e) => {
      if (!e) return e;
      e.money = (e.money || 0) + res.money;
      e.inv ||= {};
      ord.forEach((u, i) => { e.inv[u] = res.inv[i] || {}; });
      return e;
    });
    await this.M.update(this.ref(), {
      'meta/phase': 'shop', 'meta/lv': nextLv, 'meta/last': { lv: this.meta.lv, res, ord, names: ord.map((u) => (this.players[u] || {}).n || '?'), at: this.now() },
      'meta/run': null, 'meta/go': null, 'meta/at': null, run: null,
    });
  }

  run(id) {
    const M = this.M, base = `run/${id}`, un = [];
    return {
      sendInput: (e) => M.push(this.ref(`${base}/in`), { u: this.me, e }).catch(() => {}),
      onInput: (cb) => un.push(M.onChildAdded(this.ref(`${base}/in`), (s) => cb(s.key, s.val()))),
      writeFrame: (seq, f, consumed, prune) => {
        const up = { [`${base}/f/${pad(seq)}`]: f };
        for (const k of consumed) up[`${base}/in/${k}`] = null;
        for (const p of prune) up[`${base}/f/${pad(p)}`] = null;
        M.update(this.ref(), up).catch((err) => console.warn('frame', err));
      },
      onFrame: (cb) => un.push(M.onChildAdded(this.ref(`${base}/f`), (s) => cb(parseInt(s.key, 10), s.val()))),
      writeSnap: (v) => M.set(this.ref(`${base}/snap`), v).catch(() => {}),
      onSnap: (cb) => un.push(M.onValue(this.ref(`${base}/snap`), (s) => { if (s.exists()) cb(s.val()); })),
      requestSnap: () => M.set(this.ref(`${base}/req/${this.me}`), M.serverTimestamp()),
      onReq: (cb) => { const r = this.ref(`${base}/req`); un.push(M.onChildAdded(r, (s) => cb(s.key)), M.onChildChanged(r, (s) => cb(s.key))); },
      clearReq: (u) => M.remove(this.ref(`${base}/req/${u}`)).catch(() => {}),
      close: () => { un.forEach((f) => f()); un.length = 0; },
    };
  }

  leave() {
    clearInterval(this.beat);
    this.unsub.forEach((f) => f());
    this.M.update(this.ref(`players/${this.me}`), { on: false }).catch(() => {});
    this.M.remove(this.ref(`cur/${this.me}`)).catch(() => {});
    if (this.isHost) this.handHost();
  }
}

export class LocalRoom extends Emitter {
  constructor(name, fresh) {
    super();
    this.online = false;
    this.code = null;
    this.me = 'me';
    this.name = name;
    let save = null;
    try { save = fresh ? null : JSON.parse(localStorage.getItem(SOLO_KEY)); } catch {}
    this.players = { me: { n: name, j: 0, on: true } };
    this.econ = save && save.econ ? save.econ : emptyEcon();
    this.econ.inv ||= {};
    this.meta = { host: 'me', phase: 'shop', lv: save ? save.lv || 0 : 0 };
    this.cursors = {};
    this.save();
  }

  static hasSave() { try { return !!JSON.parse(localStorage.getItem(SOLO_KEY)); } catch { return false; } }
  save() { try { localStorage.setItem(SOLO_KEY, JSON.stringify({ lv: this.meta.lv, econ: this.econ })); } catch {} }
  now() { return Date.now(); }
  get isHost() { return true; }
  order() { return ['me']; }
  setCursor() {}

  async buy(kind, key, price) {
    const e = this.econ;
    if (e.money < price) return false;
    e.money -= price;
    if (kind === 'up') e.up[key] = (e.up[key] || 0) + 1;
    else { e.inv.me ||= {}; e.inv.me[key] = (e.inv.me[key] || 0) + 1; }
    this.save();
    this.emit('econ', e);
    return true;
  }

  pressGo() { this.meta.go = { by: 'me', at: Date.now() }; this.emit('meta', this.meta); }

  async startLevel(lv) {
    const e = this.econ;
    this.meta = { ...this.meta, phase: 'level', lv, run: 'solo' + Date.now(), seed: (Math.random() * 2 ** 31) | 0, ord: ['me'], cfg: { up: { ...e.up }, inv: [{ ...(e.inv.me || {}) }] }, at: Date.now() + 1800, go: null };
    this.emit('meta', this.meta);
  }

  async finishLevel(res, nextLv) {
    this.econ.money += res.money;
    this.econ.inv.me = res.inv[0] || {};
    this.meta = { host: 'me', phase: 'shop', lv: nextLv, last: { lv: this.meta.lv, res, ord: ['me'], names: [this.name], at: Date.now() } };
    this.save();
    this.emit('econ', this.econ);
    this.emit('meta', this.meta);
  }

  run() {
    const noop = () => {};
    return { sendInput: noop, onInput: noop, writeFrame: noop, onFrame: noop, writeSnap: noop, onSnap: noop, requestSnap: noop, onReq: noop, clearReq: noop, close: noop };
  }

  leave() {}
}
