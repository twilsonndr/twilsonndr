// Glue: runs the sim, feeds its events to the renderer, the audio and the UI,
// and walks the story from title screen to ending.
import { Audio } from './audio';
import { CHAPTERS, GAME_OVER_LINES, INTRO, TAGLINE, rankFor } from './content';
import { Controls } from './input';
import { Renderer } from './render';
import { NO_INPUT, Sim, type SimEvent } from './sim';
import { UI, esc } from './ui';

type Phase = 'title' | 'story' | 'play' | 'paused' | 'over' | 'won';

export class Game {
  sim = new Sim(Math.floor(Math.random() * 1e9));
  r: Renderer;
  ui: UI;
  audio = new Audio();
  controls: Controls;
  phase: Phase = 'title';
  hitstop = 0;
  easy = false;
  private seenTips = new Set<string>();
  private tipQueue: { at: number; text: string }[] = [];
  private best = 0;
  private started = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
    this.ui = new UI(this.r);
    this.controls = new Controls(canvas, document.getElementById('stick')!, document.getElementById('knob')!);
    this.controls.onAnyInput = () => this.audio.unlock();
    this.controls.onAdvance = () => {
      if (this.ui.dialogOpen()) this.ui.advance();
    };
    this.controls.onPause = () => this.togglePause();
    this.controls.onMute = () => this.toggleMute();
    document.addEventListener('pointerdown', () => this.audio.unlock());
    document.getElementById('btn-pause')!.onclick = () => this.togglePause();
    document.getElementById('btn-mute')!.onclick = () => this.toggleMute();
    this.syncMuteButton();
    try {
      this.best = Number(localStorage.getItem('tinyclaw.best') ?? 0) || 0;
    } catch {
      /* no storage, no high score */
    }
    // a pretty beach behind the title
    this.sim.start(0);
    this.ui.showTitle(() => this.newGame(), this.best);
  }

  private syncMuteButton() {
    document.getElementById('btn-mute')!.textContent = this.audio.muted ? '🔇' : '🔊';
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.toggleMute();
    this.syncMuteButton();
  }

  newGame() {
    this.audio.unlock();
    this.sim = new Sim(Math.floor(Math.random() * 1e9));
    this.sim.god = this.easy;
    this.started = performance.now();
    this.phase = 'story';
    this.ui.clearFloats();
    this.sim.start(0);
    this.ui.dialog(INTRO, () => this.enterChapter(0));
  }

  private async enterChapter(ch: number) {
    this.phase = 'story';
    this.ui.clearToasts();
    if (this.sim.chapter !== ch || this.sim.state !== 'cutscene') this.sim.start(ch);
    const c = CHAPTERS[ch];
    await this.ui.card(c.title, c.subtitle);
    this.ui.dialog(c.intro, () => this.beginPlay());
  }

  private beginPlay() {
    this.phase = 'play';
    this.sim.go();
    this.controls.clearQueued();
    const c = CHAPTERS[this.sim.chapter];
    this.tipQueue = c.tips.filter((t) => !this.seenTips.has(t)).map((text, i) => ({ at: this.sim.chapterTime + 0.8 + i * 6.5, text }));
  }

  togglePause() {
    if (this.phase === 'play') {
      this.phase = 'paused';
      this.showPause();
    } else if (this.phase === 'paused') {
      this.ui.closeOverlay();
      this.phase = 'play';
      this.controls.clearQueued();
    }
  }

  private showPause() {
    this.ui.overlay(
      `<p class="eyebrow">Paused</p>
       <h2>Taking a breather</h2>
       <p class="quip">${esc(TAGLINE)}</p>
       <div class="howto">
         <div><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> scuttle sideways (fast)</div>
         <div><kbd>W</kbd><kbd>S</kbd> forward and back (slow, crabs hate it)</div>
         <div><kbd>Space</kbd> / <kbd>J</kbd> / click: pinch</div>
         <div><kbd>Shift</kbd> / <kbd>L</kbd> / right-click: side dash (dodges everything)</div>
         <div>Wiggle left-right-left-right fast to charge a <b>Mega Snip</b></div>
         <div><kbd>M</kbd> mute &nbsp; <kbd>Esc</kbd> pause</div>
       </div>
       <label class="toggle"><input type="checkbox" data-a="easy" ${this.sim.god ? 'checked' : ''}/> Believe-in-yourself mode (no damage)</label>
       <div class="row">
         <button class="big" data-a="resume">Resume</button>
         <button data-a="restart">Restart chapter</button>
         <button data-a="quit">Title screen</button>
       </div>`,
      {
        resume: () => this.togglePause(),
        restart: () => {
          this.ui.closeOverlay();
          this.ui.clearFloats();
          this.sim.retry();
          this.beginPlay();
        },
        quit: () => {
          this.ui.closeOverlay();
          this.toTitle();
        },
        easy: () => {
          this.easy = !this.sim.god;
          this.sim.god = this.easy;
        },
      },
    );
  }

  private toTitle() {
    this.phase = 'title';
    this.ui.clearFloats();
    this.ui.clearToasts();
    this.sim = new Sim(1);
    this.sim.start(0);
    this.ui.showTitle(() => this.newGame(), this.best);
  }

  private lose() {
    this.phase = 'over';
    this.ui.clearToasts();
    this.audio.sad();
    const line = GAME_OVER_LINES[this.sim.stats.deaths % GAME_OVER_LINES.length];
    setTimeout(() => {
      if (this.phase !== 'over') return;
      this.ui.overlay(
        `<p class="eyebrow">Out of confidence</p>
         <h2>${esc(line)}</h2>
         <p class="quip">Gerald the Clam: "Told you."</p>
         <div class="row">
           <button class="big" data-a="retry">Prove them wrong</button>
           <button data-a="easy">Retry in believe-in-yourself mode</button>
         </div>`,
        {
          retry: () => this.retry(false),
          easy: () => this.retry(true),
        },
      );
    }, 900);
  }

  private retry(easy: boolean) {
    this.ui.closeOverlay();
    this.ui.clearFloats();
    if (easy) this.easy = true;
    this.sim.god = this.easy;
    this.sim.retry();
    this.beginPlay();
  }

  private win() {
    this.phase = 'won';
    this.ui.clearToasts();
    setTimeout(() => {
      this.ui.dialog(CHAPTERS[2].outro, () => {
        this.audio.fanfare();
        const s = this.sim.stats;
        const secs = Math.round((performance.now() - this.started) / 1000);
        const newBest = s.score > this.best;
        if (newBest) {
          this.best = s.score;
          try {
            localStorage.setItem('tinyclaw.best', String(s.score));
          } catch {
            /* fine */
          }
        }
        this.ui.overlay(
          `<p class="eyebrow">The world is saved</p>
           <h2>(by a very small crab)</h2>
           <p class="quip">It's not the size of the claw. It's the side to side.</p>
           <div class="stats">
             <div><b>${s.score.toLocaleString()}</b><span>score${newBest ? ' · new best!' : ''}</span></div>
             <div><b>${esc(rankFor(s.score))}</b><span>rank</span></div>
             <div><b>${s.snips}</b><span>snips</span></div>
             <div><b>${s.bestCombo}</b><span>best side-to-side</span></div>
             <div><b>${s.megas}</b><span>mega snips</span></div>
             <div><b>${s.deaths}</b><span>times everyone was right</span></div>
             <div><b>${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}</b><span>time</span></div>
             <div><b>${this.sim.god ? 'yes' : 'no'}</b><span>believe-in-yourself mode</span></div>
           </div>
           <div class="row"><button class="big" data-a="again">Play again</button></div>`,
          {
            again: () => {
              this.ui.closeOverlay();
              this.newGame();
            },
          },
        );
      });
    }, 2600);
  }

  private tip(text: string) {
    if (this.seenTips.has(text)) return;
    this.seenTips.add(text);
    this.ui.toast(text);
  }

  private handle(e: SimEvent) {
    const a = this.audio;
    const ui = this.ui;
    const sim = this.sim;
    const p = sim.p;
    this.r.onEvent(e);
    const x = e.x ?? p.x;
    const z = e.z ?? p.z;
    switch (e.t) {
      case 'snip':
        a.snip();
        ui.pop('snip!', x, 1.2, z, 'small');
        this.hitstop = Math.max(this.hitstop, 0.03);
        break;
      case 'miss':
        a.miss();
        ui.pop('*snip*', p.x + 0.4, 1.3, p.z, 'tiny');
        break;
      case 'mega':
        a.mega();
        ui.pop('MEGA SNIP!', p.x, 2, p.z, 'mega', 1.3);
        this.hitstop = Math.max(this.hitstop, 0.1);
        break;
      case 'free': {
        a.free();
        const fx = x;
        const fz = z;
        ui.bubble(`critter${e.id}`, e.text ?? '', () => ({ x: fx, y: 1.5, z: fz }), 2.6, 'friend');
        ui.pop('FREED!', x, 1, z, 'good');
        break;
      }
      case 'blocked':
        a.bonk();
        ui.pop(e.text ?? 'BONK', x, 2.4, z, 'bonk', 1.1);
        if (sim.stats.minions < 2) this.tip('Big claws block from the front. Get to their SIDE!');
        break;
      case 'hit': {
        a.hit();
        ui.pop('CRITICAL SNIP', x, 2.8, z, 'crit', 1);
        const id = e.id;
        ui.bubble(`m${id}`, e.text ?? '', () => {
          const m = sim.minions.find((mm) => mm.id === id);
          return m ? { x: m.x, y: 3, z: m.z } : null;
        }, 1.8, 'enemy');
        this.hitstop = Math.max(this.hitstop, 0.06);
        break;
      }
      case 'minionDown':
        ui.pop('SENT PACKING', x, 2.2, z, 'good', 1.2);
        break;
      case 'minionSpawn': {
        const id = e.id;
        ui.bubble(`m${id}`, `${e.who}: ${e.text}`, () => {
          const m = sim.minions.find((mm) => mm.id === id);
          return m ? { x: m.x, y: 3, z: m.z } : null;
        }, 2.6, 'enemy');
        break;
      }
      case 'windup':
        a.windup();
        break;
      case 'slam':
        a.slam();
        break;
      case 'bigSlam':
        a.slam(true);
        break;
      case 'hurt':
        a.hurt();
        ui.pop(e.text ?? 'OW', p.x, 2, p.z, 'hurt', 1.1);
        this.hitstop = Math.max(this.hitstop, 0.08);
        break;
      case 'dash':
        a.dash();
        break;
      case 'gull':
        a.gull();
        ui.pop(`🐦 ${e.text}`, p.x, 3.2, p.z - 1, 'gull', 1.2);
        if (sim.chapter === 0) this.tip('Seagull shadow? Dash sideways (SHIFT). You are briefly untouchable.');
        break;
      case 'impact':
        if (e.text === 'bubble') a.splash();
        break;
      case 'wave':
        a.wave();
        this.tip('🌊 Tide wall incoming! Scuttle sideways into the gap.');
        break;
      case 'kelp':
        a.kelp();
        ui.pop('+1 ♥', x, 1.6, z, 'good');
        break;
      case 'kelpSpawn':
        ui.pop('kelp!', x, 1.8, z, 'good');
        break;
      case 'screw':
        a.screw();
        ui.pop('SCREW LOOSE!', x, 2.4, z, 'mega', 1.4);
        ui.bubble('admiral', e.text ?? '', () => ({ x: 3.2, y: 6.2, z: -12 }), 2.4, 'boss');
        this.hitstop = Math.max(this.hitstop, 0.14);
        break;
      case 'bossLine':
        ui.bubble('admiral', e.text ?? '', () => ({ x: 3.2, y: 6.2, z: -12 }), 2.2, 'boss');
        break;
      case 'combo':
        a.combo(e.n ?? 0);
        if ((e.n ?? 0) >= 3) ui.pop(`side to side ×${e.n}`, p.x, 2.2, p.z, 'combo', 0.6);
        break;
      case 'wiggle':
        a.wiggle();
        ui.pop('MEGA SNIP READY', p.x, 2.6, p.z, 'mega', 1.2);
        this.tip('Mega Snip charged! Your next pinch hits everything nearby, and ignores big-claw blocks.');
        break;
      case 'say': {
        const who = e.who as string;
        const head = this.r.doubterHead(who);
        if (head) ui.bubble(who, e.text ?? '', () => head, 3.2, sim.doubters.find((d) => d.id === who)?.believes ? 'friend' : '');
        this.r.say(who, 2.2);
        break;
      }
      case 'cleared': {
        const ch = e.n ?? 0;
        this.phase = 'story';
        this.ui.clearToasts();
        a.fanfare();
        setTimeout(() => {
          this.ui.clearFloats();
          this.ui.dialog(CHAPTERS[ch].outro, () => {
            this.sim.start(ch + 1);
            void this.enterChapter(ch + 1);
          });
        }, 1400);
        break;
      }
      case 'win':
        this.win();
        break;
      case 'lose':
        this.lose();
        break;
    }
  }

  update(dt: number) {
    const playing = this.phase === 'play';
    this.audio.setTension(this.sim.chapter === 2 ? 0.7 + (1 - (this.sim.boss?.screws ?? 5) / 5) * 0.3 : this.sim.chapter * 0.25);
    this.audio.tick(this.phase === 'play' || this.phase === 'story' || this.phase === 'paused');

    if (playing) {
      const input = this.controls.read();
      if (this.hitstop > 0) this.hitstop -= dt;
      else this.sim.step(dt, input);
      while (this.tipQueue.length && this.tipQueue[0].at <= this.sim.chapterTime) this.tip(this.tipQueue.shift()!.text);
    } else if (this.phase === 'title') {
      // Sidney shuffles around behind the title screen
      this.controls.read();
      const t = performance.now() / 1000;
      this.sim.state = 'play';
      this.sim.god = true;
      this.sim.step(dt, { ...NO_INPUT, mx: Math.sin(t * 1.3) > 0 ? 0.6 : -0.6 });
      this.sim.drain();
      this.sim.state = 'cutscene';
    } else {
      this.controls.read();
      // the win celebration and the boss collapse keep animating
      if (this.phase === 'won') this.sim.step(dt, NO_INPUT);
    }

    for (const e of this.sim.drain()) this.handle(e);
    this.r.render(this.sim, dt);
    this.ui.hud(this.sim, this.phase === 'play' || this.phase === 'paused');
    this.ui.frame(dt, () => this.audio.blip());
  }
}
