// Spillway: deterministic 2D particle fluid (double-density relaxation) with capsule colliders and force zones.

export const H = 18;
const H2 = H * H;
const INV_H = 1 / H;
export const PR = 3;
export const MAX_V = 10;
export const KILL_Y = 1100;
const TOP = 400;
const SC = 36;
const MAX_NB = 64;

export const P = {
  grav: 0.14,
  rest: 3.4,
  k: 0.3,
  kNear: 0.9,
  visc: 0.1,
  iters: 2,
};

export class Fluid {
  constructor(cap, worldW) {
    this.cap = cap;
    this.n = 0;
    this.w = worldW;
    this.x = new Float64Array(cap);
    this.y = new Float64Array(cap);
    this.px = new Float64Array(cap);
    this.py = new Float64Array(cap);
    this.vx = new Float64Array(cap);
    this.vy = new Float64Array(cap);
    this.col = new Uint8Array(cap);
    this.ice = new Uint16Array(cap);
    this.gw = Math.ceil(worldW / H) + 3;
    this.gh = Math.ceil((KILL_Y + TOP) / H) + 3;
    this.cellStart = new Int32Array(this.gw * this.gh + 1);
    this.cellOf = new Int32Array(cap);
    this.order = new Int32Array(cap);
    this.nbJ = new Int32Array(MAX_NB);
    this.nbQ = new Float64Array(MAX_NB);
    this.nbX = new Float64Array(MAX_NB);
    this.nbY = new Float64Array(MAX_NB);
    this.segs = [];
    this.zones = [];
    this.sgw = Math.ceil(worldW / SC) + 3;
    this.sgh = Math.ceil((KILL_Y + TOP) / SC) + 3;
    this.segStart = new Int32Array(this.sgw * this.sgh + 1);
    this.segIdx = new Int32Array(0);
    this.packSegs();
  }

