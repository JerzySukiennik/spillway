// Spillway: app shell — switches between menu, shop and level screens and drives the frame loop.

import { Menu } from './ui/menu.js';
import { ShopScreen } from './game/shop.js';
import { LevelScreen } from './game/level.js';
import { sortedPlayers } from './net/room.js';
import { unlock, isMuted, setMuted } from './audio.js';
import { toast } from './ui/ui.js';

class App {
  constructor() {
    this.screen = null;
    this.room = null;
    this.unsub = [];
    addEventListener('pointerdown', unlock, { capture: true });
    addEventListener('keydown', (e) => {
      unlock();
      if (e.key.toLowerCase() === 'm' && !(e.target && e.target.tagName === 'INPUT')) { setMuted(!isMuted()); toast(isMuted() ? 'Dźwięk wyłączony (M)' : 'Dźwięk włączony (M)'); }
    }, { capture: true });
    this.show(new Menu(this));
    const loop = (t) => {
      try { if (this.screen && this.screen.frame) this.screen.frame(t); } catch (err) { console.error(err); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.spillway = this;
  }

  mount(el) { document.body.append(el); }

  show(s) {
    if (this.screen && this.screen !== s) this.screen.destroy();
    this.screen = s;
  }

  enterRoom(room) {
    this.room = room;
    this.unsub.forEach((f) => f());
    this.unsub = [room.on('meta', (m) => this.onMeta(m)), room.on('players', () => this.onPlayers())];
    if (room.online) { history.replaceState(null, '', `?r=${room.code}`); try { sessionStorage.setItem('spillway.inroom', room.code); } catch {} }
    this.onMeta(room.meta);
  }

  onPlayers() {
    const r = this.room;
    if (!r || !r.online) return;
    const ids = new Set(sortedPlayers(r.players).map(([u]) => u));
    const prev = this.known || ids;
    for (const u of ids) if (!prev.has(u) && u !== r.me) toast(`${r.players[u].n} dołącza do pokoju`);
    for (const u of prev) if (!ids.has(u) && u !== r.me && r.players[u]) toast(`${r.players[u].n} wychodzi`);
    this.known = ids;
  }

  onMeta(m) {
    const r = this.room;
    if (!r) return;
    if (r.isHost && m.phase === 'shop' && m.go && !this.starting) {
      this.starting = true;
      r.startLevel(m.lv || 0).catch((e) => console.warn(e)).finally(() => { this.starting = false; });
      return;
    }
    if (m.phase === 'level' && m.run) {
      if (this.screen instanceof LevelScreen && this.screen.meta.run === m.run) { this.screen.onMeta(m); return; }
      if (r.isHost && r.online && r.now() > m.at + 2500) {
        const others = sortedPlayers(r.players).filter(([u]) => u !== r.me);
        if (others.length) r.handHost(); else { r.startLevel(m.lv || 0); return; }
      }
      this.show(new LevelScreen(this, r, m));
    } else if (m.phase === 'shop') {
      if (!(this.screen instanceof ShopScreen)) this.show(new ShopScreen(this, r));
    }
  }

  toMenu() {
    if (this.room) this.room.leave();
    this.unsub.forEach((f) => f());
    this.unsub = [];
    this.room = null;
    history.replaceState(null, '', location.pathname);
    try { sessionStorage.removeItem('spillway.inroom'); } catch {}
    this.show(new Menu(this));
  }
}

new App();
