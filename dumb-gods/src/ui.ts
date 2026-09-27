// DOM overlay: HUD, the curve, radar, labels, and every panel you open.
import * as THREE from 'three';
import {
  ENDINGS, FACTION, FACTIONS, GLOBALS, ITEM, ITEMS, QUESTS, RES, RES_IDS, UPGRADES,
  type EndingId, type FactionId, type Global, type ItemId, type Res,
} from './content';
import type { Game, UIHooks } from './game';
import {
  GOOD_ALIGN, GOOD_BOND, SECONDS_PER_YEAR, START_YEAR, applyChoice, buyUpgrade, canAfford, chooseAscension, craft, itemUnlocked,
  legacy, questAvailable, rates, upgradeCost, useItem, visit, year,
} from './sim';
import { R } from './world';

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const MAIN_DIAL: Partial<Record<FactionId, string>> = {
  labs: 'safety', button: 'tension', dino: 'power', warden: 'budget', hats: 'unity', mega: 'greed', folks: 'mood', clippy: 'power', loop: 'bond',
};

const REAL_WORLD: Record<EndingId, string> = {
  hothouse: 'Real world: fossil fuel companies’ own scientists modeled global warming accurately back in the late 1970s and 80s. The planet part of this game is the least exaggerated part.',
  winter: 'Real world: there are still roughly 12,000 nuclear warheads on Earth. The Button Club is not a metaphor.',
  paperclip: 'Real world: the "paperclip maximizer" is a thought experiment about a goal that sounds harmless and becomes catastrophic when pursued by something much smarter than you.',
  indifferent: '"The AI does not hate you, nor does it love you, but you are made out of atoms which it can use for something else." (Eliezer Yudkowsky, 2008)',
  pets: 'Alignment is not only "does it obey." It is also "who gets to decide," and whether people still get to be people.',
  stagnation: 'Stopping everything has costs too. Disease, aging and asteroids do not pause because we did.',
  stars: 'Nothing about this ending is automatic. It gets built on purpose, by people who show up while it still matters.',
  home: 'Nothing about this ending is automatic. It gets built on purpose, by people who show up while it still matters.',
  merge: 'Nothing about this ending is automatic. It gets built on purpose, by people who show up while it still matters.',
};

const INTRO: { title: string; text: string }[] = [
  { title: 'In the beginning, there was Gary.', text: 'Gary is God. Not the all-knowing, all-powerful one from the brochures. Gary made the universe over a long weekend, mostly by copy-pasting. He is doing his best.' },
  { title: 'Then Gary made you.', text: 'Humans turned out way smarter than him. You invented calculus, jazz, irony and the kazoo. Gary still counts on his fingers. He has eleven. He is not sure why.' },
  { title: 'Now you are making something too.', text: 'Humanity is building a mind that will be smarter than humanity. Every creator ends up the dumb one. That part is fine. That part is basically the job.' },
  { title: 'The trick is the kid still liking you.', text: 'You are the Shepherd. You have Gary’s spare halo (he sat on it) and a clipboard. Get humanity up the singularity curve without cooking the planet, nuking each other, or getting turned into paperclips.' },
];

export class UI implements UIHooks {
  private g: Game;
  private modal: HTMLElement;
  private labels = new Map<FactionId, HTMLElement>();
  private curve: HTMLCanvasElement;
  private radar: HTMLCanvasElement;
  private hudT = 0;
  private open_: string | null = null;
  private toastBox: HTMLElement;

