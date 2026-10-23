// Spillway: the shop "level" — a side-scrolling lobby with stalls, the room card and a Continue button at the far end.

import { ITEMS, POWERS, UPGRADES, UP_MAX, upPrice } from './catalog.js';
import { LEVELS } from '../sim/levels.js';
import { layout, CUP_W, CUP_H, RAINBOW } from '../sim/world.js';
import { sortedPlayers, MAX_PLAYERS } from '../net/room.js';
import { PAL, INK, PAPER } from '../style.js';
import { icon } from '../ui/icons.js';
import { el, esc, toast, modal } from '../ui/ui.js';
import { sfx } from '../audio.js';

const H = 1000;
const TOP = 300;
const STALL = 280;
const X_ITEMS = 1340, X_POWERS = X_ITEMS + 5 * STALL + 80, X_UPS = X_POWERS + 3 * STALL + 80, X_GO = X_UPS + 3 * STALL + 100;
const WIDTH = X_GO + 560;

export class ShopScreen {
  constructor(app, room) {
    this.app = app;
    this.room = room;
    this.cam = 0;
    this.camV = 0;
    this.keys = new Set();
    this.mouse = null;
    this.lastCur = 0;
    this.curEls = new Map();
    this.build();
    this.bind();
    this.resize();
    this.render();
    this.showResults();
  }

  build() {
    const r = this.room;
    const stall = (kind, k, d) => `<div class="panel stall" data-kind="${kind}" data-k="${k}" style="left:${d.x}px;top:${TOP}px">
      <div class="art">${icon(k, 58)}</div><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p>
      <div class="own"><span class="lbl">${kind === 'up' ? 'Poziom' : 'Masz'}</span><span class="cnt"></span></div>
      <button class="btn buy"></button></div>`;
    let stalls = '';
    Object.entries(ITEMS).forEach(([k, d], i) => { stalls += stall('item', k, { ...d, x: X_ITEMS + i * STALL }); });
    Object.entries(POWERS).forEach(([k, d], i) => { stalls += stall('power', k, { ...d, x: X_POWERS + i * STALL }); });
    Object.entries(UPGRADES).forEach(([k, d], i) => { stalls += stall('up', k, { ...d, x: X_UPS + i * STALL }); });
    const roomCard = r.online
      ? `<div class="lbl">Pokój · wyślij kod znajomym</div><div class="code">${r.code.split('').map((c) => `<b>${c}</b>`).join('')}</div>
         <button class="btn copy">${icon('copy', 18)} Skopiuj link</button><div class="plist"></div>`
      : `<div class="lbl">Gra solo</div><h2 class="mono" style="font-size:26px;margin:10px 0 6px">${esc(r.name)}</h2><p style="color:var(--sub);font-size:14px;line-height:1.45">Postęp zapisuje się na tym komputerze. Żeby grać ze znajomymi, wróć do menu i stwórz pokój.</p><div class="plist"></div>`;
    this.root = el(`<div class="screen" id="shop">
      <canvas class="layer bg"></canvas>
      <div class="strip" style="width:${WIDTH}px;height:${H}px">
        <div class="floor" style="top:${TOP + 400}px;width:${WIDTH}px"></div>
        <div class="panel room-card" style="left:80px;top:${TOP - 40}px">${roomCard}</div>
        <div class="panel next-card" style="left:${80 + 560 + 60}px;top:${TOP - 40}px"><div class="lbl">Następny poziom</div><h2 class="mono nx-t" style="font-size:26px;margin-top:8px"></h2><canvas></canvas><p class="nx-h" style="color:var(--sub);font-size:14px;line-height:1.45"></p></div>
        <div class="sec" style="left:${X_ITEMS}px;top:${TOP}px"><span class="lbl">Przedmioty · kupujesz dla siebie, stawiasz w poziomie</span></div>
        <div class="sec" style="left:${X_POWERS}px;top:${TOP}px"><span class="lbl">Power-upy · jednorazowe</span></div>
        <div class="sec" style="left:${X_UPS}px;top:${TOP}px"><span class="lbl">Ulepszenia drużyny · na stałe</span></div>
        ${stalls}
        <div class="panel go" style="left:${X_GO}px;top:${TOP - 10}px"><div class="lbl" style="margin-bottom:14px">Koniec sklepu</div><button class="btn dark go-btn">KONTYNUUJ ${icon('arrow', 34)}</button><p class="go-p"></p></div>
        <div class="curs"></div>
      </div>
      <div class="shop-hud">
        <div class="tl"><div class="pill"><span class="lbl" style="color:var(--ink)">Sklep</span>${r.online ? `<span class="mono">· ${r.code}</span>` : ''}</div><button class="pill menu-btn">Menu</button></div>
        <div class="tr"><div class="pill who"></div><div class="pill money">${icon('coin', 20)}<span class="v">0</span></div></div>
        <div class="bc"><span class="kbd">A</span><div class="track"><i></i></div><span class="kbd">D</span></div>
      </div>
    </div>`);
    this.app.mount(this.root);
    const q = (s) => this.root.querySelector(s);
    this.strip = q('.strip');
    this.bgC = q('canvas.bg');
    this.bgx = this.bgC.getContext('2d');
    this.trackI = q('.track i');
    this.curLayer = q('.curs');
    q('.go-btn').onclick = () => { sfx('click'); this.room.pressGo(); q('.go-btn').disabled = true; setTimeout(() => { const b = this.root.querySelector('.go-btn'); if (b) b.disabled = false; }, 5000); };
    q('.menu-btn').onclick = () => this.app.toMenu();
    const copy = q('.copy');
    if (copy) copy.onclick = () => { const u = `${location.origin}${location.pathname}?r=${this.room.code}`; navigator.clipboard.writeText(u).then(() => toast('Link skopiowany.')).catch(() => toast(u, 4000)); };
    this.root.querySelectorAll('.stall .buy').forEach((b) => {
      const st = b.closest('.stall');
      b.onclick = async () => {
        const kind = st.dataset.kind, k = st.dataset.k;
        const price = this.price(kind, k);
        if (price == null) return;
        if ((this.room.econ.money || 0) < price) { toast('Za mało kasy.'); sfx('wrong', { vol: 0.5 }); return; }
        b.disabled = true;
        const ok = await this.room.buy(kind === 'up' ? 'up' : 'inv', k, price);
        b.disabled = false;
        if (ok) { sfx('buy'); st.classList.remove('flash'); void st.offsetWidth; st.classList.add('flash'); }
        else toast('Ktoś był szybszy, za mało kasy.');
        this.render();
      };
    });
    q('.track').addEventListener('pointerdown', (e) => {
      const t = q('.track');
      const go = (ev) => { const rr = t.getBoundingClientRect(); this.cam = (ev.clientX - rr.left) / rr.width * WIDTH - this.visW() / 2; this.camV = 0; };
      t.setPointerCapture(e.pointerId); go(e);
      t.onpointermove = (ev) => { if (ev.buttons) go(ev); };
    });
    this.drawNext();
  }