  add(x, y, vx, vy, c) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    this.x[i] = x; this.y[i] = y;
    this.px[i] = x - vx; this.py[i] = y - vy;
    this.vx[i] = vx; this.vy[i] = vy;
    this.col[i] = c;
    this.ice[i] = 0;
    return i;
  }

  remove(i) {
    const l = --this.n;
    if (i !== l) {
      this.x[i] = this.x[l]; this.y[i] = this.y[l];
      this.px[i] = this.px[l]; this.py[i] = this.py[l];
      this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l];
      this.col[i] = this.col[l]; this.ice[i] = this.ice[l];
    }
  }

  setSegments(list) {
    this.segs = list;
    this.packSegs();
  }

  packSegs() {
    const list = this.segs, m = list.length;
    this.sAx = new Float64Array(m); this.sAy = new Float64Array(m);
    this.sEx = new Float64Array(m); this.sEy = new Float64Array(m);
    this.sIL = new Float64Array(m); this.sR = new Float64Array(m);
    this.sNx = new Float64Array(m); this.sNy = new Float64Array(m);
    this.sRe = new Float64Array(m); this.sFr = new Float64Array(m);
    this.sKick = new Float64Array(m);
    const gw = this.sgw, gh = this.sgh, cnt = new Int32Array(gw * gh + 1);
    const boxes = new Int32Array(m * 4);
    for (let s = 0; s < m; s++) {
      const g = list[s];
      const ex = g.bx - g.ax, ey = g.by - g.ay, l2 = ex * ex + ey * ey, l = Math.sqrt(l2);
      this.sAx[s] = g.ax; this.sAy[s] = g.ay; this.sEx[s] = ex; this.sEy[s] = ey;
      this.sIL[s] = l2 > 1e-9 ? 1 / l2 : 0;
      this.sNx[s] = l > 1e-9 ? -ey / l : 0; this.sNy[s] = l > 1e-9 ? ex / l : -1;
      this.sR[s] = g.r; this.sRe[s] = g.re || 0; this.sFr[s] = g.fr || 0; this.sKick[s] = g.kick || 0;
      const e = g.r + PR + MAX_V + 2;
      let x0 = Math.floor((Math.min(g.ax, g.bx) - e) / SC) + 1, x1 = Math.floor((Math.max(g.ax, g.bx) + e) / SC) + 1;
      let y0 = Math.floor((Math.min(g.ay, g.by) - e + TOP) / SC) + 1, y1 = Math.floor((Math.max(g.ay, g.by) + e + TOP) / SC) + 1;
      x0 = x0 < 0 ? 0 : x0; y0 = y0 < 0 ? 0 : y0;
      x1 = x1 >= gw ? gw - 1 : x1; y1 = y1 >= gh ? gh - 1 : y1;
      boxes[s * 4] = x0; boxes[s * 4 + 1] = y0; boxes[s * 4 + 2] = x1; boxes[s * 4 + 3] = y1;
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) cnt[cy * gw + cx + 1]++;
    }
    for (let c = 1; c <= gw * gh; c++) cnt[c] += cnt[c - 1];
    this.segStart.set(cnt);
    const fill = cnt.slice(0, gw * gh);
    this.segIdx = new Int32Array(cnt[gw * gh]);
    for (let s = 0; s < m; s++) {
      const x0 = boxes[s * 4], y0 = boxes[s * 4 + 1], x1 = boxes[s * 4 + 2], y1 = boxes[s * 4 + 3];
      for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.segIdx[fill[cy * gw + cx]++] = s;
    }
  }

  cellIndex(x, y) {
    let cx = Math.floor(x * INV_H) + 1, cy = Math.floor((y + TOP) * INV_H) + 1;
    if (cx < 0) cx = 0; else if (cx >= this.gw) cx = this.gw - 1;
    if (cy < 0) cy = 0; else if (cy >= this.gh) cy = this.gh - 1;
    return cy * this.gw + cx;
  }

  step(onKill) {
    const n = this.n, X = this.x, Y = this.y, PX = this.px, PY = this.py, VX = this.vx, VY = this.vy, ICE = this.ice;
    const g = P.grav, zones = this.zones, nz = zones.length;

    for (let i = 0; i < n; i++) {
      if (ICE[i]) continue;
      let vx = VX[i], vy = VY[i] + g;
      for (let z = 0; z < nz; z++) {
        const zn = zones[z];
        const dx = X[i] - zn.x, dy = Y[i] - zn.y;
        if (zn.type === 0) {
          const u = dx * zn.ux + dy * zn.uy, v = dx * zn.vx + dy * zn.vy;
          if (u > -zn.hl && u < zn.hl && v > -zn.hw && v < zn.hw) {
            vx += zn.ux * zn.f; vy += zn.uy * zn.f;
            if (zn.damp) { const s = vx * zn.vx + vy * zn.vy; vx -= zn.vx * s * zn.damp; vy -= zn.vy * s * zn.damp; }
          }
        } else {
          const d2 = dx * dx + dy * dy;
          if (d2 < zn.r2 && d2 > 1) {
            const d = Math.sqrt(d2), f = zn.f * (1 - d / zn.r);
            vx -= dx / d * f; vy -= dy / d * f;
            vx *= 0.97; vy *= 0.97;
          }
        }
      }
      const s2 = vx * vx + vy * vy;
      if (s2 > MAX_V * MAX_V) { const k = MAX_V / Math.sqrt(s2); vx *= k; vy *= k; }
      VX[i] = vx; VY[i] = vy;
    }

    this.viscosity();

    for (let i = 0; i < n; i++) {
      PX[i] = X[i]; PY[i] = Y[i];
      if (ICE[i]) continue;
      X[i] += VX[i]; Y[i] += VY[i];
    }

    this.buildGrid();
    for (let it = 0; it < P.iters; it++) this.relax();
    this.collide();

    for (let i = 0; i < n; i++) {
      if (ICE[i]) { ICE[i]--; VX[i] = 0; VY[i] = 0; continue; }
      VX[i] = X[i] - PX[i]; VY[i] = Y[i] - PY[i];
    }

    for (let i = this.n - 1; i >= 0; i--) {
      if (Y[i] > KILL_Y) { if (onKill) onKill(i); this.remove(i); }
    }
  }

  buildGrid() {
    const n = this.n, cs = this.cellStart, co = this.cellOf, cells = this.gw * this.gh;
    cs.fill(0);
    for (let i = 0; i < n; i++) { const c = this.cellIndex(this.x[i], this.y[i]); co[i] = c; cs[c + 1]++; }
    for (let c = 1; c <= cells; c++) cs[c] += cs[c - 1];
    const fill = this.fillTmp && this.fillTmp.length === cells ? this.fillTmp : (this.fillTmp = new Int32Array(cells));
    fill.set(cs.subarray(0, cells));
    for (let i = 0; i < n; i++) this.order[fill[co[i]]++] = i;
  }

  viscosity() {
    const vs = P.visc;
    if (!vs || this.n < 2) return;
    this.buildGridFrom(this.x, this.y);
    const n = this.n, X = this.x, Y = this.y, VX = this.vx, VY = this.vy, ICE = this.ice;
    const cs = this.cellStart, ord = this.order, gw = this.gw;
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i], xi = X[i], yi = Y[i];
      for (let oy = -gw; oy <= gw; oy += gw) for (let ox = -1; ox <= 1; ox++) {
        const cc = c + oy + ox;
        if (cc < 0 || cc >= gw * this.gh) continue;
        for (let k = cs[cc], e = cs[cc + 1]; k < e; k++) {
          const j = ord[k];
          if (j <= i) continue;
          const dx = X[j] - xi, dy = Y[j] - yi, d2 = dx * dx + dy * dy;
          if (d2 >= H2 || d2 < 1e-9) continue;
          const d = Math.sqrt(d2), q = d * INV_H, nx = dx / d, ny = dy / d;
          const u = (VX[i] - VX[j]) * nx + (VY[i] - VY[j]) * ny;
          if (u <= 0) continue;
          const imp = (1 - q) * vs * u * 0.5;
          if (!ICE[i]) { VX[i] -= imp * nx; VY[i] -= imp * ny; }
          if (!ICE[j]) { VX[j] += imp * nx; VY[j] += imp * ny; }
        }
      }
    }
  }

  buildGridFrom() { this.buildGrid(); }

  relax() {
    const n = this.n, X = this.x, Y = this.y, ICE = this.ice;
    const cs = this.cellStart, ord = this.order, gw = this.gw, cells = gw * this.gh;
    const nbJ = this.nbJ, nbQ = this.nbQ, nbX = this.nbX, nbY = this.nbY;
    const rest = P.rest, k = P.k, kn = P.kNear;
    for (let i = 0; i < n; i++) {
      const c = this.cellOf[i], xi = X[i], yi = Y[i];
      let rho = 0, rhoN = 0, m = 0;
      for (let oy = -gw; oy <= gw; oy += gw) for (let ox = -1; ox <= 1; ox++) {
        const cc = c + oy + ox;
        if (cc < 0 || cc >= cells) continue;
        for (let kk = cs[cc], e = cs[cc + 1]; kk < e; kk++) {
          const j = ord[kk];
          if (j === i) continue;
          const dx = X[j] - xi, dy = Y[j] - yi, d2 = dx * dx + dy * dy;
          if (d2 >= H2) continue;
          if (m >= MAX_NB) continue;
          const d = Math.sqrt(d2), q = d * INV_H, w = 1 - q;
          rho += w * w; rhoN += w * w * w;
          nbJ[m] = j; nbQ[m] = w;
          if (d > 1e-9) { nbX[m] = dx / d; nbY[m] = dy / d; } else { const a = (i * 7 + j * 13) % 8; nbX[m] = DIRX[a]; nbY[m] = DIRY[a]; }
          m++;
        }
      }
      const pr = k * (rho - rest), prN = kn * rhoN;
      let dxs = 0, dys = 0;
      const iceI = ICE[i] !== 0;
      for (let t = 0; t < m; t++) {
        const w = nbQ[t], D = pr * w + prN * w * w;
        const ddx = D * nbX[t], ddy = D * nbY[t];
        const j = nbJ[t];
        if (ICE[j]) { if (!iceI) { dxs -= ddx; dys -= ddy; } }
        else if (iceI) { X[j] += ddx; Y[j] += ddy; }
        else { X[j] += ddx * 0.5; Y[j] += ddy * 0.5; dxs -= ddx * 0.5; dys -= ddy * 0.5; }
      }
      if (!iceI) { X[i] += dxs; Y[i] += dys; }
    }
  }

  collide() {
    const n = this.n, X = this.x, Y = this.y, PX = this.px, PY = this.py, ICE = this.ice;
    const ss = this.segStart, si = this.segIdx, sgw = this.sgw, sgh = this.sgh;
    const Ax = this.sAx, Ay = this.sAy, Ex = this.sEx, Ey = this.sEy, IL = this.sIL, Rr = this.sR;
    const Nx = this.sNx, Ny = this.sNy, Re = this.sRe, Fr = this.sFr, Kick = this.sKick;
    if (!si.length) return;
    for (let i = 0; i < n; i++) {
      if (ICE[i]) continue;
      let cx = Math.floor(X[i] / SC) + 1, cy = Math.floor((Y[i] + TOP) / SC) + 1;
      if (cx < 0 || cy < 0 || cx >= sgw || cy >= sgh) continue;
      const cell = cy * sgw + cx;
      for (let k = ss[cell], e = ss[cell + 1]; k < e; k++) {
        const s = si[k];
        let x = X[i], y = Y[i];
        const px = PX[i], py = PY[i];
        const ax = Ax[s], ay = Ay[s], ex = Ex[s], ey = Ey[s];
        let t = ((x - ax) * ex + (y - ay) * ey) * IL[s];
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + ex * t, qy = ay + ey * t;
        const dx = x - qx, dy = y - qy, d2 = dx * dx + dy * dy;
        const R = Rr[s] + PR;
        const sp = ex * (py - ay) - ey * (px - ax);
        const sc = ex * (y - ay) - ey * (x - ax);
        let crossed = false;
        if ((sp > 0 && sc < 0) || (sp < 0 && sc > 0)) {
          const mx = x - px, my = y - py;
          const s1 = mx * (ay - py) - my * (ax - px);
          const s2 = mx * (ay + ey - py) - my * (ax + ex - px);
          if ((s1 > 0) !== (s2 > 0)) crossed = true;
        }
        if (!crossed && d2 >= R * R) continue;
        let nx, ny, nxp, nyp;
        if (crossed) {
          nx = Nx[s]; ny = Ny[s];
          if (sp < 0) { nx = -nx; ny = -ny; }
          const u = sp / (sp - sc);
          nxp = px + (x - px) * u + nx * R;
          nyp = py + (y - py) * u + ny * R;
        } else {
          if (d2 > 1e-12) { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; }
          else { nx = Nx[s]; ny = Ny[s]; if (sp < 0) { nx = -nx; ny = -ny; } }
          nxp = qx + nx * R; nyp = qy + ny * R;
        }
        let vx = x - px, vy = y - py;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const re = Re[s];
          vx -= (1 + re) * vn * nx; vy -= (1 + re) * vn * ny;
          if (Kick[s]) { vx += nx * Kick[s]; vy += ny * Kick[s]; }
        }
        const fr = Fr[s];
        if (fr) {
          const v2 = vx * nx + vy * ny, tx = vx - v2 * nx, ty = vy - v2 * ny;
          vx = tx * (1 - fr) + v2 * nx; vy = ty * (1 - fr) + v2 * ny;
        }
        X[i] = nxp; Y[i] = nyp;
        PX[i] = nxp - vx; PY[i] = nyp - vy;
      }
    }
  }

  checksum() {
    let a = 0, b = 0;
    for (let i = 0; i < this.n; i++) { a += this.x[i] * ((i % 7) + 1); b += this.y[i] * ((i % 5) + 1); }
    return Math.round(a * 1000) % 1000000007 + '/' + Math.round(b * 1000) % 1000000007 + '/' + this.n;
  }
}

const DIRX = [], DIRY = [];
{
  const r = Math.SQRT1_2;
  const v = [[1, 0], [r, r], [0, 1], [-r, r], [-1, 0], [-r, -r], [0, -1], [r, -r]];
  for (const [a, b] of v) { DIRX.push(a); DIRY.push(b); }
}
