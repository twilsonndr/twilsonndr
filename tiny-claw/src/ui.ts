// Everything drawn in HTML on top of the canvas.
import { type Line, SPEAKERS, TAGLINE, TITLE } from './content';
import { BOSS_SCREWS, type Sim, TUNING } from './sim';
import type { Renderer } from './render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

interface Floating {
  el: HTMLElement;
  at: () => { x: number; y: number; z: number } | null;
  life: number;
  max: number;
  rise: number;
  w: number;
  h: number;
}

export class UI {
  private floats: Floating[] = [];
  private dialogLines: Line[] = [];
  private dialogIdx = 0;
  private dialogShown = 0;
  private dialogDone: (() => void) | null = null;
  private typing = 0;
  private toastQ: string[] = [];
  private toastT = 0;
  private lastHp = -1;
  private bubbleByWho = new Map<string, Floating>();

  constructor(private r: Renderer) {}

  // ---------- title ----------

  showTitle(onPlay: () => void, bestScore: number) {
    const el = $('title');
    el.innerHTML = `
      <div class="title-inner">
        <p class="eyebrow">a very small game about a very small crab</p>
        <h1>${esc(TITLE)}</h1>
        <p class="tagline">${esc(TAGLINE)}</p>
        <button class="big" data-a="play">Play</button>
        <div class="howto">
          <div><kbd>A</kbd><kbd>D</kbd> scuttle sideways <em>(fast)</em></div>
          <div><kbd>W</kbd><kbd>S</kbd> walk forward <em>(crabs hate this)</em></div>
          <div><kbd>Space</kbd> / click: pinch</div>
          <div><kbd>Shift</kbd> / right-click: side dash</div>
          <div class="touchonly">Touch: left thumb moves, buttons pinch and dash</div>
        </div>
        ${bestScore > 0 ? `<p class="best">Best score: ${bestScore.toLocaleString()}</p>` : ''}
      </div>`;
    el.hidden = false;
    el.querySelector<HTMLButtonElement>('[data-a="play"]')!.onclick = () => {
      el.hidden = true;
      onPlay();
    };
  }

  // ---------- dialog ----------

  dialogOpen() {
    return this.dialogDone !== null;
  }

  dialog(lines: Line[], done: () => void) {
    this.dialogLines = lines;
    this.dialogIdx = 0;
    this.dialogDone = done;
    const el = $('dialog');
    el.hidden = false;
    el.querySelector<HTMLButtonElement>('[data-a="skip"]')!.onclick = (e) => {
      e.stopPropagation();
      this.endDialog();
    };
    el.onclick = () => this.advance();
    this.showLine();
  }

  private showLine() {
    const [who] = this.dialogLines[this.dialogIdx];
    const s = SPEAKERS[who];
    const el = $('dialog');
    el.style.setProperty('--who', s.color);
    el.querySelector('.portrait')!.textContent = s.icon;
    el.querySelector('.name')!.textContent = s.name;
    el.querySelector('.text')!.textContent = '';
    this.dialogShown = 0;
    this.typing = 0;
    this.r.say(who, 1.5);
  }

  /** Space/Enter/click: finish the line, or go to the next one. */
  advance() {
    if (!this.dialogDone) return false;
    const [, text] = this.dialogLines[this.dialogIdx];
    if (this.dialogShown < text.length) {
      this.dialogShown = text.length;
      $('dialog').querySelector('.text')!.textContent = text;
      return true;
    }
    this.dialogIdx++;
    if (this.dialogIdx >= this.dialogLines.length) this.endDialog();
    else this.showLine();
    return true;
  }

  private endDialog() {
    $('dialog').hidden = true;
    const d = this.dialogDone;
    this.dialogDone = null;
    d?.();
  }

  private tickDialog(dt: number, blip: () => void) {
    if (!this.dialogDone) return;
    const [, text] = this.dialogLines[this.dialogIdx];
    if (this.dialogShown >= text.length) return;
    this.typing += dt * 55;
    const n = Math.min(text.length, Math.floor(this.typing));
    if (n !== this.dialogShown) {
      if (n % 3 === 0) blip();
      this.dialogShown = n;
      $('dialog').querySelector('.text')!.textContent = text.slice(0, n);
    }
  }

  // ---------- chapter cards, toasts, overlays ----------

  card(title: string, sub: string, secs = 2.2) {
    const el = $('card');
    el.innerHTML = `<p class="eyebrow">${esc(sub)}</p><h2>${esc(title)}</h2>`;
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    return new Promise<void>((res) =>
      setTimeout(() => {
        el.hidden = true;
        res();
      }, secs * 1000),
    );
  }

  toast(text: string) {
    if (this.toastQ.includes(text)) return;
    this.toastQ.push(text);
  }

  clearToasts() {
    this.toastQ = [];
    $('toast').classList.remove('on');
    this.toastT = 0;
  }

  private tickToasts(dt: number) {
    const el = $('toast');
    this.toastT -= dt;
    if (this.toastT <= 0) {
      if (el.classList.contains('on')) {
        el.classList.remove('on');
        this.toastT = 0.35;
      } else if (this.toastQ.length) {
        el.textContent = this.toastQ.shift()!;
        el.classList.add('on');
        this.toastT = 5;
      }
    }
  }

