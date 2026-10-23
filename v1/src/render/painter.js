// Spillway: Canvas2D painter for everything that is not water (terrain, marker lines, tanks, cups, mixer, items, effects).

import { CUP_W, CUP_H, DROP_AREA, LINE_R, RAINBOW, itemShape } from '../sim/world.js';

export const VIEW_H = 1000;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function smoothPoly(ctx, pts, r) {
  const n = pts.length / 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p0 = [pts[((i - 1 + n) % n) * 2], pts[((i - 1 + n) % n) * 2 + 1]];
    const p1 = [pts[i * 2], pts[i * 2 + 1]];
    const p2 = [pts[((i + 1) % n) * 2], pts[((i + 1) % n) * 2 + 1]];
    const a = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    if (i === 0) ctx.moveTo(a[0], a[1]);
    ctx.arcTo(p1[0], p1[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, r);
  }
  ctx.closePath();
}

export function rainbowGrad(ctx, x0, y0, x1, y1, t = 0) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${(i * 60 + t * 40) % 360} 85% 58%)`);
  return g;
}

let hatchCache = new Map();
function hatch(ctx, color, gap = 10, w = 1.5) {
  const key = color + gap + w;
  if (!hatchCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = gap * 2;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = w;
    g.beginPath();
    for (let i = -1; i <= 2; i++) { g.moveTo(i * gap - gap, gap * 2 + gap); g.lineTo(i * gap + gap * 2, -gap); }
    g.stroke();
    hatchCache.set(key, c);
  }
  return ctx.createPattern(hatchCache.get(key), 'repeat');
}

export class Painter {
  constructor(style) {
    this.s = style;
    this.fx = [];
  }

  view(ctx, cam, scale, dpr) {
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -cam * scale * dpr, 0);
  }

  bg(ctx, W, cam, scale, dpr, cssW, cssH, t) {
    const s = this.s, lv = W.lv;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (s.drawBg) s.drawBg(ctx, cssW, cssH, cam, scale);
    else { ctx.fillStyle = s.bg; ctx.fillRect(0, 0, cssW, cssH); }
    this.view(ctx, cam, scale, dpr);
    const x0 = cam - 50, x1 = cam + cssW / scale + 50;

    const ab = ctx.createLinearGradient(0, VIEW_H - 170, 0, VIEW_H);
    ab.addColorStop(0, s.abyss[0]); ab.addColorStop(1, s.abyss[1]);
    ctx.fillStyle = ab;
    ctx.fillRect(x0, VIEW_H - 170, x1 - x0, 170);

    for (const r of lv.nodraw || []) {
      if (r[0] > x1 || r[0] + r[2] < x0) continue;
      ctx.fillStyle = hatch(ctx, s.nodraw, 12, 1.4);
      rr(ctx, r[0], r[1], r[2], r[3], 10);
      ctx.save(); ctx.translate(0, 0); ctx.fill(); ctx.restore();
      ctx.strokeStyle = s.nodraw; ctx.lineWidth = 1.5; ctx.setLineDash([8, 7]); ctx.stroke(); ctx.setLineDash([]);
    }

    for (const t0 of W.tanks) this.tankPipe(ctx, t0);

    for (const poly of lv.rocks || []) {
      let mn = 1e9, mx = -1e9;
      for (let i = 0; i < poly.length; i += 2) { mn = Math.min(mn, poly[i]); mx = Math.max(mx, poly[i]); }
      if (mn > x1 || mx < x0) continue;
      smoothPoly(ctx, poly, s.rockRound);
      if (s.rockShadow) { ctx.save(); ctx.shadowColor = s.rockShadow[0]; ctx.shadowBlur = s.rockShadow[1] * scale * dpr; ctx.shadowOffsetY = s.rockShadow[2] * scale * dpr; ctx.fillStyle = s.rockFill; ctx.fill(); ctx.restore(); }
      if (s.rockHatch) { ctx.fillStyle = s.rockFill; ctx.fill(); ctx.fillStyle = hatch(ctx, s.rockHatch, 9, 1.2); ctx.fill(); }
      else { ctx.fillStyle = s.rockFill; ctx.fill(); }
      if (s.rockTop) {
        ctx.save(); ctx.clip();
        ctx.strokeStyle = s.rockTop; ctx.lineWidth = 6; ctx.translate(0, 3); smoothPoly(ctx, poly, s.rockRound); ctx.stroke();
        ctx.restore();
      }
      if (s.rockStroke) { smoothPoly(ctx, poly, s.rockRound); ctx.strokeStyle = s.rockStroke; ctx.lineWidth = s.rockStrokeW; ctx.stroke(); }
    }
    for (const w of lv.walls || []) {
      ctx.strokeStyle = s.wall; ctx.lineCap = 'round'; ctx.lineWidth = (w[4] || 5) * 2;
      ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke();
    }

    for (const it of lv.fixed || []) this.item(ctx, { ...it, p: -1 }, t, true);

    for (const c of W.cups) this.cupBack(ctx, c, t);
    if (W.mixer) this.mixerBack(ctx, W, t);

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (s.lineShadow) {
      ctx.strokeStyle = s.lineShadow; ctx.lineWidth = LINE_R * 2 + 2;
      ctx.beginPath();
      for (const L of W.lines) { ctx.moveTo(L.ax, L.ay + 3); ctx.lineTo(L.bx, L.by + 3); }
      ctx.stroke();
    }
    ctx.lineWidth = LINE_R * 2;
    for (let p = 0; p < 4; p++) {
      ctx.strokeStyle = s.lineTint ? mix(s.line, s.pal[p], s.lineTint) : s.line;
      ctx.beginPath();
      for (const L of W.lines) if (L.p === p) { ctx.moveTo(L.ax, L.ay); ctx.lineTo(L.bx, L.by); }
      ctx.stroke();
    }
    for (const it of W.items) this.item(ctx, it, t, false);
    for (const t0 of W.tanks) this.tank(ctx, t0, W, t);
  }

  tankPipe(ctx, tk) {
    const s = this.s;
    ctx.fillStyle = s.pipe;
    ctx.fillRect(tk.x - 7, -10, 14, tk.y - 40);
  }

  tank(ctx, tk, W, t) {
    const s = this.s, c = s.pal[tk.p];
    const x = tk.x, y = tk.y, w = 64, h = 84, top = y - 44;
    ctx.save();
    if (s.tankShadow) { ctx.shadowColor = s.tankShadow; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; }
    rr(ctx, x - w / 2, top, w, h, s.tankRound);
    ctx.fillStyle = s.tankBody; ctx.fill();
    ctx.restore();
    const frac = tk.total ? tk.left / tk.total : 0;
    const ih = h - 12, lvl = ih * frac;
    ctx.save();
    rr(ctx, x - w / 2 + 6, top + 6, w - 12, ih, Math.max(2, s.tankRound - 5));
    ctx.clip();
    ctx.fillStyle = s.tankEmpty; ctx.fillRect(x - w / 2, top, w, h);
    ctx.fillStyle = c; ctx.fillRect(x - w / 2, top + 6 + ih - lvl, w, lvl);
    ctx.restore();
    if (s.tankStroke) { rr(ctx, x - w / 2, top, w, h, s.tankRound); ctx.strokeStyle = s.tankStroke; ctx.lineWidth = s.tankStrokeW; ctx.stroke(); }
    ctx.fillStyle = s.nozzle;
    rr(ctx, x - 10, y + 40, 20, 14, 3); ctx.fill();
    if (tk.on && tk.left > 0) {
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(x, y + 58, 3.5 + Math.sin(t * 20) * 0.8, 0, 7); ctx.fill();
    }
  }

  cupBack(ctx, c, t) {
    const s = this.s, l = c.x - CUP_W / 2, top = c.y - CUP_H;
    ctx.fillStyle = s.cupBack;
    rr(ctx, l, top, CUP_W, CUP_H + 4, s.cupRound); ctx.fill();
    const fill = Math.min(CUP_H - 12, (c.count + c.wrong) * DROP_AREA / (CUP_W - 8));
    if (fill > 0.5) {
      const y0 = c.y - 4 - fill;
      ctx.save();
      rr(ctx, l + 4, top, CUP_W - 8, CUP_H, Math.max(2, s.cupRound - 4)); ctx.clip();
      ctx.fillStyle = c.c === RAINBOW ? rainbowGrad(ctx, l, 0, l + CUP_W, 0, t) : s.pal[c.c];
      ctx.beginPath();
      ctx.moveTo(l, c.y + 4);
      for (let x = 0; x <= CUP_W; x += 6) ctx.lineTo(l + x, y0 + Math.sin(x * 0.11 + t * 5) * (0.8 + c.splash * 0.25));
      ctx.lineTo(l + CUP_W, c.y + 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(l, y0 - 1, CUP_W, 3);
      ctx.restore();
    }
  }

  cupFront(ctx, c, t, n) {
    const s = this.s, l = c.x - CUP_W / 2, r = c.x + CUP_W / 2, top = c.y - CUP_H;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = s.cupStroke; ctx.lineWidth = s.cupStrokeW;
    ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(l, c.y - s.cupRound); ctx.arcTo(l, c.y + 4, l + s.cupRound, c.y + 4, s.cupRound);
    ctx.lineTo(r - s.cupRound, c.y + 4); ctx.arcTo(r, c.y + 4, r, c.y - s.cupRound, s.cupRound); ctx.lineTo(r, top); ctx.stroke();
    if (s.cupGloss) { ctx.strokeStyle = s.cupGloss; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(l + 12, top + 14); ctx.lineTo(l + 12, c.y - 22); ctx.stroke(); }
    ctx.fillStyle = c.c === RAINBOW ? rainbowGrad(ctx, c.x - 22, 0, c.x + 22, 0, t) : s.pal[c.c];
    rr(ctx, c.x - 22, c.y + 14, 44, 8, 4); ctx.fill();
    if (s.cupLabel) {
      ctx.fillStyle = s.cupLabel; ctx.font = `600 15px ${s.font}`; ctx.textAlign = 'center';
      const pct = n ? Math.round(c.count / n * 100) : 0;
      ctx.fillText(c.c === RAINBOW ? `${c.count} ×2` : `${pct}%`, c.x, top - 14);
    }
  }

  mixerBack(ctx, W, t) {
    const s = this.s, m = W.mixer;
    ctx.lineCap = 'round';
    ctx.strokeStyle = s.item; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(m.x - 100, m.y - 88); ctx.lineTo(m.x - 18, m.y - 4); ctx.moveTo(m.x + 100, m.y - 88); ctx.lineTo(m.x + 18, m.y - 4); ctx.stroke();
    ctx.save();
    if (m.pulse > 0) { ctx.shadowColor = `hsla(${(t * 200) % 360} 90% 60% / ${m.pulse / 20})`; ctx.shadowBlur = 30; }
    rr(ctx, m.x - 48, m.y - 2, 96, 62, 14); ctx.fillStyle = s.mixerBody; ctx.fill();
    ctx.restore();
    if (s.mixerStroke) { rr(ctx, m.x - 48, m.y - 2, 96, 62, 14); ctx.strokeStyle = s.mixerStroke; ctx.lineWidth = 2; ctx.stroke(); }
    const need = m.need, n = need.length, bw = 70 / n;
    for (let k = 0; k < n; k++) {
      const c = need[k];
      const v = Math.min(1, m.store[c] / 12);
      const bx = m.x - 35 + k * bw + 2;
      ctx.fillStyle = s.mixerSlot; rr(ctx, bx, m.y + 12, bw - 4, 30, 3); ctx.fill();
      ctx.fillStyle = s.pal[c]; rr(ctx, bx, m.y + 42 - 30 * v, bw - 4, 30 * v, 3); ctx.fill();
    }
    ctx.fillStyle = n > 1 ? rainbowGrad(ctx, m.x - 30, 0, m.x + 30, 0, t) : s.pal[need[0]];
    rr(ctx, m.x - 30, m.y + 48, 60, 5, 2.5); ctx.fill();
    ctx.fillStyle = s.nozzle; rr(ctx, m.x - 9, m.y + 58, 18, 8, 3); ctx.fill();
  }

  item(ctx, it, t, fixed, ghost) {
    const s = this.s, sh = itemShape(it.k, it.x, it.y, it.a, it.f);
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.5;
    ctx.lineCap = 'round';
    if (it.k === 'fan' || it.k === 'lift') {
      const z = sh.zones[0];
      ctx.save();
      ctx.translate(z.x, z.y); ctx.rotate(Math.atan2(z.uy, z.ux));
      ctx.fillStyle = s.zone; rr(ctx, -z.hl, -z.hw, z.hl * 2, z.hw * 2, Math.min(z.hw, 14)); ctx.fill();
      ctx.strokeStyle = s.zoneArrow; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      const sp = 44, off = (t * (it.k === 'lift' ? 90 : 60)) % sp;
      ctx.beginPath();
      for (let u = -z.hl + off; u < z.hl - 8; u += sp) { const h = Math.min(z.hw * 0.5, 12); ctx.moveTo(u - 6, -h); ctx.lineTo(u + 4, 0); ctx.lineTo(u - 6, h); }
      ctx.stroke();
      ctx.restore();
    }
    if (it.k === 'pipe' || it.k === 'lift') {
      const [a, b] = sh.segs;
      ctx.fillStyle = s.zone;
      ctx.beginPath(); ctx.moveTo(a.ax, a.ay); ctx.lineTo(a.bx, a.by); ctx.lineTo(b.bx, b.by); ctx.lineTo(b.ax, b.ay); ctx.closePath(); ctx.fill();
    }
    if (it.k === 'tramp') {
      const g = sh.segs[0], dx = g.bx - g.ax, dy = g.by - g.ay, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = uy, ny = -ux;
      ctx.strokeStyle = s.item; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      for (const k of [0.18, 0.82]) {
        const bx = g.ax + dx * k, by = g.ay + dy * k;
        ctx.beginPath();
        for (let i = 0; i <= 6; i++) { const o = (i % 2 ? 7 : -7), d = 6 + i * 4.5; ctx.lineTo(bx - nx * d + ux * (i === 0 || i === 6 ? 0 : o), by - ny * d + uy * (i === 0 || i === 6 ? 0 : o)); }
        ctx.stroke();
      }
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(g.ax - nx * 33 - ux * 6, g.ay - ny * 33 - uy * 6); ctx.lineTo(g.bx - nx * 33 + ux * 6, g.by - ny * 33 + uy * 6); ctx.stroke();
    }
    ctx.strokeStyle = fixed ? s.wall : (it.p >= 0 && s.itemTint ? mix(s.item, s.pal[it.p], s.itemTint) : s.item);
    for (const g of sh.segs) {
      ctx.lineWidth = g.r * 2;
      if (g.re) ctx.strokeStyle = s.tramp;
      ctx.beginPath(); ctx.moveTo(g.ax, g.ay); ctx.lineTo(g.bx, g.by); ctx.stroke();
    }
    if (it.k === 'fan') {
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(Math.atan2(sh.zones[0].uy, sh.zones[0].ux));
      ctx.fillStyle = s.item; rr(ctx, -30, -26, 22, 52, 6); ctx.fill();
      ctx.strokeStyle = s.bgSolid; ctx.lineWidth = 3;
      const a = t * 18;
      ctx.beginPath(); ctx.moveTo(-19, Math.sin(a) * 18); ctx.lineTo(-19, -Math.sin(a) * 18); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  pushFx(list) {
    const now = performance.now();
    for (const e of list) if (e.k === 'fall' || e.k === 'wrong') this.fx.push({ ...e, t0: now });
    if (this.fx.length > 200) this.fx.splice(0, this.fx.length - 200);
  }

  front(ctx, W, cam, scale, dpr, cssW, cssH, t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    this.view(ctx, cam, scale, dpr);
    const per = W.tanks.length ? W.tanks[0].total : 1;
    for (const c of W.cups) this.cupFront(ctx, c, t, per);
    const now = performance.now();
    this.fx = this.fx.filter((e) => now - e.t0 < 900);
    for (const e of this.fx) {
      const k = (now - e.t0) / 900;
      if (e.k === 'fall') {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = e.c === RAINBOW ? '#999' : this.s.pal[e.c]; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, VIEW_H - 6, 4 + k * 22, Math.PI, 0); ctx.stroke();
      } else if (e.k === 'wrong') {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = this.s.error; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const yy = e.y - 18 - k * 26, r = 6;
        ctx.beginPath(); ctx.moveTo(e.x - r, yy - r); ctx.lineTo(e.x + r, yy + r); ctx.moveTo(e.x + r, yy - r); ctx.lineTo(e.x - r, yy + r); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }
}

export function mix(a, b, k) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const A = p(a), B = p(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}
