// Spillway: WebGL2 metaball water. Particles splat per-colour weights into a half-res field (two render targets), a composite pass shades the surface with the dominant colour.

const VS_PTS = `#version 300 es
in vec3 aP;
uniform vec2 uRes;
uniform float uCam, uScale, uRad;
out float vCol;
out float vIce;
void main(){
  vCol = mod(aP.z, 8.0);
  vIce = aP.z >= 8.0 ? 1.0 : 0.0;
  vec2 s = vec2((aP.x - uCam) * uScale, aP.y * uScale);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = uRad * uScale * 2.0;
}`;

const FS_PTS = `#version 300 es
precision highp float;
in float vCol;
in float vIce;
uniform float uK;
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 >= 1.0) discard;
  float w = 1.0 - r2; w = w * w * w * uK;
  vec4 mask = vec4(step(abs(vCol - 0.0), 0.5), step(abs(vCol - 1.0), 0.5), step(abs(vCol - 2.0), 0.5), step(abs(vCol - 3.0), 0.5));
  o0 = mask * w;
  o1 = vec4(step(3.5, vCol) * w, vIce * w, 0.0, 0.0);
}`;

const VS_FULL = `#version 300 es
in vec2 aQ;
out vec2 vUv;
void main(){ vUv = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA, uB;
uniform vec2 uTexel;
uniform vec3 uPal[4];
uniform float uK, uTh, uRim, uRimW, uGloss, uInner, uDepth, uAlpha, uSat, uLight, uIceAmt;
uniform vec3 uRimCol, uIceCol;
uniform float uCam, uScale, uDpr, uTime;
out vec4 o;
vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
float dens(vec2 uv){ vec4 a = texture(uA, uv); vec4 b = texture(uB, uv); return (a.x + a.y + a.z + a.w + b.x) / uK; }
void main(){
  vec4 fa = texture(uA, vUv) / uK;
  vec4 fb = texture(uB, vUv) / uK;
  float a = fa.x + fa.y + fa.z + fa.w + fb.x;
  float aa = max(fwidth(a), 0.02);
  float m = smoothstep(uTh - aa, uTh + aa, a);
  if (m <= 0.0) discard;
  float ia = 1.0 / max(a, 1e-4);
  vec4 e = fa * ia; e *= e; e *= e;
  float er = fb.x * ia; er *= er; er *= er;
  vec3 rc = vec3(0.0);
  if (er > 1e-5) {
    vec2 wp = gl_FragCoord.xy / uDpr / uScale;
    float h = fract((wp.x + uCam - wp.y * 0.6) * 0.0075 - uTime * 0.35);
    rc = mix(hue(h), vec3(1.0), 0.08);
  }
  vec3 base = (e.x * uPal[0] + e.y * uPal[1] + e.z * uPal[2] + e.w * uPal[3] + er * rc) / max(e.x + e.y + e.z + e.w + er, 1e-6);
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(vec3(l), base, uSat) * uLight;
  base = mix(base, uIceCol, clamp(fb.y * ia, 0.0, 1.0) * uIceAmt);
  float ax = dens(vUv + vec2(uTexel.x * 2.0, 0.0)) - dens(vUv - vec2(uTexel.x * 2.0, 0.0));
  float ay = dens(vUv + vec2(0.0, uTexel.y * 2.0)) - dens(vUv - vec2(0.0, uTexel.y * 2.0));
  vec2 g = vec2(ax, ay);
  float gl = length(g);
  vec2 n = gl > 1e-5 ? -g / gl : vec2(0.0);
  float edge = 1.0 - smoothstep(uTh, uTh + uRimW, a);
  float deep = smoothstep(uTh * 2.5, uTh * 9.0, a);
  vec3 col = base * (1.0 - uDepth * deep);
  col = mix(col, col + (vec3(1.0) - col) * 0.55, uInner * (1.0 - edge) * (1.0 - deep) * 0.6);
  float spec = pow(max(dot(n, normalize(vec2(-0.55, 0.85))), 0.0), 6.0) * smoothstep(0.0, 0.6, edge);
  col += vec3(1.0) * spec * uGloss;
  col = mix(col, uRimCol * base, edge * uRim);
  float al = m * uAlpha;
  o = vec4(col * al, al);
}`;