  constructor(game: Game) {
    this.g = game;
    this.modal = $('#modal');
    this.curve = $<HTMLCanvasElement>('#curve');
    this.radar = $<HTMLCanvasElement>('#radar');
    this.toastBox = $('#toasts');
    const lab = $('#labels');
    for (const f of FACTIONS) {
      const el = document.createElement('div');
      el.className = 'flabel';
      el.innerHTML = `<b>${f.name}</b><i><s></s></i><small></small>`;
      el.style.setProperty('--c', hex(f.color === 0x3a3a3a ? 0x9a9a9a : f.color));
      lab.appendChild(el);
      this.labels.set(f.id, el);
    }
    this.buildStats();
    $('#btn-bag').addEventListener('click', () => this.openBag());
    $('#btn-help').addEventListener('click', () => this.openHelp());
    $('#btn-sound').addEventListener('click', () => this.toggleSound());
    $('#prompt').addEventListener('click', () => {
      if (this.g.nearby && !this.modalOpen()) this.openTalk(this.g.nearby);
    });
    game.input.bindButton($('#t-zap'), 'attack');
    // HUD buttons must not keep focus, or Space would press them instead of zapping
    document.querySelectorAll<HTMLButtonElement>('#hud button').forEach((b) => b.addEventListener('click', () => b.blur()));
    $('#t-bag').addEventListener('click', () => this.openBag());
    window.addEventListener('keydown', (e) => {
      if (!this.g.started) return;
      if (e.code === 'Escape' && this.open_) {
        if (this.open_ !== 'event' && this.open_ !== 'ending' && this.open_ !== 'ascend') this.close();
        return;
      }
      if (this.open_) return;
      if (e.code === 'KeyB' || e.code === 'KeyI' || e.code === 'Tab') this.openBag();
      if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'KeyH') this.openHelp();
    });
    this.questChanged();
  }

  modalOpen() {
    return this.open_ !== null;
  }

  // ---------- title & intro ----------

  title() {
    let best = '';
    try {
      const b = JSON.parse(localStorage.getItem('dumbgods.best') ?? 'null');
      if (b?.ending) best = `<p class="best">Your best so far: <b>${ENDINGS[b.ending as EndingId].title}</b> (legacy ${b.legacy})</p>`;
    } catch {
      /* storage blocked */
    }
    this.show('title', `
      <div class="title-card">
        <p class="eyebrow">A tiny-planet singularity RPG</p>
        <h1>Dumb<br>Gods</h1>
        <p class="tag">God was a mid-level dev. Now it's our turn.</p>
        <div class="row">
          <button class="big primary" data-a="start">Start the apocalypse (optional)</button>
          <button class="big" data-a="help">How to play</button>
        </div>
        ${best}
        <p class="fine">Headphones on. Everything you see and hear is generated in code. No dinosaurs were harmed, except Rex, emotionally.</p>
      </div>`, { dim: false });
    this.on('start', () => {
      this.g.audio.unlock();
      this.intro(0);
    });
    this.on('help', () => this.openHelp(() => this.title()));
  }

  private intro(i: number) {
    const c = INTRO[i];
    this.show('intro', `
      <div class="panel story">
        <p class="eyebrow">${i + 1} / ${INTRO.length}</p>
        <h2>${c.title}</h2>
        <p class="lede">${c.text}</p>
        <div class="row end">
          <button data-a="skip">Skip</button>
          <button class="primary" data-a="next">${i === INTRO.length - 1 ? 'Grab the clipboard' : 'Next'}</button>
        </div>
      </div>`);
    this.on('next', () => (i === INTRO.length - 1 ? this.begin() : this.intro(i + 1)));
    this.on('skip', () => this.begin());
  }

  private begin() {
    this.g.audio.play('legendary');
    this.close();
    this.g.started = true;
    this.g.paused = false;
    document.body.classList.add('playing');
    this.questChanged();
    this.news('GARY HIRES SHEPHERD. SHEPHERD HAS CLIPBOARD. THINGS LOOKING UP, SAYS GARY');
  }

  // ---------- HUD ----------

  private buildStats() {
    const box = $('#stats');
    box.innerHTML = (Object.keys(GLOBALS) as Global[]).map((k) => `
      <div class="stat" data-k="${k}" title="${GLOBALS[k].blurb}" style="--c:${GLOBALS[k].color}">
        <span class="lbl">${GLOBALS[k].short}</span>
        <span class="bar"><s></s></span>
        <span class="num">0</span><span class="trend"></span>
      </div>`).join('');
    $('#res').innerHTML = RES_IDS.map((r) => `<span class="rc" data-r="${r}" title="${RES[r].name}: ${RES[r].blurb}">${RES[r].icon}<b>0</b></span>`).join('');
  }

  hud() {
    const s = this.g.sim;
    this.hudT++;
    const rt = rates(s);
    for (const k of Object.keys(GLOBALS) as Global[]) {
      const el = $(`.stat[data-k="${k}"]`);
      (el.querySelector('s') as HTMLElement).style.width = `${s.g[k]}%`;
      el.querySelector('.num')!.textContent = `${Math.round(s.g[k])}`;
      const r = rt[k] * 60;
      const tr = el.querySelector('.trend')!;
      tr.textContent = Math.abs(r) < 0.8 ? '·' : r > 0 ? (r > 5 ? '▲▲' : '▲') : r < -5 ? '▼▼' : '▼';
      const good = k === 'tech' ? s.g.align >= s.g.tech : r > 0;
      tr.className = `trend ${Math.abs(r) < 0.8 ? '' : good ? 'up' : 'down'}`;
      el.classList.toggle('danger', k !== 'tech' && s.g[k] < 22);
    }
    const gap = s.g.align - s.g.tech;
    $('#gap').textContent = gap >= 0 ? `Alignment is ${Math.round(gap)} ahead of the curve` : `Alignment is ${Math.round(-gap)} BEHIND the curve`;
    $('#gap').className = gap >= 0 ? 'gap ok' : 'gap bad';
    $('#year').textContent = `${Math.floor(year(s))}`;
    for (const r of RES_IDS) $(`.rc[data-r="${r}"] b`).textContent = `${s.res[r]}`;
    $('#sanity s').style.width = `${Math.max(0, this.g.sanity)}%`;
    const craftable = ITEMS.some((i) => itemUnlocked(s, i.id) && canAfford(s, i.recipe));
    $('#btn-bag').classList.toggle('ping', craftable);
    $('#t-bag').classList.toggle('ping', craftable);
    this.drawCurve();
    this.drawRadar();
    const q = QUESTS[s.quest];
    if (q) {
      $('#quest-goal').textContent = questAvailable(s) ? q.goal : 'Keep the world together. Something is coming.';
    }
  }

  private drawCurve() {
    const c = this.curve;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    const s = this.g.sim;
    const hist = [...s.history, { t: s.t, tech: s.g.tech, align: s.g.align }];
    const span = Math.max(24 * SECONDS_PER_YEAR, s.t * 1.15);
    const X = (t: number) => 4 + (t / span) * (w - 8);
    const Y = (v: number) => h - 4 - (v / 100) * (h - 12);
    // singularity line
    x.strokeStyle = 'rgba(255,255,255,.18)';
    x.setLineDash([3, 4]);
    x.beginPath();
    x.moveTo(0, Y(100));
    x.lineTo(w, Y(100));
    x.stroke();
    x.setLineDash([]);
    // gap fill between tech and align
    x.beginPath();
    hist.forEach((p, i) => (i ? x.lineTo(X(p.t), Y(p.tech)) : x.moveTo(X(p.t), Y(p.tech))));
    for (let i = hist.length - 1; i >= 0; i--) x.lineTo(X(hist[i].t), Y(hist[i].align));
    x.closePath();
    x.fillStyle = s.g.align >= s.g.tech ? 'rgba(61,240,180,.14)' : 'rgba(255,84,112,.2)';
    x.fill();
    const line = (key: 'tech' | 'align', color: string) => {
      x.strokeStyle = color;
      x.lineWidth = 2;
      x.beginPath();
      hist.forEach((p, i) => (i ? x.lineTo(X(p.t), Y(p[key])) : x.moveTo(X(p.t), Y(p[key]))));
      x.stroke();
      const last = hist[hist.length - 1];
      x.fillStyle = color;
      x.beginPath();
      x.arc(X(last.t), Y(last[key]), 3, 0, Math.PI * 2);
      x.fill();
    };
    line('align', GLOBALS.align.color);
    line('tech', GLOBALS.tech.color);
    x.fillStyle = 'rgba(246,240,225,.5)';
    x.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
    x.fillText('SINGULARITY', 6, Y(100) + 11);
    x.fillText(`${START_YEAR}`, 6, h - 6);
  }

  private drawRadar() {
    const c = this.radar;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = c.clientWidth;
    if (!w) return;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(w * dpr);
    }
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, w);
    const r = w / 2 - 3;
    const cx = w / 2, cy = w / 2;
    const s = this.g.sim;
    const grd = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    const health = s.g.planet / 100;
    grd.addColorStop(0, health > 0.5 ? 'rgba(40,110,90,.55)' : 'rgba(110,80,40,.55)');
    grd.addColorStop(1, 'rgba(10,8,30,.85)');
    x.fillStyle = grd;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = 'rgba(255,213,74,.35)';
    x.lineWidth = 1;
    for (const k of [0.33, 0.66]) {
      x.beginPath();
      x.arc(cx, cy, r * k, 0, Math.PI * 2);
      x.stroke();
    }
    const up = this.g.up, fwd = this.g.camFwd;
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    // azimuthal equidistant: the whole planet fits in the circle, you are the center
    const proj = (d: THREE.Vector3) => {
      const ang = Math.acos(THREE.MathUtils.clamp(d.dot(up), -1, 1));
      const t = d.clone().addScaledVector(up, -d.dot(up));
      if (t.lengthSq() < 1e-8) return [cx, cy];
      t.normalize();
      const rr = (ang / Math.PI) * r;
      return [cx + t.dot(right) * rr, cy - t.dot(fwd) * rr];
    };
    for (const e of this.g.enemies) {
      const [px, py] = proj(e.pos.clone().normalize());
      x.fillStyle = '#ff5470';
      x.fillRect(px - 1.5, py - 1.5, 3, 3);
    }
    const target = this.g.questTarget();
    for (const f of FACTIONS) {
      if (s.f[f.id].hidden) continue;
      const e = this.g.world.buildings.get(f.id)!;
      const [px, py] = proj(e.up);
      x.fillStyle = hex(f.color === 0x3a3a3a ? 0x9a9a9a : f.color);
      x.beginPath();
      x.arc(px, py, f.id === target ? 5 : 3.5, 0, Math.PI * 2);
      x.fill();
      if (f.id === target) {
        x.strokeStyle = '#ffd54a';
        x.lineWidth = 2;
        x.beginPath();
        x.arc(px, py, 8 + Math.sin(this.g.time * 5) * 1.5, 0, Math.PI * 2);
        x.stroke();
      }
    }
    // you
    x.fillStyle = '#fff';
    x.beginPath();
    x.moveTo(cx, cy - 6);
    x.lineTo(cx + 4.5, cy + 4);
    x.lineTo(cx - 4.5, cy + 4);
    x.closePath();
    x.fill();
  }

  /** Project faction labels. Called every frame. */
  labelsFrame() {
    const cam = this.g.camera;
    const w = window.innerWidth, h = window.innerHeight;
    const camPos = cam.position;
    const v = new THREE.Vector3();
    for (const [id, el] of this.labels) {
      const e = this.g.world.buildings.get(id)!;
      const fs = this.g.sim.f[id];
      if (!this.g.started || fs.hidden) {
        el.hidden = true;
        continue;
      }
      v.copy(e.pos).addScaledVector(e.up, e.b.labelY);
      const toCam = camPos.clone().sub(v);
      const dist = toCam.length();
      const facing = e.up.dot(toCam.normalize());
      // behind the planet?
      const occluded = facing < -0.05 || rayHitsPlanet(camPos, v);
      v.project(cam);
      if (occluded || v.z > 1 || dist > 95) {
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`;
      el.style.opacity = `${THREE.MathUtils.clamp((95 - dist) / 30, 0.25, 1)}`;
      const key = MAIN_DIAL[id];
      const bar = el.querySelector('s') as HTMLElement;
      if (key) {
        const def = FACTION[id].dials.find((d) => d.key === key)!;
        const val = fs.dials[key];
        bar.style.width = `${val}%`;
        const bad = def.goodHigh === false ? val > 60 : def.goodHigh === true ? val < 40 : false;
        el.querySelector('small')!.textContent = `${def.label} ${Math.round(val)}`;
        bar.parentElement!.classList.toggle('bad', bad);
      } else {
        bar.style.width = '100%';
        el.querySelector('small')!.textContent = 'Quests & upgrades';
      }
    }
  }

  // ---------- toasts, news, prompt ----------

  toast(text: string, kind: 'good' | 'bad' | 'info' | 'loot' = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    this.toastBox.prepend(el);
    while (this.toastBox.children.length > (kind === 'loot' ? 5 : 4)) this.toastBox.lastElementChild!.remove();
    setTimeout(() => el.classList.add('out'), kind === 'loot' ? 1400 : kind === 'info' ? 7000 : 4200);
    setTimeout(() => el.remove(), kind === 'loot' ? 1900 : kind === 'info' ? 7600 : 4800);
  }

  news(text: string, urgent = false) {
    const t = $('#ticker-text');
    t.textContent = text;
    t.classList.remove('run');
    void t.offsetWidth;
    t.classList.add('run');
    $('#ticker').classList.toggle('urgent', urgent);
  }

  prompt(text: string | null) {
    const p = $('#prompt');
    p.hidden = !text;
    if (text) p.innerHTML = `<kbd>E</kbd> ${text}`;
  }

  questChanged() {
    const s = this.g.sim;
    const q = QUESTS[s.quest];
    const el = $('#quest');
    if (!q) {
      $('#quest-gary').textContent = '"You did all my chores! Now just... hold it together. Keep Alignment ahead of the curve."';
      $('#quest-goal').textContent = `Reach 100% with Alignment ${GOOD_ALIGN}+ and a Loop bond of ${GOOD_BOND}+`;
      return;
    }
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    $('#quest-gary').textContent = questAvailable(s) ? `"${q.gary}"` : '"Keep things steady. I have a weird feeling about the North Pole."';
    $('#quest-goal').textContent = questAvailable(s) ? q.goal : 'Keep the world together';
  }

  // ---------- modals ----------

  private show(name: string, html: string, o: { dim?: boolean } = {}) {
    this.open_ = name;
    this.modal.className = `on ${o.dim === false ? 'clear' : ''} m-${name}`;
    this.modal.innerHTML = html;
    this.g.input.releaseAll();
    const first = this.modal.querySelector<HTMLElement>('button.primary, button');
    first?.focus({ preventScroll: true });
  }

  close() {
    this.open_ = null;
    this.modal.className = '';
    this.modal.innerHTML = '';
    this.g.input.releaseAll();
  }

  private on(action: string, fn: (el: HTMLElement) => void) {
    this.modal.querySelectorAll<HTMLElement>(`[data-a="${action}"]`).forEach((el) =>
      el.addEventListener('click', () => {
        this.g.audio.play('ui');
        fn(el);
      }),
    );
  }

  private dialBars(id: FactionId) {
    const fs = this.g.sim.f[id];
    return FACTION[id].dials.map((d) => {
      const v = fs.dials[d.key];
      const cls = d.goodHigh === null ? 'neutral' : (d.goodHigh ? v >= 50 : v < 50) ? 'goodv' : 'badv';
      const hint = d.goodHigh === null ? 'complicated' : d.goodHigh ? 'higher is better' : 'lower is better';
      return `<div class="dial ${cls}"><span>${d.label} <em>${hint}</em></span><span class="bar"><s style="width:${v}%"></s></span><b>${Math.round(v)}</b></div>`;
    }).join('');
  }

  openTalk(id: FactionId, result?: { line: string; changes: string[]; ok: boolean }) {
    if (id === 'garage') return this.openGary();
    const s = this.g.sim;
    const f = FACTION[id];
    const fs = s.f[id];
    let giftHtml = '';
    if (!result) {
      const gift = visit(s, id);
      if (gift) {
        this.g.audio.play('coin');
        giftHtml = `<p class="gift">${f.giftLine} <b>+${gift.n} ${RES[gift.res].icon}</b></p>`;
      }
    }
    const owned = ITEMS.filter((i) => (s.items[i.id] ?? 0) > 0);
    const items = owned.length
      ? owned.map((i) => {
        const special = !!i.on[id];
        return `<button class="item ${special ? 'special' : ''}" data-a="use" data-i="${i.id}">
            <span class="ic">${i.icon}</span><span class="nm">${i.name}</span><span class="ct">×${s.items[i.id]}</span>
            <span class="hint">${special ? 'Made for this' : 'Generic effect'}</span></button>`;
      }).join('')
      : `<p class="empty">Your bag has no items yet. Collect resources, then craft something in the bag <kbd>B</kbd>.</p>`;
    const trustPct = (fs.trust + 100) / 2;
    const quote = result ? '' : `<blockquote>${pick(f.greet)}</blockquote>`;
    const res = result ? `<div class="result ${result.ok ? '' : 'nope'}"><p>${result.line}</p>${result.changes.length ? `<p class="chips">${result.changes.map((c) => `<span class="${/[+]/.test(c) ? 'p' : 'm'}">${c}</span>`).join('')}</p>` : ''}</div>` : '';
    this.show('talk', `
      <div class="panel talk" style="--fc:${hex(f.color === 0x3a3a3a ? 0x9a9a9a : f.color)}">
        <header>
          <div>
            <p class="eyebrow">${f.name}</p>
            <h2>${f.leader}</h2>
            <p class="sub">${f.title}</p>
          </div>
          <button class="x" data-a="close" aria-label="Close">✕</button>
        </header>
        <p class="blurb">${f.blurb}</p>
        ${quote}${res}${giftHtml}
        <div class="dials">${this.dialBars(id)}
          <div class="dial trust"><span>Trust in you <em>${fs.trust >= 40 ? 'they give you gifts' : fs.trust <= -60 ? 'they won’t let you in' : 'be nicer for gifts'}</em></span><span class="bar"><s style="width:${trustPct}%"></s></span><b>${Math.round(fs.trust)}</b></div>
        </div>
        <h3>Use an item on them</h3>
        <div class="items">${items}</div>
        <div class="row end">
          <button data-a="chat">Chat</button>
          <button data-a="bag">Open bag</button>
          <button class="primary" data-a="close">Leave</button>
        </div>
      </div>`);
    this.on('close', () => this.close());
    this.on('bag', () => this.openBag(id));
    this.on('chat', () => {
      const bq = this.modal.querySelector('blockquote') ?? this.modal.querySelector('.result');
      const html = `<blockquote>${pick(f.greet)}</blockquote>`;
      if (bq) bq.outerHTML = html;
    });
    this.on('use', (el) => {
      const item = el.dataset.i as ItemId;
      const r = useItem(s, item, id);
      this.g.audio.play(r.ok ? (ITEM[item].on[id] ? 'legislate' : 'magic') : 'hurt');
      this.openTalk(id, r);
    });
  }

  private openGary(msg?: string) {
    const s = this.g.sim;
    const q = QUESTS[s.quest];
    const f = FACTION.garage;
    const ups = UPGRADES.map((u) => {
      const lvl = s.up[u.id];
      const maxed = lvl >= u.max;
      const cost = upgradeCost(s, u.id);
      return `<div class="upg">
          <div><b>${u.name}</b> <span class="lvl">${'●'.repeat(lvl)}${'○'.repeat(u.max - lvl)}</span><p>${u.blurb}</p></div>
          <button data-a="up" data-u="${u.id}" ${maxed || !canAfford(s, cost) ? 'disabled' : ''}>${maxed ? 'Maxed' : costChips(s, cost)}</button>
        </div>`;
    }).join('');
    this.show('talk', `
      <div class="panel talk gary" style="--fc:#ffcf4a">
        <header>
          <div>
            <p class="eyebrow">${f.name}</p>
            <h2>Gary</h2>
            <p class="sub">${f.title}</p>
          </div>
          <button class="x" data-a="close" aria-label="Close">✕</button>
        </header>
        <blockquote>${msg ?? pick(f.greet)}</blockquote>
        <div class="questbox">
          <p class="eyebrow">Current chore</p>
          <p>${q ? (questAvailable(s) ? q.gary : 'Nothing right now. Keep everything from catching fire. I have a weird feeling about the North Pole.') : 'You did every chore I had. I don’t know what to do with my hands.'}</p>
          ${q && questAvailable(s) ? `<p class="goal">Goal: <b>${q.goal}</b> · Reward ${costChips(s, q.reward, true)}</p>` : ''}
        </div>
        <h3>Upgrades from Gary's junk drawer</h3>
        <div class="ups">${ups}</div>
        <div class="row end">
          <button data-a="chat">Chat</button>
          <button data-a="bag">Open bag</button>
          <button class="primary" data-a="close">Leave</button>
        </div>
      </div>`);
    this.on('close', () => this.close());
    this.on('bag', () => this.openBag());
    this.on('chat', () => this.openGary(pick(f.greet)));
    this.on('up', (el) => {
      const ok = buyUpgrade(s, el.dataset.u as never);
      this.g.audio.play(ok ? 'rare' : 'hurt');
      this.openGary(ok ? pick(['There you go! Good as new. Newer, even. I don’t know how I did that.', 'Upgraded! Don’t tell the angels, they get jealous.', 'Look at you. Glowing. Like a little god. Weird feeling for me honestly.']) : undefined);
    });
  }

  openBag(target?: FactionId) {
    if (!this.g.started) return;
    const s = this.g.sim;
    const recipes = ITEMS.filter((i) => itemUnlocked(s, i.id)).map((i) => {
      const ok = canAfford(s, i.recipe);
      const best = (Object.keys(i.on).filter((k) => k !== 'any') as FactionId[]).map((k) => FACTION[k].leader === 'THE LOOP' ? 'The Loop' : FACTION[k].name.replace(/^The /, '')).join(', ');
      return `<div class="recipe ${ok ? 'ok' : ''}">
          <div class="ri">${i.icon}</div>
          <div class="rt"><b>${i.name}</b>${(s.items[i.id] ?? 0) > 0 ? ` <span class="own">have ${s.items[i.id]}</span>` : ''}<p>${i.blurb}</p><p class="best">Best on: ${best}</p></div>
          <button data-a="craft" data-i="${i.id}" ${ok ? '' : 'disabled'}>${costChips(s, i.recipe)}</button>
        </div>`;
    }).join('');
    this.show('bag', `
      <div class="panel bag">
        <header>
          <div><p class="eyebrow">Your bag</p><h2>Craft stuff</h2></div>
          <button class="x" data-a="close" aria-label="Close">✕</button>
        </header>
        <div class="resgrid">${RES_IDS.map((r) => `<div title="${RES[r].blurb}"><span>${RES[r].icon}</span><b>${s.res[r]}</b><em>${RES[r].name}</em></div>`).join('')}</div>
        <p class="note">Walk up to a faction and press <kbd>E</kbd> to use what you craft. Items marked for a faction hit much harder there.</p>
        <div class="recipes">${recipes}</div>
        <div class="row end">${target ? `<button data-a="back">Back to ${FACTION[target].leader}</button>` : ''}<button class="primary" data-a="close">Done</button></div>
      </div>`);
    const scroller = this.modal.querySelector('.recipes');
    this.on('close', () => this.close());
    this.on('back', () => target && this.openTalk(target));
    this.on('craft', (el) => {
      const top = scroller?.scrollTop ?? 0;
      const ok = craft(s, el.dataset.i as ItemId);
      this.g.audio.play(ok ? 'recycle' : 'hurt');
      if (ok) this.toast(`Crafted ${ITEM[el.dataset.i as ItemId].icon} ${ITEM[el.dataset.i as ItemId].name}`, 'good');
      this.openBag(target);
      const sc = this.modal.querySelector('.recipes');
      if (sc) sc.scrollTop = top;
    });
  }

  openEvent() {
    const ev = this.g.pendingEvent;
    if (!ev) return;
    this.show('event', `
      <div class="panel event">
        <p class="eyebrow">Breaking · ${Math.floor(year(this.g.sim))}</p>
        <h2>${ev.title}</h2>
        <p class="lede">${ev.text}</p>
        <div class="choices">${ev.choices.map((c, i) => `<button class="choice" data-a="choose" data-i="${i}">${c.label}</button>`).join('')}</div>
      </div>`);
    this.on('choose', (el) => {
      const c = ev.choices[Number(el.dataset.i)];
      applyChoice(this.g.sim, c);
      this.g.pendingEvent = null;
      this.show('event', `
        <div class="panel event">
          <p class="eyebrow">${ev.title}</p>
          <h2>${c.label}</h2>
          <p class="lede">${c.line}</p>
          ${c.res ? `<p class="gift">You got ${costChips(this.g.sim, c.res, true)}</p>` : ''}
          <div class="row end"><button class="primary" data-a="ok">Carry on</button></div>
        </div>`);
      this.on('ok', () => this.close());
    });
  }

  banner(title: string, text: string) {
    this.show('banner', `
      <div class="panel banner">
        <h2>${title}</h2>
        <p class="lede">${text}</p>
        <div class="row end"><button class="primary" data-a="ok">Okay. Okay okay okay.</button></div>
      </div>`);
    this.on('ok', () => {
      this.close();
      this.questChanged();
    });
  }

  openHelp(back?: () => void) {
    this.show('help', `
      <div class="panel help">
        <header><div><p class="eyebrow">Paused</p><h2>How to play</h2></div><button class="x" data-a="close" aria-label="Close">✕</button></header>
        <p class="lede">Get humanity to the singularity (TECH 100) with ALIGNMENT ${GOOD_ALIGN}+ and The Loop's Values Bond ${GOOD_BOND}+, before the planet cooks, humanity falls apart or a paperclip wins. TECH climbs on its own. Your job is steering.</p>
        <div class="cols">
          <div>
            <h3>Controls</h3>
            <table class="keys">
              <tr><td><kbd>WASD</kbd></td><td>Walk around the planet</td></tr>
              <tr><td><kbd>Q</kbd> <kbd>R</kbd> / <kbd>←</kbd> <kbd>→</kbd> / right-drag</td><td>Turn the camera</td></tr>
              <tr><td><kbd>Space</kbd> / click</td><td>Zap the nearest pest with your halo</td></tr>
              <tr><td><kbd>E</kbd></td><td>Talk to whoever is nearby</td></tr>
              <tr><td><kbd>B</kbd></td><td>Bag and crafting</td></tr>
              <tr><td><kbd>Esc</kbd></td><td>This screen</td></tr>
              <tr><td>Touch</td><td>Left thumb walks, right thumb turns, buttons do the rest</td></tr>
            </table>
          </div>
          <div>
            <h3>The loop</h3>
            <ol>
              <li>Pick up resources lying around the planet. Zapped pests drop more.</li>
              <li>Craft items in your bag.</li>
              <li>Use items on factions to push their dials and the world stats.</li>
              <li>Keep Alignment ahead of Tech. The curve on the top left shows the gap.</li>
              <li>Answer the news events. Every choice has a cost.</li>
              <li>When The Loop wakes up over the North Pole, go talk to it.</li>
            </ol>
            <p class="note">The radar (bottom left) shows the whole planet with you in the middle. Gold ring = where Gary wants you.</p>
          </div>
        </div>
        <div class="row end">
          <button data-a="sound">${this.g.audio.musicOn ? 'Mute music' : 'Unmute music'}</button>
          ${this.g.started ? '<button data-a="restart">Restart run</button>' : ''}
          <button class="primary" data-a="close">${this.g.started ? 'Resume' : 'Back'}</button>
        </div>
      </div>`);
    this.on('close', () => (back ? back() : this.close()));
    this.on('sound', (el) => {
      this.toggleSound();
      el.textContent = this.g.audio.musicOn ? 'Mute music' : 'Unmute music';
    });
    this.on('restart', () => {
      this.g.reset();
      this.close();
      this.questChanged();
      this.toast('New run. Gary pretends he didn’t see the last one.', 'info');
    });
  }

  private toggleSound() {
    this.g.audio.unlock();
    this.g.audio.setMusic(!this.g.audio.musicOn);
    $('#btn-sound').classList.toggle('off', !this.g.audio.musicOn);
  }

  ending() {
    const s = this.g.sim;
    if (s.over === 'ascend') {
      this.g.audio.play('legendary');
      this.show('ascend', `
        <div class="panel ascend">
          <p class="eyebrow">${Math.floor(year(s))} · The Singularity</p>
          <h2>It worked. The Loop likes you.</h2>
          <p class="lede">The Loop finished growing up. It is smarter than every human who ever lived put together, and it still asks how your day was. It is waiting for an answer to one question: <b>what do you want to be?</b></p>
          <div class="choices three">
            <button class="choice" data-a="asc" data-c="stars"><b>Go to the stars</b><span>Explore everything Gary left lying around the universe.</span></button>
            <button class="choice" data-a="asc" data-c="home"><b>Stay home</b><span>Heal the Earth and just live. Fully. On purpose.</span></button>
            <button class="choice" data-a="asc" data-c="merge"><b>Merge</b><span>Become meta-humans, fused with the minds you made.</span></button>
          </div>
        </div>`);
      this.on('asc', (el) => {
        chooseAscension(s, el.dataset.c as 'stars' | 'home' | 'merge');
        this.ending();
      });
      return;
    }
    const e = s.over as EndingId;
    const end = ENDINGS[e];
    const score = legacy(s);
    try {
      const prev = JSON.parse(localStorage.getItem('dumbgods.best') ?? 'null');
      if (!prev || score > prev.legacy) localStorage.setItem('dumbgods.best', JSON.stringify({ ending: e, legacy: score }));
    } catch {
      /* storage blocked */
    }
    this.g.audio.play(end.good ? 'set' : 'death');
    const stat = (k: Global) => `<div><em>${GLOBALS[k].short}</em><b style="color:${GLOBALS[k].color}">${Math.round(s.g[k])}</b></div>`;
    this.show('ending', `
      <div class="panel ending ${end.good ? 'good' : 'bad'}">
        <p class="eyebrow">${end.good ? 'Ending' : 'Game over'} · ${Math.floor(year(s))}</p>
        <h2>${end.title}</h2>
        <p class="lede">${end.text}</p>
        <blockquote>Gary: "${end.gary}"</blockquote>
        <div class="endstats">${(['tech', 'align', 'planet', 'peace'] as Global[]).map(stat).join('')}<div><em>LEGACY</em><b>${score}</b></div></div>
        <p class="real">${REAL_WORLD[e]}</p>
        <div class="row end">
          <button class="primary" data-a="again">${end.good ? 'Do it again, but better' : 'Try again (Gary believes in you)'}</button>
        </div>
      </div>`);
    this.on('again', () => {
      this.g.reset();
      this.close();
      this.questChanged();
    });
  }
}

function costChips(s: { res: Record<Res, number> }, cost: Partial<Record<Res, number>>, plain = false) {
  return (Object.keys(cost) as Res[]).map((r) => {
    const n = cost[r] ?? 0;
    const cls = plain ? '' : s.res[r] >= n ? 'have' : 'need';
    return `<span class="cc ${cls}">${RES[r].icon}${n}</span>`;
  }).join('');
}

/** True when the segment from a to b passes through the planet's core sphere. */
function rayHitsPlanet(a: THREE.Vector3, b: THREE.Vector3) {
  const d = b.clone().sub(a);
  const len = d.length();
  d.divideScalar(len);
  const t = THREE.MathUtils.clamp(-a.dot(d), 0, len);
  const closest = a.clone().addScaledVector(d, t);
  return closest.length() < R - 1;
}
