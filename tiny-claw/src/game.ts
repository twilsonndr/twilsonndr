// Glue: runs the sim, feeds its events to the renderer, the audio and the UI,
// and walks the story from title screen to ending.
import { Audio } from './audio';
import { CHAPTERS, GAME_OVER_LINES, INTRO, TAGLINE, rankFor } from './content';
import { Controls } from './input';
import { CINE, Renderer } from './render';
import { BOSS_SCREWS, NO_INPUT, Sim, type SimEvent } from './sim';
import { UI, esc } from './ui';

type Phase = 'title' | 'story' | 'play' | 'paused' | 'over' | 'won' | 'dance' | 'cine';

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
  private danceThen: (() => void) | null = null;
  private clackT = 0;
  private waits: { t: number; fn: () => void }[] = [];
  private cineDone: (() => void) | null = null;
  private cineBeats = new Set<string>();

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
    this.ui = new UI(this.r);
    this.controls = new Controls(canvas, document.getElementById('stick')!, document.getElementById('knob')!);
    this.controls.onAnyInput = () => this.audio.unlock();
    this.controls.onAdvance = () => {
      if (this.phase === 'cine') this.r.skipCine();
      else if (this.ui.dialogOpen()) this.ui.advance();
    };
    document.getElementById('cine')!.addEventListener('click', () => this.r.skipCine());
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

  /** Drop any in-flight dance, cutscene or scheduled beat. */
  private resetShow() {
    this.waits = [];
    this.danceThen = null;
    this.cineDone = null;
    this.r.dance = null;
    this.r.cineT = null;
    this.ui.cine(false);
    this.ui.banner(null);
  }

  newGame() {
    this.resetShow();
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
    this.resetShow();
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

  /**
   * Zoom in on Sidney for a spin-and-clack victory dance. Mid-fight dances pause the
   * action and hand it back; chapter-end dances go on to `then`.
   */
  private dance(label: string, then?: () => void) {
    if (!then && (this.phase !== 'play' || this.sim.state !== 'play')) return;
    this.phase = 'dance';
    this.danceThen =
      then ??
      (() => {
        this.phase = 'play';
        this.controls.clearQueued();
      });
    this.clackT = 0;
    this.ui.clearFloats();
    this.ui.clearToasts();
    this.r.startDance(2.6);
    this.ui.banner(label);
    this.audio.cheer();
  }

  /** Run fn after `secs` of game time (frame-driven, so slow frames don't skip beats). */
  private wait(secs: number, fn: () => void) {
    this.waits.push({ t: secs, fn });
  }

  private runCine(done: () => void) {
    this.phase = 'cine';
    this.cineDone = done;
    this.cineBeats.clear();
    this.ui.clearToasts();
    this.ui.cine(true);
    this.r.startCine();
  }

  /** Captions, sound and heckles, keyed to the cutscene clock. */
  private cineBeat(t: number) {
    const beat = (key: string, at: number, fn: () => void) => {
      if (t >= at && !this.cineBeats.has(key)) {
        this.cineBeats.add(key);
        fn();
      }
    };
    const a = this.audio;
    beat('c0', 0.2, () => this.ui.caption('Meanwhile, out past the reef...'));
    beat('rise', CINE.rise, () => {
      a.rumble();
      this.ui.caption('Admiral Clawdius Maximus reaches for the Moon.');
    });
    beat('clamp', CINE.clamp, () => {
      a.clamp();
      this.ui.caption('*PINCH*');
    });
    beat('yank', CINE.yank, () => {
      a.yoink();
      this.ui.caption('YOINK.');
    });
    beat('land', CINE.land - 0.2, () => a.slam(true));
    beat('tide', CINE.tideFrom - 0.2, () => {
      a.wave();
      this.ui.caption('No Moon, no tides. Well... weird tides.');
    });
    beat('split', CINE.tideFrom + 1.2, () => this.ui.caption('The west beach floods. The east side drains bone dry.'));
    const heckle = (key: string, at: number, who: string, text: string) =>
      beat(key, at, () => {
        const head = this.r.doubterHead(who);
        if (head) this.ui.bubble(who, text, () => ({ ...head, y: head.y + 0.6 }), 2.6, '');
        this.r.say(who, 2);
      });
    heckle('linda', CINE.tideFrom + 1.4, 'linda', 'I live in a boat now!');
    heckle('puff', CINE.tideFrom + 2.0, 'puff', "I'm a FISH. I NEEDED that!");
    heckle('gerald', CINE.tideFrom + 2.6, 'gerald', 'I love water. Still the worst day of my life.');
  }

  private win() {
    this.phase = 'won';
    this.ui.clearToasts();
    // watch the Moon Pincher fall apart, dance, then the ending
    this.wait(1.8, () => this.dance('MOON SAVED!', () => this.ending()));
  }

  private ending() {
    this.phase = 'won';
    {
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
    }
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
        if (sim.chapter === 1 && sim.minionsDown === 1) this.wait(0.35, () => this.dance('FIRST BIG CLAW DOWN!'));
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
        if (e.n === BOSS_SCREWS - 1) this.wait(0.5, () => this.dance('THE ADMIRAL IS COMING UNSCREWED!'));
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
        this.wait(0.5, () =>
          this.dance(ch === 0 ? "EVERYONE'S FREE!" : 'BRIGADE: PACKED UP!', () => {
            this.ui.clearFloats();
            this.ui.dialog(CHAPTERS[ch].outro, () => {
              this.sim.start(ch + 1);
              // before the boss: the Admiral steals the Moon
              if (ch + 1 === 2) this.runCine(() => void this.enterChapter(2));
              else void this.enterChapter(ch + 1);
            });
          }),
        );
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
    this.audio.tick(this.phase !== 'title' && this.phase !== 'over');

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
    }

    if (this.phase === 'dance') {
      this.clackT -= dt;
      if (this.clackT <= 0) {
        this.clackT = 0.16;
        this.audio.clack();
      }
      if (!this.r.dance) {
        this.ui.banner(null);
        const then = this.danceThen;
        this.danceThen = null;
        then?.();
      }
    }
    if (this.phase === 'cine') {
      const t = this.r.cineT ?? CINE.end;
      this.cineBeat(t);
      if (t >= CINE.end) {
        this.r.cineT = null;
        this.ui.cine(false);
        this.ui.clearFloats();
        const done = this.cineDone;
        this.cineDone = null;
        done?.();
      }
    }
    if (this.waits.length && this.phase !== 'paused') {
      for (const w of this.waits) w.t -= dt;
      const due = this.waits.filter((w) => w.t <= 0);
      this.waits = this.waits.filter((w) => w.t > 0);
      for (const w of due) w.fn();
    }

    for (const e of this.sim.drain()) this.handle(e);
    this.r.render(this.sim, dt);
    this.ui.hud(this.sim, this.phase === 'play' || this.phase === 'paused');
    this.ui.frame(dt, () => this.audio.blip());
  }
}