  overlay(html: string, actions: Record<string, () => void>) {
    const el = $('overlay');
    el.innerHTML = `<div class="panel">${html}</div>`;
    el.hidden = false;
    for (const [a, fn] of Object.entries(actions)) {
      el.querySelectorAll<HTMLElement>(`[data-a="${a}"]`).forEach((b) => (b.onclick = () => fn()));
    }
    el.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }

  closeOverlay() {
    $('overlay').hidden = true;
    $('overlay').innerHTML = '';
  }

  overlayOpen() {
    return !$('overlay').hidden;
  }

  // ---------- floating words ----------

  bubble(who: string, text: string, at: () => { x: number; y: number; z: number } | null, secs = 3.2, cls = '') {
    const old = this.bubbleByWho.get(who);
    if (old) old.life = 0;
    const el = document.createElement('div');
    el.className = `bubble ${cls}`;
    el.textContent = text;
    $('floats').appendChild(el);
    const f: Floating = { el, at, life: secs, max: secs, rise: 0, w: -1, h: 0 };
    this.floats.push(f);
    this.bubbleByWho.set(who, f);
  }

  pop(text: string, x: number, y: number, z: number, cls = '', secs = 0.9) {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    $('floats').appendChild(el);
    const pos = { x, y, z };
    this.floats.push({ el, at: () => pos, life: secs, max: secs, rise: 60, w: -1, h: 0 });
  }

  clearFloats() {
    for (const f of this.floats) f.el.remove();
    this.floats = [];
    this.bubbleByWho.clear();
  }

  private tickFloats(dt: number) {
    for (const f of this.floats) {
      f.life -= dt;
      const at = f.at();
      if (!at || f.life <= 0) {
        f.el.remove();
        continue;
      }
      if (f.w < 0) {
        f.w = f.el.offsetWidth;
        f.h = f.el.offsetHeight;
      }
      const s = this.r.project(at.x, at.y, at.z);
      const u = 1 - f.life / f.max;
      // whole pixels only: fractional transforms make text render soft
      const x = Math.round(s.x - f.w / 2);
      const y = Math.round(s.y - u * f.rise - f.h);
      f.el.style.transform = `translate(${x}px, ${y}px)`;
      const op = s.on ? Math.min(1, Math.round(f.life * 40) / 10) : 0;
      if (f.el.style.opacity !== String(op)) f.el.style.opacity = String(op);
    }
    this.floats = this.floats.filter((f) => f.life > 0 && f.el.isConnected);
  }

  // ---------- HUD ----------

  private last: Record<string, string | number | boolean> = {};
  /** Set a DOM property only when the value actually changed (no per-frame layout work). */
  private put(key: string, value: string | number | boolean, apply: () => void) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply();
  }

  hud(sim: Sim, visible: boolean) {
    this.put('visible', visible, () => ($('hud').hidden = !visible));
    if (!visible) return;
    const p = sim.p;
    if (p.hp !== this.lastHp) {
      const hearts = $('hearts');
      hearts.innerHTML = Array.from({ length: TUNING.maxHp }, (_, i) => `<i class="${i < p.hp ? 'full' : ''}"></i>`).join('');
      if (this.lastHp > p.hp) {
        hearts.classList.remove('ouch');
        void hearts.offsetWidth;
        hearts.classList.add('ouch');
      }
      this.lastHp = p.hp;
    }
    const o = sim.objective();
    const objKey = `${o.text}|${o.done}|${o.goal}`;
    this.put('obj', objKey, () => ($('obj').innerHTML = `${esc(o.text)} <b>${o.done} / ${o.goal}</b>`));
    this.put('score', sim.stats.score, () => ($('score').textContent = sim.stats.score.toLocaleString()));
    const fill = p.wiggle ? 1 : Math.min(1, p.combo / TUNING.wiggleNeed);
    this.put('wiggle', `${fill}|${p.wiggle}`, () => {
      const w = $('wiggle');
      w.style.setProperty('--fill', String(fill));
      w.classList.toggle('ready', p.wiggle);
      w.querySelector('span')!.textContent = p.wiggle ? 'MEGA SNIP READY' : 'SIDE TO SIDE';
    });
    const b = sim.boss;
    const showBoss = !!b && sim.chapter === 2;
    this.put('bossOn', showBoss, () => ($('bossbar').hidden = !showBoss));
    if (b && showBoss) {
      this.put('screws', b.screws, () => {
        $('bossbar').querySelector('.screws')!.innerHTML = Array.from({ length: BOSS_SCREWS }, (_, i) => `<i class="${i < b.screws ? 'in' : 'out'}"></i>`).join('');
      });
    }
    const believers = sim.doubters.filter((d) => d.believes).length + sim.followers.length;
    this.put('belief', believers, () => ($('belief').textContent = `${believers} believe in you`));
  }

  // ---------- victory banner and cutscene letterbox ----------

  banner(text: string | null) {
    const el = $('banner');
    if (!text) {
      el.hidden = true;
      return;
    }
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  cine(on: boolean) {
    const el = $('cine');
    el.hidden = !on;
    el.classList.toggle('on', on);
    if (!on) el.querySelector('.caption')!.textContent = '';
  }

  caption(text: string) {
    const c = $('cine').querySelector<HTMLElement>('.caption')!;
    c.textContent = text;
    c.classList.remove('in');
    void c.offsetWidth;
    c.classList.add('in');
  }

  frame(dt: number, blip: () => void) {
    this.tickDialog(dt, blip);
    this.tickToasts(dt);
    this.tickFloats(dt);
  }
}
