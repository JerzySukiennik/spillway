// Spillway: WebGL2 metaball water. Particles splat into a half-res density field, a composite pass shades the surface.

const VS_PTS = `#version 300 es
in vec3 aP;
uniform vec2 uRes;
uniform float uCam, uScale, uRad, uTime;
uniform vec3 uPal[5];
out vec3 vC;
out float vIce;
out float vRain;
void main(){
  float c = mod(aP.z, 8.0);
  vIce = aP.z >= 8.0 ? 1.0 : 0.0;
  vRain = c > 3.5 ? 1.0 : 0.0;
  vec2 s = vec2((aP.x - uCam) * uScale, aP.y * uScale);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = uRad * uScale * 2.0;
  if (c > 3.5) vC = vec3(0.86, 0.86, 0.9);
  else vC = c < 0.5 ? uPal[0] : c < 1.5 ? uPal[1] : c < 2.5 ? uPal[2] : uPal[3];
}`;

const FS_PTS = `#version 300 es
precision highp float;
in vec3 vC;
in float vIce;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 >= 1.0) discard;
  float w = 1.0 - r2; w = w * w * w;
  o = vec4(vC * w, w);
}`;

const FS_ICE = `#version 300 es
precision highp float;
in vec3 vC;
in float vIce;
in float vRain;
out vec4 o;
void main(){
  vec2 d = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(d, d);
  if (r2 >= 1.0) discard;
  float w = 1.0 - r2; w = w * w * w;
  o = vec4(vIce * w, vRain * w, 0.0, 0.0);
}`;

const VS_FULL = `#version 300 es
in vec2 aQ;
out vec2 vUv;
void main(){ vUv = aQ * 0.5 + 0.5; gl_Position = vec4(aQ, 0.0, 1.0); }`;

const FS_COMP = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uField, uIceF;
uniform vec2 uTexel;
uniform float uTh, uRim, uRimW, uGloss, uInner, uDepth, uAlpha, uSat, uLight, uIceAmt;
uniform vec3 uRimCol, uIceCol;
uniform float uCam, uScale, uDpr, uTime;
out vec4 o;
vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.); }
void main(){
  vec4 f = texture(uField, vUv);
  float a = f.a;
  float aa = max(fwidth(a), 0.02);
  float m = smoothstep(uTh - aa, uTh + aa, a);
  if (m <= 0.0) discard;
  vec3 base = f.rgb / max(a, 1e-4);
  float l = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(vec3(l), base, uSat) * uLight;
  vec4 ex = texture(uIceF, vUv);
  float rain = clamp(ex.g / max(a, 1e-4), 0.0, 1.0);
  if (rain > 0.001) {
    vec2 wp = gl_FragCoord.xy / uDpr / uScale;
    float h = fract((wp.x + uCam - wp.y * 0.6) * 0.0075 - uTime * 0.35);
    vec3 rc = mix(hue(h), vec3(1.0), 0.08) * uLight;
    base = mix(base, rc, rain);
  }
  base = mix(base, uIceCol, clamp(ex.r / max(a, 1e-4), 0.0, 1.0) * uIceAmt);
  float ax = texture(uField, vUv + vec2(uTexel.x * 2.0, 0.0)).a - texture(uField, vUv - vec2(uTexel.x * 2.0, 0.0)).a;
  float ay = texture(uField, vUv + vec2(0.0, uTexel.y * 2.0)).a - texture(uField, vUv - vec2(0.0, uTexel.y * 2.0)).a;
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
    this.pPts = prog(gl, VS_PTS, FS_PTS);
    this.pIce = prog(gl, VS_PTS, FS_ICE);
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
    this.pal = new Float32Array(15);
    this.look = { ...DEFAULT_LOOK };
  }

  setPalette(cols) {
    cols.forEach((c, i) => { const v = typeof c === 'string' ? hex(c) : c; this.pal[i * 3] = v[0]; this.pal[i * 3 + 1] = v[1]; this.pal[i * 3 + 2] = v[2]; });
  }

  target(w, h) {
    const gl = this.gl;
    const mk = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t, fb };
    };
    for (const k of ['field', 'iceF']) if (this[k]) { gl.deleteTexture(this[k].t); gl.deleteFramebuffer(this[k].fb); }
    this.field = mk();
    this.iceF = mk();
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
    let n = fluid.n;
    if (this.data.length < n * 3) this.data = new Float32Array(n * 3 + 3072);
    const D = this.data, minX = camX - 40, maxX = camX + this.cssW / scale + 40;
    let m = 0, anyIce = false, anyRain = false;
    for (let i = 0; i < n; i++) {
      const x = fluid.x[i];
      if (x < minX || x > maxX) continue;
      D[m * 3] = x; D[m * 3 + 1] = fluid.y[i];
      const ice = fluid.ice[i] > 0;
      if (ice) anyIce = true;
      if (fluid.col[i] === 4) anyRain = true;
      D[m * 3 + 2] = fluid.col[i] + (ice ? 8 : 0);
      m++;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, m * 3), gl.STREAM_DRAW);
    const fs = 0.5 * this.dpr;
    const setPts = (pp) => {
      gl.useProgram(pp.p);
      gl.uniform2f(pp.u.uRes, this.cssW, this.cssH);
      gl.uniform1f(pp.u.uCam, camX);
      gl.uniform1f(pp.u.uScale, scale);
      gl.uniform1f(pp.u.uRad, 13 * fs);
      gl.uniform1f(pp.u.uTime, time);
      gl.uniform3fv(pp.u.uPal, this.pal);
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.viewport(0, 0, this.fw, this.fh);
    gl.bindVertexArray(this.vaoPts);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.field.fb);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    setPts(this.pPts);
    if (m) gl.drawArrays(gl.POINTS, 0, m);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.iceF.fb);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (anyIce || anyRain) { setPts(this.pIce); gl.drawArrays(gl.POINTS, 0, m); }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const c = this.pComp;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.field.t); gl.uniform1i(c.u.uField, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.iceF.t); gl.uniform1i(c.u.uIceF, 1);
    gl.uniform2f(c.u.uTexel, 1 / this.fw, 1 / this.fh);
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
