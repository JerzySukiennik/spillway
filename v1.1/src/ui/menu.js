// Spillway: main menu with a live water scene behind the card.

import { World } from '../sim/world.js';
import { WaterRenderer } from '../render/water.js';
import { Painter, VIEW_H } from '../render/painter.js';
import { STYLE, LOOK, PAL } from '../style.js';
import { OnlineRoom, LocalRoom } from '../net/room.js';
import { icon } from './icons.js';
import { el, esc } from './ui.js';
import { isMuted, setMuted, sfx } from '../audio.js';

const DEMO = {
  name: 'menu', w: 1700, water: 99999, ink: 9999,
  tanks: [150, 1150, 150], shelf: [1280, 1460, 820], order: [1, 3],
  mixer: [740, 500], rainbowCup: [1090, 840],
  rocks: [[1020, 846, 1560, 846, 1590, 910, 1540, 1012, 1040, 1012, 990, 910], [330, 880, 410, 820, 500, 812, 590, 860, 610, 920, 550, 960, 370, 955]],
  nodraw: [[260, 600, 260, 150]],
};

export class Menu {
  constructor(app) {
    this.app = app;
    let name = '';
    try { name = localStorage.getItem('spillway.name') || ''; } catch {}
    if (!name) name = `Gracz ${10 + Math.floor(Math.random() * 90)}`;
    const code = (new URLSearchParams(location.search).get('r') || '').toUpperCase().slice(0, 4);
    const hasSave = LocalRoom.hasSave();
    this.root = el(`<div class="screen" id="menu">
      <canvas class="layer bg"></canvas><canvas class="layer water"></canvas><canvas class="layer fg"></canvas>
      <div class="panel card">
        <h1>SPILL<span>WAY</span></h1>
        <p class="tag">Kooperacyjna gra o wodzie dla 1–4 osób. Narysujcie rynny, przeprowadźcie swoją wodę do kubków, zmieszajcie tęczę za podwójną kasę.</p>
        <div class="field"><span class="lbl">Twoje imię</span><input class="inp name" maxlength="14" value="${esc(name)}"></div>
        <div class="row"><button class="btn dark solo">${hasSave ? 'Graj sam · dalej' : 'Graj sam'}</button><button class="btn create">${icon('users', 18)} Stwórz pokój</button></div>
        <div class="or lbl">albo dołącz</div>
        <div class="join"><input class="inp code" maxlength="4" placeholder="KOD" value="${esc(code)}"><button class="btn joinb">Dołącz ${icon('arrow', 18)}</button></div>
        <div class="err"></div>
        <div class="keys">
          <span><span class="kbd">A</span> <span class="kbd">D</span></span><span>kamera w lewo / prawo</span>
          <span><span class="kbd">Spacja</span></span><span>trzymaj, żeby pompować</span>
          <span><span class="kbd">LPM</span> <span class="kbd">PPM</span></span><span>marker / gumka</span>
          <span><span class="kbd">1</span>–<span class="kbd">0</span> <span class="kbd">Q</span><span class="kbd">E</span></span><span>narzędzia, obrót przedmiotu</span>
        </div>
        ${hasSave ? '<button class="lbl fresh" style="margin-top:14px;text-decoration:underline;cursor:pointer">Solo od nowa (kasuje zapis)</button>' : ''}
      </div>
      <button class="pill mute" style="position:absolute;right:16px;top:16px">${isMuted() ? 'Dźwięk: wył.' : 'Dźwięk: wł.'}</button>
      <div class="foot">Gzowo Labs · gzowo.fun</div>
    </div>`);
    app.mount(this.root);
    const q = (s) => this.root.querySelector(s);
    this.err = q('.err');
    const nameI = q('.name'), codeI = q('.code');
    const getName = () => { const n = nameI.value.trim().slice(0, 14) || name; try { localStorage.setItem('spillway.name', n); } catch {} return n; };
    const busy = (b) => this.root.querySelectorAll('.card .btn').forEach((x) => { x.disabled = b; });
    const run = async (f) => { this.err.textContent = ''; busy(true); try { await f(); } catch (e) { console.warn(e); this.err.textContent = e && e.message && !/permission|PERMISSION/.test(e.message) ? e.message : 'Nie udało się połączyć. Sprawdź internet.'; busy(false); } };
    q('.solo').onclick = () => { sfx('click'); app.enterRoom(new LocalRoom(getName())); };
    const fresh = q('.fresh');
    if (fresh) fresh.onclick = () => { sfx('click'); app.enterRoom(new LocalRoom(getName(), true)); };
    q('.create').onclick = () => run(async () => { sfx('click'); const r = await OnlineRoom.create(getName()); app.enterRoom(r); });
    const join = () => run(async () => { sfx('click'); const r = await OnlineRoom.join(codeI.value, getName()); app.enterRoom(r); });
    q('.joinb').onclick = join;
    codeI.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    codeI.addEventListener('input', () => { codeI.value = codeI.value.toUpperCase().replace(/[^A-Z]/g, ''); });
    q('.mute').onclick = (e) => { setMuted(!isMuted()); e.currentTarget.textContent = isMuted() ? 'Dźwięk: wył.' : 'Dźwięk: wł.'; };
    if (code) codeI.focus();
    let inRoom = '';
    try { inRoom = sessionStorage.getItem('spillway.inroom') || ''; } catch {}
    if (code && inRoom === code) join();

    this.cBg = q('canvas.bg'); this.cW = q('canvas.water'); this.cFg = q('canvas.fg');
    try { this.water = new WaterRenderer(this.cW); this.water.setPalette(PAL); } catch { this.water = null; }
    this.painter = new Painter(STYLE);
    this.world = new World(DEMO, { n: 4, seed: 9 });
    const tx = [150, 850, 450, 1150];
    this.world.tanks.forEach((t, i) => { t.x = tx[i]; t.total = 300; t.left = 300; });
    this.world.mixer.need = [0, 2];
    const line = (p, x0, y0, x1, y1) => { const d = []; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 12); for (let i = 0; i <= n; i++) d.push(Math.round((x0 + (x1 - x0) * i / n) * 2), Math.round((y0 + (y1 - y0) * i / n) * 2)); this.world.apply({ t: 'l', p, d }); };
    line(0, 90, 270, 650, 395);
    line(2, 712, 600, 1036, 668);
    line(1, 810, 290, 1236, 498);
    line(3, 1110, 300, 1424, 452);
    this.world.rebuild();
    this.resize();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
  }

  resize() {
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    this.cssW = w; this.cssH = h; this.dpr = dpr;
    for (const c of [this.cBg, this.cFg]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    if (this.water) this.water.resize(w, h, Math.min(devicePixelRatio || 1, 1.5));
    this.scale = h / VIEW_H;
  }

  frame(now) {
    const W = this.world;
    const sched = [[0, 220, 520], [60, 230, 520], [140, 200, 480], [220, 210, 500]];
    this.acc = (this.acc || 0) + Math.min(100, now - (this.last || now));
    this.last = now;
    let n = 0;
    while (this.acc >= 1000 / 60 && n < 3) {
      this.acc -= 1000 / 60; n++;
      W.tanks.forEach((t, i) => { const [o, on, per] = sched[i]; t.on = (W.tick + per - o) % per < on; if (t.left <= 0) t.left = t.total; });
      W.cups.forEach((c) => { if (c.count > 400) { c.count = 0; c.wrong = 0; } });
      W.step();
    }
    if (n === 3) this.acc = 0;
    this.painter.pushFx(W.fx.splice(0));
    const vis = this.cssW / this.scale;
    const card = (436 + 56) / this.scale;
    const cam = -(card + (vis - card - W.lv.w) / 2);
    const t = now / 1000;
    this.painter.bg(this.cBg.getContext('2d'), W, cam, this.scale, this.dpr, this.cssW, this.cssH, t);
    if (this.water) this.water.render(W.fluid, cam, this.scale, t, LOOK);
    this.painter.front(this.cFg.getContext('2d'), W, cam, this.scale, this.dpr, this.cssW, this.cssH, t);
  }

  destroy() {
    removeEventListener('resize', this.onResize);
    this.root.remove();
  }
}
