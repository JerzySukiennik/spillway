// Spillway: inline SVG line icons for the toolbar and HUD.

const P = {
  marker: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5 4 20z"/><path d="M13.5 7l3 3"/>',
  eraser: '<path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12 18H7z"/><path d="M9 11l4.5 4.5"/><path d="M12 20h8"/>',
  funnel: '<path d="M3.5 5h17L14 12.5V19l-4 1.5v-8z"/>',
  pipe: '<rect x="2.5" y="8" width="19" height="8" rx="2"/><path d="M6.5 8v8M17.5 8v8"/>',
  tramp: '<path d="M3 9.5h18"/><path d="M6 9.5L4.5 19M18 9.5l1.5 9.5"/><path d="M9 13l1.5 2 1.5-2 1.5 2 1.5-2"/>',
  fan: '<circle cx="12" cy="12" r="1.8"/><path d="M12 10.2C11 6 13 3.5 16 4.5c1.8.7 1 4-4 5.7M13.8 12c4.2-1 6.7 1 5.7 4-.7 1.8-4 1-5.7-4M12 13.8c1 4.2-1 6.7-4 5.7-1.8-.7-1-4 4-5.7M10.2 12C6 13 3.5 11 4.5 8c.7-1.8 4-1 5.7 4"/>',
  lift: '<path d="M7 3v18M17 3v18"/><path d="M12 16.5v-9M9 10l3-3 3 3"/>',
  ice: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8"/><path d="M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2"/>',
  magnet: '<path d="M5.5 3.5h4.5v8a2 2 0 0 0 4 0v-8h4.5v8a6.5 6.5 0 0 1-13 0z"/><path d="M5.5 7.5H10M14 7.5h4.5"/>',
  refill: '<path d="M12 3c3.2 4.3 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 2.8-6.7 6-11z"/><path d="M12 11.5v5M9.5 14h5"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.6-1.2-1.6 0-2.7.8-2.7 2s1 1.6 2.8 2c1.8.3 2.8.9 2.8 2.1S13.6 16 12 16c-1.2 0-2.2-.5-2.8-1.3M12 6.5v1.5M12 16v1.5"/>',
  drop: '<path d="M12 3c3.2 4.3 6 7.4 6 11a6 6 0 0 1-12 0c0-3.6 2.8-6.7 6-11z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.6 3-5.5 6.5-5.5s6 1.9 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
};

export function icon(name, size = 22) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
}
