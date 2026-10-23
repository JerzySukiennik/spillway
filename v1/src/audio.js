// Spillway: sound effects. Recorded samples from assets/sfx via WebAudio, with small synthesized fallbacks.

const FILES = {
  pump: 'pump.mp3', drip: 'drip.mp3', splash: 'splash.mp3', lost: 'lost.mp3', pour: 'pour.mp3', draw: 'draw.mp3',
  erase: 'erase.mp3', place: 'place.mp3', buy: 'buy.mp3', win: 'win.mp3', rainbow: 'rainbow.mp3', click: 'click.mp3', ice: 'ice.mp3', wrong: 'wrong.mp3',
};
const GAIN = { pump: 0.7, drip: 0.35, splash: 0.4, lost: 0.25, pour: 0.32, draw: 0.22, erase: 0.3, place: 0.5, buy: 0.5, win: 0.55, rainbow: 0.4, click: 0.35, ice: 0.45, wrong: 0.3 };

let ctx = null, master = null, muted = false;
const bufs = {};
try { muted = localStorage.getItem('spillway.mute') === '1'; } catch {}

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  master.connect(ctx.destination);
  for (const [k, f] of Object.entries(FILES)) {
    fetch(new URL(`../assets/sfx/${f}`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((a) => ctx.decodeAudioData(a)).then((b) => { bufs[k] = b; }).catch(() => {});
  }
}

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('spillway.mute', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
}

function noise(dur) {
  const b = ctx.createBuffer(1, Math.max(1, (ctx.sampleRate * dur) | 0), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function synth(name, vol) {
  const t = ctx.currentTime, g = ctx.createGain();
  g.connect(master);
  const env = (a, d, v) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f0, f1, dur) => { const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); o.start(t); o.stop(t + dur + 0.05); };
  const nz = (dur, type, f) => { const s = ctx.createBufferSource(); s.buffer = noise(dur); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; s.connect(fl); fl.connect(g); s.start(t); };
  switch (name) {
    case 'drip': env(0.003, 0.09, 0.5); osc('sine', 900 + Math.random() * 500, 1800, 0.08); break;
    case 'splash': env(0.005, 0.25, 0.4); nz(0.3, 'bandpass', 1400); break;
    case 'lost': env(0.01, 0.3, 0.15); nz(0.35, 'lowpass', 500); break;
    case 'pump': env(0.004, 0.18, 0.7); osc('triangle', 180, 60, 0.18); nz(0.08, 'highpass', 2500); break;
    case 'place': env(0.003, 0.12, 0.6); osc('square', 220, 90, 0.1); break;
    case 'erase': env(0.01, 0.12, 0.25); nz(0.14, 'bandpass', 3000); break;
    case 'buy': env(0.005, 0.35, 0.4); osc('triangle', 880, 1760, 0.12); break;
    case 'click': env(0.002, 0.05, 0.4); osc('square', 1200, 800, 0.04); break;
    case 'wrong': env(0.005, 0.2, 0.35); osc('sawtooth', 160, 110, 0.2); break;
    case 'ice': env(0.01, 0.5, 0.35); osc('sine', 2400, 3200, 0.5); break;
    case 'rainbow': env(0.01, 0.6, 0.3); osc('sine', 660, 1320, 0.6); break;
    case 'win': env(0.01, 0.9, 0.4); osc('triangle', 523, 1046, 0.9); break;
    default: break;
  }
}

export function sfx(name, { vol = 1, rate = 1 } = {}) {
  if (!ctx || muted) return;
  const v = (GAIN[name] ?? 0.5) * vol;
  const b = bufs[name];
  if (!b) { synth(name, v); return; }
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.playbackRate.value = rate;
  const g = ctx.createGain();
  g.gain.value = v;
  s.connect(g); g.connect(master);
  s.start();
}

export function loop(name) {
  let src = null, g = null, level = 0;
  const ensure = () => {
    if (src || !ctx || !bufs[name]) return;
    src = ctx.createBufferSource();
    src.buffer = bufs[name];
    src.loop = true;
    g = ctx.createGain();
    g.gain.value = 0;
    src.connect(g); g.connect(master);
    src.start(0, Math.random() * Math.max(0, bufs[name].duration - 0.5));
  };
  return {
    set(v) {
      level = v;
      ensure();
      if (g) g.gain.setTargetAtTime((GAIN[name] ?? 0.4) * v, ctx.currentTime, v > 0 ? 0.05 : 0.12);
    },
    stop() { if (src) { try { src.stop(); } catch {} src = null; } },
    get level() { return level; },
  };
}