  price(kind, k) {
    if (kind === 'item') return ITEMS[k].price;
    if (kind === 'power') return POWERS[k].price;
    const l = (this.room.econ.up || {})[k] || 0;
    return l >= UP_MAX ? null : upPrice(k, l);
  }

  bind() {
    this.on = [];
    const add = (t, ev, f, o) => { t.addEventListener(ev, f, o); this.on.push(() => t.removeEventListener(ev, f, o)); };
    add(window, 'resize', () => this.resize());
    add(window, 'keydown', (e) => { const k = e.key.toLowerCase(); if (['a', 'd', 'arrowleft', 'arrowright'].includes(k)) { this.keys.add(k); e.preventDefault(); } });
    add(window, 'keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    add(window, 'blur', () => this.keys.clear());
    add(this.root, 'wheel', (e) => { e.preventDefault(); this.cam += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / this.scale; this.camV = 0; }, { passive: false });
    add(this.root, 'pointermove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; });
    add(this.root, 'pointerleave', () => { this.mouse = null; });
    this.un = [this.room.on('econ', () => this.render()), this.room.on('players', () => this.render()), this.room.on('meta', () => this.render())];
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.cssW = innerWidth; this.cssH = innerHeight; this.dpr = dpr;
    this.scale = this.cssH / H;
    this.bgC.width = Math.round(this.cssW * dpr); this.bgC.height = Math.round(this.cssH * dpr);
  }

  visW() { return this.cssW / this.scale; }

  render() {
    const r = this.room, e = r.econ, me = r.me;
    const q = (s) => this.root.querySelector(s);
    q('.money .v').textContent = Math.round(e.money || 0);
    const players = sortedPlayers(r.players);
    q('.who').innerHTML = players.slice(0, MAX_PLAYERS).map(([u, p], i) => `<span class="p" style="--c:${PAL[i]}"><i></i>${esc(p.n)}</span>`).join('');
    const pl = q('.plist');
    if (pl) {
      let h = players.slice(0, MAX_PLAYERS).map(([u, p], i) => `<div class="pl" style="--c:${PAL[i]}"><i></i>${esc(p.n)}${u === me ? ' (ty)' : ''}<span class="tagx">${u === r.meta.host ? 'HOST' : ''}</span></div>`).join('');
      if (r.online) for (let i = players.length; i < MAX_PLAYERS; i++) h += '<div class="pl empty">wolne miejsce</div>';
      pl.innerHTML = h;
    }
    const inv = (e.inv || {})[me] || {};
    this.root.querySelectorAll('.stall').forEach((st) => {
      const kind = st.dataset.kind, k = st.dataset.k;
      const b = st.querySelector('.buy'), cnt = st.querySelector('.cnt');
      const price = this.price(kind, k);
      if (kind === 'up') {
        const l = (e.up || {})[k] || 0;
        cnt.innerHTML = `<span class="pips">${Array.from({ length: UP_MAX }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</span>`;
      } else cnt.textContent = inv[k] || 0;
      b.innerHTML = price == null ? 'MAX' : `KUP · <span class="mono">${price}</span>`;
      b.disabled = price == null || (e.money || 0) < price;
    });
    const lv = r.meta.lv || 0;
    const L = LEVELS[lv % LEVELS.length];
    q('.nx-t').textContent = `${lv % LEVELS.length + 1}. ${L.name}${lv >= LEVELS.length ? ` · runda ${Math.floor(lv / LEVELS.length) + 1}` : ''}`;
    q('.nx-h').textContent = L.hint || '';
    const goP = q('.go-p');
    goP.textContent = r.online ? `Każdy może kliknąć. Startuje cały pokój (${Math.min(players.length, MAX_PLAYERS)} ${players.length === 1 ? 'osoba' : 'osoby'}).` : 'Startujesz następny poziom.';
    if (this.nextLv !== lv) { this.nextLv = lv; this.drawNext(); }
  }

  drawNext() {
    const c = this.root.querySelector('.next-card canvas');
    if (!c) return;
    const lv = LEVELS[(this.room.meta.lv || 0) % LEVELS.length];
    const n = Math.max(1, Math.min(MAX_PLAYERS, sortedPlayers(this.room.players).length));
    const w = 460 * 2, h = 150 * 2;
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const k = Math.min(w / lv.w, h / 1000), ox = (w - lv.w * k) / 2;
    g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, ox, 0);
    g.fillStyle = 'rgba(26,26,26,0.08)';
    for (const r of lv.nodraw || []) g.fillRect(r[0], Math.max(0, r[1]), r[2], r[3]);
    g.fillStyle = '#D6D6CF'; g.strokeStyle = INK; g.lineWidth = 2 / k;
    for (const p of lv.rocks || []) { g.beginPath(); for (let i = 0; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill(); g.stroke(); }
    const Lo = layout(lv, n);
    for (const t of Lo.tanks) { g.fillStyle = PAL[t.p]; g.fillRect(t.x - 32, t.y - 44, 64, 84); g.strokeRect(t.x - 32, t.y - 44, 64, 84); }
    for (const cu of Lo.cups) { g.fillStyle = cu.c === RAINBOW ? '#9B5BFF' : PAL[cu.c]; g.fillRect(cu.x - CUP_W / 2, cu.y - CUP_H, CUP_W, CUP_H); g.strokeRect(cu.x - CUP_W / 2, cu.y - CUP_H, CUP_W, CUP_H); }
    if (lv.mixer) { g.fillStyle = INK; g.fillRect(lv.mixer[0] - 46, lv.mixer[1], 92, 56); }
  }

  showResults() {
    const last = this.room.meta.last;
    if (!last || !last.res) return;
    const key = `spillway.seen.${this.room.code || 'solo'}`;
    let seen = 0;
    try { seen = +sessionStorage.getItem(key) || 0; } catch {}
    if (seen >= last.at) return;
    try { sessionStorage.setItem(key, last.at); } catch {}
    const res = last.res, n = (last.ord || []).length || 1;
    const per = res.total / n;
    let pct = 0;
    const rows = (last.ord || []).map((u, i) => {
      const p = per ? Math.round(res.got[i] / per * 100) : 0;
      return `<div class="res-row" style="--c:${PAL[i]}"><i></i><span>${esc(last.names[i] || '?')}</span><span class="meter"><b style="width:${Math.min(100, p)}%"></b></span><span class="pc">${p}%</span></div>`;
    }).join('');
    const delivered = res.got[0] + res.got[1] + res.got[2] + res.got[3] + res.got[RAINBOW];
    pct = res.total ? delivered / res.total : 0;
    const stars = pct >= 0.85 ? 3 : pct >= 0.6 ? 2 : pct >= 0.3 ? 1 : 0;
    const rain = res.got[RAINBOW] ? `<div class="res-row rain"><i></i><span>Tęcza ×2</span><span class="meter"><b style="width:${Math.min(100, res.got[RAINBOW] / res.total * 100)}%"></b></span><span class="pc">${res.got[RAINBOW]}</span></div>` : '';
    const L = LEVELS[last.lv % LEVELS.length];
    const m = modal(`<div class="lbl">Poziom ${last.lv % LEVELS.length + 1} zaliczony</div><h2 style="margin-top:6px">${esc(L.name)}</h2>
      <div class="stars">${[0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'off'}">★</span>`).join('')}</div>
      <div class="res-rows">${rows}${rain}</div>
      <div class="res-total"><span class="lbl">Dowiezione ${Math.round(pct * 100)}% wody${res.wrong ? ` · ${res.wrong} kropli w złym kubku` : ''}</span><span class="money">+${res.money}</span></div>
      <div class="acts"><button class="btn dark ok">Do sklepu ${icon('arrow', 18)}</button></div>`);
    m.q('.ok').onclick = () => m.close();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    const dir = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    this.camV += (dir * 1700 - this.camV) * Math.min(1, dt * (dir ? 6 : 10));
    this.cam += this.camV * dt;
    const vis = this.visW();
    this.cam = Math.max(-40, Math.min(WIDTH - vis + 40, this.cam));
    if (WIDTH < vis) this.cam = (WIDTH - vis) / 2;
    this.strip.style.transform = `translate3d(${(-this.cam * this.scale).toFixed(2)}px,0,0) scale(${this.scale})`;
    this.trackI.style.left = `${Math.max(0, this.cam / WIDTH * 100)}%`;
    this.trackI.style.width = `${Math.min(100, vis / WIDTH * 100)}%`;
    const g = this.bgx, d = this.dpr, sc = this.scale;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = PAPER; g.fillRect(0, 0, this.cssW, this.cssH);
    g.fillStyle = '#D6D6CF';
    const st = 40 * sc, ox = -((this.cam * sc) % st);
    for (let x = ox; x < this.cssW; x += st) for (let y = st / 2; y < this.cssH; y += st) g.fillRect(x, y, 1.6, 1.6);
    this.cursors();
    if (this.room.online && this.mouse && now - this.lastCur > 66) {
      this.lastCur = now;
      const c = { x: Math.round(this.cam + this.mouse.x / sc), y: Math.round(this.mouse.y / sc), d: 0, k: 'shop', s: 'shop' };
      const sig = `${c.x},${c.y}`;
      if (sig !== this.curSig) { this.curSig = sig; this.room.setCursor(c); }
    }
  }

  cursors() {
    const r = this.room, order = sortedPlayers(r.players).map(([u]) => u);
    const live = new Set();
    for (const [u, c] of Object.entries(r.cursors)) {
      if (!c || c.s !== 'shop') continue;
      live.add(u);
      let e = this.curEls.get(u);
      const i = order.indexOf(u), col = i >= 0 && i < 4 ? PAL[i] : '#8F8F88';
      if (!e) {
        e = { el: el(`<div class="cursor" style="--c:${col}"><svg width="22" height="26" viewBox="0 0 22 26"><path d="M2 2v18l4.8-4.4 3.6 7.4 2.8-1.2-3.5-7.2h6.1z" fill="${col}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="nm"></span></div>`), x: c.x, y: c.y };
        this.curLayer.append(e.el);
        this.curEls.set(u, e);
      }
      e.el.querySelector('.nm').textContent = (r.players[u] || {}).n || '?';
      e.x += (c.x - e.x) * 0.35; e.y += (c.y - e.y) * 0.35;
      e.el.style.transform = `translate(${e.x}px,${e.y}px) scale(${1 / this.scale})`;
      e.el.style.transformOrigin = '0 0';
    }
    for (const [u, e] of this.curEls) if (!live.has(u)) { e.el.remove(); this.curEls.delete(u); }
  }

  destroy() {
    this.on.forEach((f) => f());
    this.un.forEach((f) => f());
    this.root.remove();
  }
}
