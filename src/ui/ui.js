// Spillway: tiny DOM helpers — element builder, toasts and modals.

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let toastEl = null, toastT = 0;
export function toast(msg, ms = 1800) {
  if (!toastEl) { toastEl = el('<div class="toast"></div>'); document.body.append(toastEl); }
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

export function modal(inner, { onClose } = {}) {
  const v = el(`<div class="veil"><div class="panel modal">${inner}</div></div>`);
  const close = () => { v.remove(); removeEventListener('keydown', key, true); onClose && onClose(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  addEventListener('keydown', key, true);
  v.addEventListener('pointerdown', (e) => { if (e.target === v) close(); });
  document.body.append(v);
  return { root: v, close, q: (s) => v.querySelector(s) };
}

export function confirmBox(title, text, yes = 'Tak', no = 'Nie') {
  return new Promise((res) => {
    let done = false;
    const m = modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="acts"><button class="btn no">${esc(no)}</button><button class="btn dark yes">${esc(yes)}</button></div>`, { onClose: () => { if (!done) res(false); } });
    m.q('.no').onclick = () => { done = true; m.close(); res(false); };
    m.q('.yes').onclick = () => { done = true; m.close(); res(true); };
    m.q('.yes').focus();
  });
}
