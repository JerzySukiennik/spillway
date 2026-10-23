// Spillway: "Kontur" visual tokens shared by canvas painters and the water shader.

export const PAL = ['#2B6BFF', '#11A05B', '#E8383D', '#F0B000'];
export const COLOR_NAMES = ['Niebieski', 'Zielony', 'Czerwony', 'Żółty'];
export const INK = '#1A1A1A';
export const PAPER = '#F7F7F4';
export const MONO = '"SF Mono", ui-monospace, Menlo, monospace';
export const SANS = '-apple-system, "SF Pro Text", system-ui, sans-serif';

export const STYLE = {
  font: MONO,
  bgSolid: PAPER,
  abyss: ['rgba(247,247,244,0)', 'rgba(26,26,26,0.08)'],
  drawBg(ctx, w, h, cam, sc) {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#D6D6CF';
    const st = 40 * sc, ox = -((cam * sc) % st);
    for (let x = ox; x < w; x += st) for (let y = st / 2; y < h; y += st) ctx.fillRect(x, y, 1.6, 1.6);
  },
  rockFill: PAPER, rockHatch: '#B5B5AD', rockStroke: INK, rockStrokeW: 2.5, rockRound: 8,
  line: INK, lineTint: 0,
  cupBack: 'rgba(247,247,244,0)', cupRound: 4, cupStroke: INK, cupStrokeW: 3, cupLabel: INK,
  tankBody: PAPER, tankEmpty: PAPER, tankStroke: INK, tankStrokeW: 2.5, tankRound: 4, pipe: '#DADAD4', nozzle: INK,
  item: INK, itemTint: 0, wall: INK, tramp: INK, zone: 'rgba(26,26,26,0.035)', zoneArrow: 'rgba(26,26,26,0.38)',
  mixerBody: PAPER, mixerStroke: INK, mixerSlot: '#E6E6E0', nodraw: '#8F8F88', error: INK,
  pal: PAL,
};

export const LOOK = { th: 0.55, rim: 1, rimW: 0.32, rimCol: [0.22, 0.22, 0.22], gloss: 0, inner: 0.12, depth: 0, alpha: 1, sat: 1, light: 1, ice: 0.8, iceCol: [0.86, 0.94, 1] };
