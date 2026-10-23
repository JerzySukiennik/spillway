// Spillway: level screen. Canvases, camera, marker/eraser/item input, HUD and live cursors around a lockstep Session.

import { Session } from './session.js';
import { WaterRenderer } from '../render/water.js';
import { Painter, VIEW_H } from '../render/painter.js';
import { STYLE, LOOK, PAL, INK, MONO } from '../style.js';
import { LEVELS } from '../sim/levels.js';
import { ERASE_R, LINE_R, RAINBOW, CUP_W, CUP_H } from '../sim/world.js';
import { SLOTS, ITEMS, POWERS } from './catalog.js';
import { icon } from '../ui/icons.js';
import { el, esc, toast, confirmBox } from '../ui/ui.js';
import { sfx, loop } from '../audio.js';
import { drawCursor, drawTrail } from './cursors.js';

const PT_GAP = 7;
const SEND_MS = 160;

export class LevelScreen {
  constructor(app, room, meta) {
    this.app = app;
    this.room = room;
    this.meta = meta;
    this.lvIndex = meta.lv;
    this.level = LEVELS[meta.lv % LEVELS.length];
    this.ord = meta.ord || [];
    this.me = this.ord.indexOf(room.me);
    const late = room.now() > meta.at + 2500;
    const cfg = { n: this.ord.length, seed: meta.seed, up: (meta.cfg && meta.cfg.up) || {}, inv: (meta.cfg && meta.cfg.inv) || [] };
    this.session = new Session({
      level: this.level, cfg, chan: room.run(meta.run), host: room.isHost && !late, me: this.me, uid: room.me, ord: this.ord,
      startAt: meta.at, now: () => room.now(), late,
    });
    this.world = this.session.world;
    this.painter = new Painter(STYLE);
    this.tool = 'marker';
    this.rot = 0;
    this.cam = -60;
    this.camV = 0;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, wx: 0, wy: 0, in: false };
    this.stroke = null;
    this.eraseBuf = null;
    this.pending = [];
    this.pendingUse = {};
    this.pumpDown = false;
    this.remote = new Map();
    this.lastCur = 0;
    this.curSent = '';
    this.finished = false;
    this.fxT = { got: 0, fall: 0, wrong: 0 };
    this.pour = loop('pour');
    this.drawLoop = loop('draw');
    this.build();
    this.bind();
    this.resize();
    this.intro();
  }

  build() {
    const lv = this.level;
    const spect = this.me < 0;
    this.root = el(`<div class="screen" id="level">
      <canvas class="layer bg"></canvas><canvas class="layer water"></canvas><canvas class="layer fg"></canvas>
      <div class="hud">
        <div class="tl"></div>
        <div class="tc">
          <div class="mini"><canvas></canvas></div>
          <div class="lvname">${this.lvIndex + 1} / ${LEVELS.length} · ${esc(lv.name)}</div>
        </div>
        ${lv.hint ? `<div class="hint">${icon('flag', 18)}<span>${esc(lv.hint)}</span><button title="Zamknij">${icon('x', 16)}</button></div>` : ''}
        <div class="tr"><div class="pill who"></div><div class="pill money">${icon('coin', 20)}<span class="v">0</span><span class="gain"></span></div></div>
        ${spect ? '<div class="bar spect">Oglądasz. Dołączysz w następnym poziomie.</div>' : `<div class="bar">${this.slotsHtml()}<div class="rot hidden"><span class="kbd">Q</span><span class="kbd">E</span> obrót · prawy klik anuluje</div></div>`}
        <div class="br">${spect ? '' : `<button class="btn end">${icon('flag', 18)} Zakończ</button>`}</div>
        <div class="bl"><div class="pill wait hidden">Czekam na hosta…</div></div>
      </div>
    </div>`);
    this.app.mount(this.root);
    const q = (s) => this.root.querySelector(s);
    this.cBg = q('canvas.bg'); this.cW = q('canvas.water'); this.cFg = q('canvas.fg');
    this.bgx = this.cBg.getContext('2d');
    this.fgx = this.cFg.getContext('2d');
    this.water = new WaterRenderer(this.cW);
    this.water.setPalette(PAL);
    this.miniC = q('.mini canvas');
    this.miniX = this.miniC.getContext('2d');
    this.moneyV = q('.money .v'); this.moneyG = q('.money .gain');
    this.whoEl = q('.who');
    this.waitEl = q('.wait');
    this.rotEl = q('.rot');
    const hint = q('.hint');
    if (hint) {
      hint.querySelector('button').onclick = () => hint.remove();
      setTimeout(() => { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 400); }, 16000);
    }
    const tl = q('.tl');
    this.pumps = this.ord.map((u, i) => {
      const mine = i === this.me;
      const name = (this.room.players[u] || {}).n || '?';
      const w = el(`<div class="pump" style="--c:${PAL[i]}"><div class="plunger ${mine ? '' : 'small'}"><div class="handle"><i class="bar"></i><i class="rod"></i></div><div class="box"></div></div><div class="water"><i></i></div><div class="nm">${mine ? 'SPACJA' : esc(name)}</div></div>`);
      if (mine) tl.prepend(w); else tl.append(w);
      return { el: w, pl: w.querySelector('.plunger'), bar: w.querySelector('.water i'), last: '' };
    });
    if (this.me >= 0) {
      const pl = this.pumps[this.me].pl;
      pl.addEventListener('pointerdown', (e) => { e.preventDefault(); pl.setPointerCapture(e.pointerId); this.pump(true); });
      pl.addEventListener('pointerup', () => this.pump(false));
      pl.addEventListener('pointercancel', () => this.pump(false));
      this.root.querySelectorAll('.slot').forEach((s) => { s.onclick = () => this.select(s.dataset.k); });
      q('.end').onclick = () => this.askEnd();
    }
    q('.mini').addEventListener('pointerdown', (e) => {
      const m = q('.mini');
      m.setPointerCapture(e.pointerId);
      const go = (ev) => { const r = this.miniC.getBoundingClientRect(); const k = this.miniK(); this.cam = ((ev.clientX - r.left) - this.miniOx) / k - this.visW() / 2; this.camV = 0; };
      go(e);
      m.onpointermove = (ev) => { if (ev.buttons) go(ev); };
    });
    this.refreshSlots(true);
  }

  slotsHtml() {
    let h = '';
    for (const s of SLOTS) {
      if (s.k === 'funnel' || s.k === 'ice') h += '<span class="sep"></span>';
      h += `<button class="slot" data-k="${s.k}">${icon(s.k === 'tramp' ? 'tramp' : s.k)}<span class="k">${s.key}</span>${s.k === 'marker' ? '<span class="ink"><i></i></span>' : s.k === 'eraser' ? '' : '<span class="n">0</span>'}<span class="tip">${esc(s.name)}${ITEMS[s.k] ? ' · ' + esc(ITEMS[s.k].desc) : POWERS[s.k] ? ' · ' + esc(POWERS[s.k].desc) : ''}</span></button>`;
    }
    return h;
  }

  bind() {
    const fg = this.cFg;
    this.on = [];
    const add = (t, ev, f, o) => { t.addEventListener(ev, f, o); this.on.push(() => t.removeEventListener(ev, f, o)); };
    add(window, 'resize', () => this.resize());
    add(fg, 'contextmenu', (e) => e.preventDefault());
    add(fg, 'pointerdown', (e) => this.down(e));
    add(fg, 'pointermove', (e) => this.move(e));
    add(fg, 'pointerup', (e) => this.up(e));
    add(fg, 'pointercancel', (e) => this.up(e));
    add(fg, 'pointerleave', () => { this.mouse.in = false; });
    add(fg, 'wheel', (e) => { e.preventDefault(); this.cam += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / this.scale; this.camV = 0; }, { passive: false });
    add(window, 'keydown', (e) => this.key(e, true));
    add(window, 'keyup', (e) => this.key(e, false));
    add(window, 'blur', () => { this.keys.clear(); this.pump(false); });
  }

  resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    for (const c of [this.cBg, this.cFg]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.water.resize(w, h, Math.min(devicePixelRatio || 1, 1.5));
    this.scale = h / VIEW_H;
    const r = this.miniC.getBoundingClientRect();
    this.miniC.width = Math.round(r.width * dpr); this.miniC.height = Math.round(r.height * dpr);
  }

  visW() { return this.cssW / this.scale; }
  miniK() { const r = this.miniC.getBoundingClientRect(); const k = Math.min(r.width / this.level.w, r.height / VIEW_H); this.miniOx = (r.width - this.level.w * k) / 2; return k; }

  intro() {
    const lv = this.level;
    const box = el(`<div class="panel intro"><div class="num">POZIOM ${this.lvIndex + 1}</div><div class="t">${esc(lv.name)}</div><div class="cd mono"></div></div>`);
    document.body.append(box);
    const cd = box.querySelector('.cd');
    const tick = () => {
      const left = this.meta.at - this.room.now();
      if (left > 0) { cd.textContent = `start za ${Math.ceil(left / 1000)}`; this.introT = setTimeout(tick, 100); }
      else { cd.textContent = 'start'; box.classList.add('out'); setTimeout(() => box.remove(), 400); }
    };
    tick();
    this.introBox = box;
  }

  toWorld(e) {
    const r = this.cFg.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    this.mouse.x = x; this.mouse.y = y;
    this.mouse.wx = this.cam + x / this.scale;
    this.mouse.wy = y / this.scale;
    this.mouse.in = true;
  }

  canAct() { return this.me >= 0 && !this.world.ended; }

  down(e) {
    this.toWorld(e);
    if (!this.canAct()) return;
    this.cFg.setPointerCapture(e.pointerId);
    const { wx, wy } = this.mouse;
    if (e.button === 2) {
      if (ITEMS[this.tool] || this.tool === 'magnet') { this.select('marker'); return; }
      this.eraseBuf = { pts: [[wx, wy]], last: performance.now(), btn: 2 };
      return;
    }
    if (e.button !== 0) return;
    if (this.tool === 'marker') {
      if (this.inkLeft() <= 1) { toast('Brak tuszu. Gumka oddaje połowę.'); return; }
      this.stroke = { pts: [[wx, wy]], sent: 0, last: performance.now() };
    } else if (this.tool === 'eraser') {
      this.eraseBuf = { pts: [[wx, wy]], last: performance.now(), btn: 0 };
    } else if (ITEMS[this.tool]) {
      if (this.count(this.tool) <= 0) { toast('Nie masz tego przedmiotu. Kupisz go w sklepie.'); return; }
      if (this.inNoDraw(wx, wy)) { toast('Tu nie wolno nic stawiać.'); return; }
      const id = this.session.input({ t: 'i', k: this.tool, x: Math.round(wx * 2), y: Math.round(wy * 2), a: this.rot });
      this.pending.push({ id, k: this.tool });
      sfx('place');
      if (this.count(this.tool) <= 0) this.select('marker');
    } else if (this.tool === 'magnet') {
      const id = this.session.input({ t: 'u', k: 'magnet', x: Math.round(wx * 2), y: Math.round(wy * 2) });
      this.pending.push({ id, k: 'magnet' });
      this.select('marker');
    }
  }

  move(e) {
    this.toWorld(e);
    const { wx, wy } = this.mouse;
    const s = this.stroke;
    if (s) {
      const [lx, ly] = s.pts[s.pts.length - 1];
      const d = Math.hypot(wx - lx, wy - ly);
      if (d >= PT_GAP) {
        const left = this.inkLeft() - this.strokeLen(s.pts.slice(s.sent));
        if (left <= 0) { this.flushStroke(); this.stroke = null; toast('Skończył się tusz.'); return; }
        const k = Math.min(1, left / d);
        s.pts.push([lx + (wx - lx) * k, ly + (wy - ly) * k]);
        if (s.pts.length - s.sent >= 12 || performance.now() - s.last > SEND_MS) this.flushStroke();
      }
    }
    const b = this.eraseBuf;
    if (b) {
      b.pts.push([wx, wy]);
      if (performance.now() - b.last > 90) this.flushErase();
    }
  }

  up(e) {
    if (this.stroke) { this.toWorld(e); this.flushStroke(); this.stroke = null; }
    if (this.eraseBuf) { this.flushErase(); this.eraseBuf = null; }
  }

  strokeLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }

  flushStroke() {
    const s = this.stroke;
    if (!s) return;
    s.last = performance.now();
    const pts = s.pts.slice(s.sent);
    if (pts.length < 2) return;
    const d = [];
    for (const [x, y] of pts) d.push(Math.round(x * 2), Math.round(y * 2));
    const id = this.session.input({ t: 'l', d });
    this.pending.push({ id, pts, len: this.strokeLen(pts) });
    s.sent = s.pts.length - 1;
  }

  flushErase() {
    const b = this.eraseBuf;
    if (!b || !b.pts.length) return;
    b.last = performance.now();
    const d = [];
    for (const [x, y] of b.pts) d.push(Math.round(x * 2), Math.round(y * 2));
    this.session.input({ t: 'e', d });
    sfx('erase', { vol: 0.6 });
    b.pts = [b.pts[b.pts.length - 1]];
  }

  inkLeft() {
    if (this.me < 0) return 0;
    let p = 0;
    for (const x of this.pending) if (x.len) p += x.len;
    return this.world.ink[this.me] - p;
  }

  count(k) {
    if (this.me < 0) return 0;
    const inv = this.world.inv[this.me] || {};
    let p = 0;
    for (const x of this.pending) if (x.k === k) p++;
    return (inv[k] || 0) - p;
  }

  inNoDraw(x, y) { return this.world.inNoDraw(x, y); }

  select(k) {
    if (this.me < 0) return;
    if (POWERS[k]) {
      if (this.count(k) <= 0) { toast(`Nie masz: ${POWERS[k].name}. Kupisz w sklepie.`); return; }
      if (k === 'ice' || k === 'refill') {
        const id = this.session.input({ t: 'u', k });
        this.pending.push({ id, k });
        sfx(k === 'ice' ? 'ice' : 'click');
        toast(k === 'ice' ? 'Lód! Woda stoi przez 4 sekundy.' : 'Tusz dolany.');
        return;
      }
    }
    if (ITEMS[k] && this.count(k) <= 0) { toast(`Nie masz: ${ITEMS[k].name}. Kupisz w sklepie.`); return; }
    this.tool = k;
    sfx('click', { vol: 0.5 });
    this.refreshSlots(true);
  }

  key(e, down) {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) { if (down) this.keys.add(k); else this.keys.delete(k); e.preventDefault(); return; }
    if (k === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.pump(down); return; }
    if (!down) return;
    const slot = SLOTS.find((s) => s.key === e.key);
    if (slot) { this.select(slot.k); return; }
    if (k === 'q') this.rot = (this.rot + 23) % 24;
    if (k === 'e') this.rot = (this.rot + 1) % 24;
    if (k === 'escape') this.select('marker');
  }

  pump(on) {
    if (!this.canAct() || on === this.pumpDown) return;
    this.pumpDown = on;
    this.session.input({ t: 'p', on });
    if (on) sfx('pump');
  }

  async askEnd() {
    const left = this.world.tanks.some((t) => t.left > 0);
    const ok = await confirmBox('Zakończyć poziom?', left ? 'W zbiornikach jest jeszcze woda. Przepadnie, a kasa naliczy się z tego, co już w kubkach.' : 'Woda, która jeszcze płynie, przepadnie.', 'Zakończ', 'Gramy dalej');
    if (ok) this.session.input({ t: 'end' });
  }

  refreshSlots(force) {
    if (this.me < 0) return;
    const sig = SLOTS.map((s) => (s.k === 'marker' || s.k === 'eraser' ? '' : this.count(s.k))).join(',') + this.tool + Math.round(this.inkLeft());
    if (!force && sig === this.slotSig) return;
    this.slotSig = sig;
    this.root.querySelectorAll('.slot').forEach((b) => {
      const k = b.dataset.k;
      b.classList.toggle('sel', k === this.tool);
      const n = b.querySelector('.n');
      if (n) { const c = this.count(k); n.textContent = c; b.classList.toggle('off', c <= 0); }
      if (k === 'marker') b.querySelector('.ink i').style.width = `${Math.max(0, Math.min(100, this.inkLeft() / this.world.inkMax * 100))}%`;
    });
    if (this.rotEl) this.rotEl.classList.toggle('hidden', !ITEMS[this.tool]);
    const cur = this.tool === 'marker' ? 'crosshair' : 'none';
    if (this.cFg.style.cursor !== cur) this.cFg.style.cursor = cur;
  }

  frame(now) {
    const S = this.session, W = this.world;
    S.update();
    for (const e of S.takeApplied()) {
      if (e.u === this.room.me) { const i = this.pending.findIndex((x) => x.id === e.i); if (i >= 0) this.pending.splice(i, 1); }
      else if (e.t === 'i') sfx('place', { vol: 0.5 });
    }
    if (this.pending.length && this.pending.length > 60) this.pending.splice(0, this.pending.length - 60);
    const fx = W.fx.splice(0);
    this.painter.pushFx(fx);
    for (const f of fx) {
      if (f.k === 'got' && now - this.fxT.got > 70) { this.fxT.got = now; sfx('drip', { rate: 0.85 + Math.random() * 0.4 }); }
      else if (f.k === 'fall' && now - this.fxT.fall > 160) { this.fxT.fall = now; sfx('lost', { vol: 0.6 }); }
      else if (f.k === 'wrong' && now - this.fxT.wrong > 300) { this.fxT.wrong = now; sfx('wrong', { vol: 0.5 }); }
      else if (f.k === 'mix') sfx('rainbow');
      else if (f.k === 'ice') sfx('ice');
    }
    const flowing = W.tanks.some((t) => t.on && t.left > 0);
    this.pour.set(flowing ? 1 : 0);
    this.drawLoop.set(this.stroke ? 1 : 0);

    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    const dir = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    const target = dir * 1500;
    this.camV += (target - this.camV) * Math.min(1, dt * (dir ? 6 : 10));
    this.cam += this.camV * dt;
    const vis = this.visW();
    const lo = -80, hi = this.level.w - vis + 80;
    this.cam = hi < lo ? (this.level.w - vis) / 2 : Math.max(lo, Math.min(hi, this.cam));
    if (this.mouse.in) this.mouse.wx = this.cam + this.mouse.x / this.scale;
    if (dir && this.stroke) this.move({ clientX: this.mouse.x + this.cFg.getBoundingClientRect().left, clientY: this.mouse.y + this.cFg.getBoundingClientRect().top });

    const t = now / 1000;
    this.painter.bg(this.bgx, W, this.cam, this.scale, this.dpr, this.cssW, this.cssH, t);
    this.water.render(W.fluid, this.cam, this.scale, t, LOOK);
    this.painter.front(this.fgx, W, this.cam, this.scale, this.dpr, this.cssW, this.cssH, t);
    this.overlay(t);
    this.hud(now);
    this.sendCursor(now);

    if (S.ended && S.host && !this.finished) {
      this.finished = true;
      const res = W.result();
      sfx('win');
      setTimeout(() => this.room.finishLevel(res, this.lvIndex + 1), 900);
    }
    if (S.ended && !this.endShown) {
      this.endShown = true;
      toast('Koniec poziomu!', 2000);
    }
  }

  overlay(t) {
    const ctx = this.fgx, s = this.scale, dpr = this.dpr, W = this.world;
    ctx.setTransform(dpr * s, 0, 0, dpr * s, -this.cam * s * dpr, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const ghost = (pts) => { if (pts.length < 2) return; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
    ctx.strokeStyle = 'rgba(26,26,26,0.4)'; ctx.lineWidth = LINE_R * 2; ctx.setLineDash([10, 9]);
    for (const p of this.pending) if (p.pts) ghost(p.pts);
    if (this.stroke) ghost(this.stroke.pts.slice(this.stroke.sent));
    ctx.setLineDash([]);

    if (this.me >= 0 && this.mouse.in && !this.world.ended) {
      const { wx, wy } = this.mouse;
      const bad = this.inNoDraw(wx, wy);
      if (this.tool === 'eraser' || this.eraseBuf) {
        ctx.strokeStyle = PAL[this.me]; ctx.lineWidth = LINE_R * 2;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        for (const L of W.lines) if (L.p === this.me) { ctx.moveTo(L.ax, L.ay); ctx.lineTo(L.bx, L.by); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = INK; ctx.lineWidth = 2 / s; ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(wx, wy, ERASE_R, 0, 7); ctx.fill(); ctx.stroke();
      } else if (ITEMS[this.tool]) {
        this.painter.item(ctx, { k: this.tool, x: wx, y: wy, a: this.rot, p: this.me }, t, false, true);
        if (bad) this.noSign(ctx, wx, wy, s);
      } else if (this.tool === 'magnet') {
        ctx.setLineDash([8, 8]); ctx.strokeStyle = INK; ctx.lineWidth = 2 / s;
        ctx.beginPath(); ctx.arc(wx, wy, 210, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(wx, wy, 6, 0, 7); ctx.fillStyle = INK; ctx.fill();
      } else if (bad) this.noSign(ctx, wx, wy, s);
    }

    for (const g of W.magnets) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5 / s; ctx.globalAlpha = 0.5;
      const ph = (t * 1.2) % 1;
      ctx.beginPath(); ctx.arc(g.x, g.y, 210 * (1 - ph), 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(g.x, g.y, 7, 0, 7); ctx.fillStyle = PAL[g.p] || INK; ctx.fill(); ctx.lineWidth = 2 / s; ctx.stroke();
    }

    const run = this.meta.run;
    const vis = this.visW();
    for (const [u, c] of Object.entries(this.room.cursors)) {
      if (!c || c.s !== run) { this.remote.delete(u); continue; }
      let r = this.remote.get(u);
      if (!r) { r = { x: c.x, y: c.y, trail: [] }; this.remote.set(u, r); }
      r.x += (c.x - r.x) * 0.35; r.y += (c.y - r.y) * 0.35;
      if (c.d === 1) { const l = r.trail[r.trail.length - 1]; if (!l || Math.hypot(l[0] - r.x, l[1] - r.y) > 5) r.trail.push([r.x, r.y]); if (r.trail.length > 120) r.trail.shift(); }
      else if (r.trail.length) r.trail.splice(0, Math.max(1, r.trail.length >> 3));
      const i = this.ord.indexOf(u), col = i >= 0 ? PAL[i] : '#8F8F88';
      const name = (this.room.players[u] || {}).n || '?';
      if (r.trail.length > 1) drawTrail(ctx, r.trail, col, s);
      if (r.x < this.cam || r.x > this.cam + vis) {
        const left = r.x < this.cam;
        const ex = left ? this.cam + 14 / s : this.cam + vis - 14 / s, ey = Math.max(120, Math.min(VIEW_H - 120, r.y));
        ctx.save(); ctx.translate(ex, ey); ctx.scale(1 / s, 1 / s);
        ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); if (left) { ctx.moveTo(-6, 0); ctx.lineTo(8, -9); ctx.lineTo(8, 9); } else { ctx.moveTo(6, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.font = `700 11px ${MONO}`; ctx.textAlign = left ? 'left' : 'right'; ctx.fillStyle = INK;
        ctx.fillText(name, left ? 12 : -12, 4);
        ctx.restore();
      } else drawCursor(ctx, r.x, r.y, col, name, 1 / s, c.k);
    }
  }

  noSign(ctx, x, y, s) {
    ctx.save(); ctx.translate(x + 14 / s, y + 14 / s); ctx.scale(1 / s, 1 / s);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-5.5, 5.5); ctx.lineTo(5.5, -5.5); ctx.stroke();
    ctx.restore();
  }

  hud(now) {
    const W = this.world;
    W.tanks.forEach((t, i) => {
      const P = this.pumps[i];
      if (!P) return;
      const down = i === this.me ? this.pumpDown : t.on;
      const sig = `${down}|${Math.round(t.left / t.total * 100)}|${t.left > 0}`;
      if (sig === P.last) return;
      P.last = sig;
      P.pl.classList.toggle('down', down);
      P.pl.classList.toggle('empty', t.left <= 0);
      P.bar.style.width = `${t.left / t.total * 100}%`;
    });
    const money = Math.round(this.room.econ.money || 0);
    const r = W.got;
    const gain = r[0] + r[1] + r[2] + r[3] + r[RAINBOW] * 2;
    const ms = `${money}|${gain}`;
    if (ms !== this.moneySig) { this.moneySig = ms; this.moneyV.textContent = money; this.moneyG.textContent = gain ? `+${gain}` : ''; }
    const ws = this.ord.map((u) => `${u}:${(this.room.players[u] || {}).on}`).join();
    if (ws !== this.whoSig) {
      this.whoSig = ws;
      this.whoEl.innerHTML = this.ord.map((u, i) => { const p = this.room.players[u] || {}; return `<span class="p ${p.on ? '' : 'off'}" style="--c:${PAL[i]}"><i></i>${esc(p.n || '?')}</span>`; }).join('') || '<span class="p">—</span>';
    }
    this.refreshSlots(false);
    this.waitEl.classList.toggle('hidden', !this.session.stalled() && !this.session.waitSnap);
    if (now - (this.miniT || 0) > 90) { this.miniT = now; this.drawMini(); }
  }

  drawMini() {
    const c = this.miniC, g = this.miniX, W = this.world, lv = this.level;
    const k = this.miniK() * this.dpr, ox = this.miniOx * this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(k, 0, 0, k, ox, 0);
    g.fillStyle = 'rgba(26,26,26,0.07)';
    for (const r of lv.nodraw || []) g.fillRect(r[0], Math.max(0, r[1]), r[2], r[3]);
    g.fillStyle = '#CFCFC8';
    for (const p of lv.rocks || []) { g.beginPath(); for (let i = 0; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.fill(); }
    g.strokeStyle = INK; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); for (const L of W.lines) { g.moveTo(L.ax, L.ay); g.lineTo(L.bx, L.by); } g.stroke();
    for (const t of W.tanks) { g.fillStyle = PAL[t.p]; g.fillRect(t.x - 32, t.y - 44, 64, 84); }
    for (const cu of W.cups) { g.fillStyle = cu.c === RAINBOW ? '#9B5BFF' : PAL[cu.c]; g.fillRect(cu.x - CUP_W / 2, cu.y - CUP_H, CUP_W, CUP_H); }
    if (W.mixer) { g.fillStyle = INK; g.fillRect(W.mixer.x - 46, W.mixer.y, 92, 56); }
    const f = W.fluid;
    for (let i = 0; i < f.n; i += 2) { g.fillStyle = f.col[i] === RAINBOW ? '#9B5BFF' : PAL[f.col[i]]; g.fillRect(f.x[i] - 8, f.y[i] - 8, 16, 16); }
    for (const [u, r] of this.remote) { const i = this.ord.indexOf(u); g.fillStyle = i >= 0 ? PAL[i] : '#888'; g.beginPath(); g.arc(r.x, r.y, 26, 0, 7); g.fill(); }
    g.strokeStyle = INK; g.lineWidth = 2.2 / k * this.dpr * 1.2;
    g.strokeRect(Math.max(0, this.cam), 14, Math.min(this.visW(), lv.w), VIEW_H - 28);
  }

  sendCursor(now) {
    if (!this.room.online || now - this.lastCur < 66 || !this.mouse.in) return;
    this.lastCur = now;
    const c = { x: Math.round(this.mouse.wx), y: Math.round(this.mouse.wy), d: this.stroke ? 1 : this.eraseBuf ? 2 : 0, k: this.tool, s: this.meta.run };
    const sig = `${c.x},${c.y},${c.d},${c.k}`;
    if (sig === this.curSent) return;
    this.curSent = sig;
    this.room.setCursor(c);
  }

  onMeta(meta) {
    if (meta.host === this.room.me && !this.session.host && meta.run === this.meta.run) {
      if (this.session.becomeHost() === false) setTimeout(() => this.onMeta(this.room.meta), 500);
    }
  }

  destroy() {
    this.on.forEach((f) => f());
    clearTimeout(this.introT);
    if (this.introBox) this.introBox.remove();
    this.session.destroy();
    this.pour.stop();
    this.drawLoop.stop();
    this.root.remove();
  }
}
