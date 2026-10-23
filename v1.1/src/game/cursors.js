// Spillway: remote player cursors drawn on a world-space canvas.

import { INK, MONO } from '../style.js';

export function drawCursor(ctx, x, y, col, name, k, tool) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.lineTo(4.8, 13.6); ctx.lineTo(8.4, 21); ctx.lineTo(11.2, 19.8); ctx.lineTo(7.7, 12.6); ctx.lineTo(13.8, 12.6);
  ctx.closePath();
  ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
  ctx.fill(); ctx.stroke();
  ctx.font = `700 11px ${MONO}`;
  const label = tool === 'eraser' ? `${name} · gumka` : name;
  const w = ctx.measureText(label).width + 12;
  ctx.fillStyle = INK; ctx.fillRect(15.5, 19.5, w, 19);
  ctx.fillStyle = col; ctx.fillRect(14, 18, w, 19);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.strokeRect(14, 18, w, 19);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 20, 31.5);
  ctx.restore();
}

export function drawTrail(ctx, pts, col, s) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 8;
  ctx.setLineDash([10, 9]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  ctx.restore();
}