function sh(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

function prog(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}

export const DEFAULT_LOOK = { th: 0.55, rim: 0.0, rimW: 0.35, rimCol: [0.6, 0.6, 0.6], gloss: 0.35, inner: 0.25, depth: 0.12, alpha: 0.96, sat: 1, light: 1, ice: 0.75, iceCol: [0.88, 0.95, 1.0] };

export class WaterRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.half = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    this.k = this.half ? 1 : 0.12;
    this.pPts = prog(gl, VS_PTS, FS_PTS);
    this.pComp = prog(gl, VS_FULL, FS_COMP);
    this.buf = gl.createBuffer();
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.vaoPts = gl.createVertexArray();
    gl.bindVertexArray(this.vaoPts);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    let loc = gl.getAttribLocation(this.pPts.p, 'aP');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 12, 0);
    this.vaoQ = gl.createVertexArray();
    gl.bindVertexArray(this.vaoQ);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    loc = gl.getAttribLocation(this.pComp.p, 'aQ');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.data = new Float32Array(3 * 4096);
    this.fw = 0; this.fh = 0;
    this.pal = new Float32Array(12);
    this.look = { ...DEFAULT_LOOK };
  }

  setPalette(cols) {
    cols.slice(0, 4).forEach((c, i) => { const v = typeof c === 'string' ? hex(c) : c; this.pal[i * 3] = v[0]; this.pal[i * 3 + 1] = v[1]; this.pal[i * 3 + 2] = v[2]; });
  }

  target(w, h) {
    const gl = this.gl;
    const tex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    if (this.fbo) { gl.deleteTexture(this.tA); gl.deleteTexture(this.tB); gl.deleteFramebuffer(this.fbo); }
    this.tA = tex();
    this.tB = tex();
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.tB, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fw = w; this.fh = h;
  }

  resize(cssW, cssH, dpr) {
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    const fw = Math.max(2, Math.round(w * 0.5)), fh = Math.max(2, Math.round(h * 0.5));
    if (fw !== this.fw || fh !== this.fh) this.target(fw, fh);
  }

  render(fluid, camX, scale, time, look) {
    const gl = this.gl, L = look || this.look;
    const n = fluid.n;
    if (this.data.length < n * 3) this.data = new Float32Array(n * 3 + 3072);
    const D = this.data, minX = camX - 40, maxX = camX + this.cssW / scale + 40;
    let m = 0;
    for (let i = 0; i < n; i++) {
      const x = fluid.x[i];
      if (x < minX || x > maxX) continue;
      D[m * 3] = x; D[m * 3 + 1] = fluid.y[i];
      D[m * 3 + 2] = fluid.col[i] + (fluid.ice[i] > 0 ? 8 : 0);
      m++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, m * 3), gl.STREAM_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, this.fw, this.fh);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (m) {
      const p = this.pPts;
      gl.useProgram(p.p);
      gl.uniform2f(p.u.uRes, this.cssW, this.cssH);
      gl.uniform1f(p.u.uCam, camX);
      gl.uniform1f(p.u.uScale, scale);
      gl.uniform1f(p.u.uRad, 13 * 0.5 * this.dpr);
      gl.uniform1f(p.u.uK, this.k);
      gl.bindVertexArray(this.vaoPts);
      gl.drawArrays(gl.POINTS, 0, m);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!m) return;
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const c = this.pComp;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tA); gl.uniform1i(c.u.uA, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tB); gl.uniform1i(c.u.uB, 1);
    gl.uniform2f(c.u.uTexel, 1 / this.fw, 1 / this.fh);
    gl.uniform3fv(c.u.uPal, this.pal);
    gl.uniform1f(c.u.uK, this.k);
    gl.uniform1f(c.u.uTh, L.th); gl.uniform1f(c.u.uRim, L.rim); gl.uniform1f(c.u.uRimW, L.rimW);
    gl.uniform3fv(c.u.uRimCol, L.rimCol); gl.uniform1f(c.u.uGloss, L.gloss); gl.uniform1f(c.u.uInner, L.inner);
    gl.uniform1f(c.u.uDepth, L.depth); gl.uniform1f(c.u.uAlpha, L.alpha); gl.uniform1f(c.u.uSat, L.sat);
    gl.uniform1f(c.u.uLight, L.light); gl.uniform1f(c.u.uIceAmt, L.ice); gl.uniform3fv(c.u.uIceCol, L.iceCol);
    gl.uniform1f(c.u.uCam, camX); gl.uniform1f(c.u.uScale, scale); gl.uniform1f(c.u.uDpr, this.canvas.width / this.cssW); gl.uniform1f(c.u.uTime, time);
    gl.bindVertexArray(this.vaoQ);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }
}

export function hex(h) {
  const v = parseInt(h.slice(1), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
