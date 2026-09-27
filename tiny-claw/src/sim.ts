// The whole game, minus the pictures. Pure TypeScript, deterministic for a given seed,
// so it can be unit tested and balance tested headless.
//
// Coordinates: the beach is the x/z plane. The camera sits at +z looking toward -z,
// so +x is screen-right and -z is "up the beach" toward the sea and the Admiral.
import {
  BLOCKED_LINES,
  BOSS_LINES,
  CHAPTERS,
  CRITTERS,
  type Critter,
  DOUBTERS,
  FREED_LINES,
  GULL_LINES,
  MINION_HURT,
  MINION_NAMES,
  MINION_TAUNTS,
  type SpeakerId,
} from './content';

export interface Input {
  mx: number; // -1..1, + is right
  mz: number; // -1..1, + is up the beach (away from camera)
  pinch: boolean; // pressed this step
  dash: boolean; // pressed this step
}
export const NO_INPUT: Input = { mx: 0, mz: 0, pinch: false, dash: false };

export const ARENA = { hw: 12, zMin: -7.5, zMax: 7.5 };

export const TUNING = {
  sideSpeed: 8.2,
  fwdSpeed: 2.3,
  dashDist: 4.6,
  dashTime: 0.18,
  dashCd: 0.5,
  dashIframes: 0.32,
  pinchRange: 1.7,
  megaRange: 3.4,
  pinchCd: 0.2,
  hurtIframes: 1.2,
  maxHp: 5,
  waveSpeed: 4.2,
  comboWindow: 0.6,
  wiggleNeed: 6,
  bodyR: 0.55,
};

export type EvType =
  | 'chapter'
  | 'cleared'
  | 'win'
  | 'lose'
  | 'snip'
  | 'miss'
  | 'mega'
  | 'free'
  | 'blocked'
  | 'hit'
  | 'minionDown'
  | 'minionSpawn'
  | 'windup'
  | 'slam'
  | 'bigSlam'
  | 'hurt'
  | 'dash'
  | 'gull'
  | 'impact'
  | 'wave'
  | 'kelp'
  | 'kelpSpawn'
  | 'screw'
  | 'bossLine'
  | 'bossDown'
  | 'combo'
  | 'wiggle'
  | 'say';

export interface SimEvent {
  t: EvType;
  x?: number;
  z?: number;
  n?: number;
  text?: string;
  who?: SpeakerId | string;
  id?: number;
}

export interface Player {
  x: number;
  z: number;
  vx: number;
  vz: number;
  kx: number;
  kz: number;
  hp: number;
  side: number; // last sideways direction, -1 or 1
  dashT: number;
  dashDir: number;
  dashCd: number;
  iframes: number;
  pinchT: number;
  pinchCd: number;
  combo: number;
  sinceFlip: number;
  wiggle: boolean;
}

export interface Ring {
  id: number;
  x: number;
  z: number;
  hp: number;
  critter: Critter;
  freed: boolean;
}

export type BlastKind = 'gull' | 'bubble';
export interface Blast {
  id: number;
  kind: BlastKind;
  x: number;
  z: number;
  r: number;
  t: number; // seconds until impact (negative after, while it animates out)
  total: number;
  done: boolean;
}

export interface Gap {
  x: number;
  w: number;
}
export interface Wave {
  id: number;
  z: number;
  gaps: Gap[];
  hit: boolean;
}

export type MinionState = 'walk' | 'windup' | 'stuck' | 'hurt' | 'flee';
export interface Minion {
  id: number;
  name: string;
  x: number;
  z: number;
  a: number; // facing angle; direction is (sin a, cos a)
  hp: number;
  state: MinionState;
  t: number;
  sx: number; // slam point
  sz: number;
  anim: number;
}

export interface Kelp {
  id: number;
  x: number;
  z: number;
}

export type BossState = 'idle' | 'track' | 'lock' | 'stuck' | 'retract' | 'hurt' | 'bubbles' | 'waves' | 'dead';
export type BossAttack = 'slam' | 'bubbles' | 'waves';
export interface Boss {
  screws: number;
  state: BossState;
  t: number;
  cx: number; // claw position on the ground plane
  cz: number;
  cy: number; // claw height
  step: number;
  sub: number;
  subT: number;
  screwX: number;
  screwZ: number;
  adds: boolean;
  anger: number;
}

export interface DoubterState {
  id: SpeakerId;
  believes: boolean;
}

export const BOSS_HOME = { x: 5, z: -6.5, y: 5.5 };
export const BOSS_SCREWS = 5;
export const MINION_GOAL = 8;
const BOSS_PATTERN: BossAttack[] = ['slam', 'bubbles', 'slam', 'waves', 'slam', 'bubbles', 'slam', 'waves'];
const RING_SPOTS: [number, number][] = [
  [-8.5, -4.5],
  [-3.5, 2.5],
  [1, -5.5],
  [5.5, 3],
  [9, -3],
  [-1, 6],
];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function newPlayer(): Player {
  return {
    x: 0,
    z: 4,
    vx: 0,
    vz: 0,
    kx: 0,
    kz: 0,
    hp: TUNING.maxHp,
    side: 1,
    dashT: 0,
    dashDir: 1,
    dashCd: 0,
    iframes: 0,
    pinchT: 0,
    pinchCd: 0,
    combo: 0,
    sinceFlip: 9,
    wiggle: false,
  };
}

export interface Stats {
  snips: number;
  freed: number;
  minions: number;
  screws: number;
  hurts: number;
  deaths: number;
  dashes: number;
  megas: number;
  bestCombo: number;
  score: number;
}

export class Sim {
  rand: () => number;
  chapter = 0;
  state: 'cutscene' | 'play' | 'lost' | 'won' = 'cutscene';
  time = 0;
  chapterTime = 0;
  p: Player = newPlayer();
  rings: Ring[] = [];
  blasts: Blast[] = [];
  waves: Wave[] = [];
  minions: Minion[] = [];
  kelps: Kelp[] = [];
  boss: Boss | null = null;
  doubters: DoubterState[] = DOUBTERS.map((d) => ({ id: d.id, believes: false }));
  followers: Critter[] = [];
  trail: { x: number; z: number }[] = [];
  events: SimEvent[] = [];
  stats: Stats = { snips: 0, freed: 0, minions: 0, screws: 0, hurts: 0, deaths: 0, dashes: 0, megas: 0, bestCombo: 0, score: 0 };
  /** No damage. For tests and for people who just want to see the ending. */
  god = false;

  minionsSpawned = 0;
  minionsDown = 0;
  private nextId = 1;
  private gullT = 0;
  private waveT = 0;
  private spawnT = 0;
  private chatterT = 3;
  private kelpT = 12;
  private trailT = 0;
  private scoreAtChapterStart = 0;

  constructor(public seed = 1) {
    this.rand = mulberry32(seed);
  }

  private r(lo: number, hi: number) {
    return lo + (hi - lo) * this.rand();
  }
  private pick<T>(a: readonly T[]): T {
    return a[Math.floor(this.rand() * a.length) % a.length];
  }
  private emit(e: SimEvent) {
    this.events.push(e);
  }
  drain(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- chapter flow ----------

  /** Set up a chapter. The sim waits in 'cutscene' until go() is called. */
  start(ch: number) {
    this.chapter = ch;
    this.state = 'cutscene';
    this.chapterTime = 0;
    // carrying damage between chapters would be mean; everybody gets a snack
    this.p = newPlayer();
    this.blasts = [];
    this.waves = [];
    this.minions = [];
    this.kelps = [];
    this.boss = null;
    this.trail = [];
    this.minionsSpawned = 0;
    this.minionsDown = 0;
    this.gullT = 6;
    this.waveT = 9;
    this.spawnT = 1;
    this.chatterT = 4;
    this.kelpT = 14;
    this.scoreAtChapterStart = this.stats.score;
    for (const d of this.doubters) d.believes = DOUBTERS.find((x) => x.id === d.id)!.believesFrom <= ch;
    if (ch === 0) {
      this.followers = [];
      this.rings = RING_SPOTS.map(([x, z], i) => ({ id: this.id(), x, z, hp: 3, critter: CRITTERS[i], freed: false }));
    } else {
      this.rings = [];
      if (this.followers.length === 0) this.followers = [...CRITTERS];
    }
    if (ch === 2) {
      this.boss = {
        screws: BOSS_SCREWS,
        state: 'idle',
        t: 2,
        cx: BOSS_HOME.x,
        cz: BOSS_HOME.z,
        cy: BOSS_HOME.y,
        step: 0,
        sub: 0,
        subT: 0,
        screwX: 0,
        screwZ: 0,
        adds: false,
        anger: 0,
      };
    }
    this.emit({ t: 'chapter', n: ch });
  }

  go() {
    if (this.state === 'cutscene') this.state = 'play';
  }

  /** Try the current chapter again after losing. */
  retry() {
    this.stats.score = this.scoreAtChapterStart;
    const followers = this.followers;
    this.start(this.chapter);
    if (this.chapter > 0) this.followers = followers;
  }

  objective(): { text: string; done: number; goal: number } {
    if (this.chapter === 0) return { text: 'Snip the six-pack rings', done: this.rings.filter((r) => r.freed).length, goal: this.rings.length };
    if (this.chapter === 1) return { text: 'Send the Big Claw Brigade packing', done: this.minionsDown, goal: MINION_GOAL };
    const s = this.boss?.screws ?? 0;
    return { text: 'Unscrew the Moon Pincher', done: BOSS_SCREWS - s, goal: BOSS_SCREWS };
  }

  /** 0 = ocean at full motion, 1 = dead still. The Admiral is winning when this is high. */
  stillness(): number {
    if (this.state === 'won') return 0;
    if (this.chapter === 0) return 0.1;
    if (this.chapter === 1) return 0.45;
    return 0.75 + 0.25 * ((this.boss?.screws ?? 0) / BOSS_SCREWS);
  }

  private id() {
    return this.nextId++;
  }

  // ---------- the loop ----------

  step(dt: number, input: Input = NO_INPUT) {
    if (this.state !== 'play') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    this.chapterTime += dt;
    this.movePlayer(dt, input);
    if (input.pinch) this.pinch();
    this.updateBlasts(dt);
    this.updateWaves(dt);
    this.updateMinions(dt);
    this.updateBoss(dt);
    this.updateKelp(dt);
    this.chapterDirector(dt);
    this.chatter(dt);
    this.checkCleared();
  }

  private movePlayer(dt: number, input: Input) {
    const p = this.p;
    const mx = clamp(input.mx, -1, 1);
    const mz = clamp(input.mz, -1, 1);
    p.dashCd -= dt;
    p.iframes -= dt;
    p.pinchCd -= dt;
    p.pinchT -= dt;
    p.sinceFlip += dt;

    // side to side: flipping direction quickly builds the combo, and the combo charges the Mega Snip
    if (Math.abs(mx) > 0.5) this.flip(Math.sign(mx));
    if (p.sinceFlip > TUNING.comboWindow * 1.6) p.combo = 0;

    if (input.dash && p.dashCd <= 0) {
      const dir = Math.abs(mx) > 0.2 ? Math.sign(mx) : p.side;
      this.flip(dir);
      p.dashT = TUNING.dashTime;
      p.dashDir = dir;
      p.dashCd = TUNING.dashCd;
      p.iframes = Math.max(p.iframes, TUNING.dashIframes);
      this.stats.dashes++;
      this.emit({ t: 'dash', x: p.x, z: p.z, n: dir });
    }

    const ox = p.x;
    const oz = p.z;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.x += (p.dashDir * TUNING.dashDist * dt) / TUNING.dashTime;
    } else {
      p.x += mx * TUNING.sideSpeed * dt;
      p.z -= mz * TUNING.fwdSpeed * dt;
    }
    p.x += p.kx * dt;
    p.z += p.kz * dt;
    const k = Math.exp(-7 * dt);
    p.kx *= k;
    p.kz *= k;

    // bodies are solid: minions and a stuck boss claw push you out
    for (const m of this.minions) {
      if (m.state === 'flee') continue;
      this.pushOut(m.x, m.z, 1.05);
    }
    const b = this.boss;
    if (b && (b.state === 'stuck' || b.state === 'lock' || b.state === 'hurt') && b.cy < 1) this.pushOut(b.cx, b.cz, 1.3);

    p.x = clamp(p.x, -ARENA.hw, ARENA.hw);
    p.z = clamp(p.z, ARENA.zMin, ARENA.zMax);
    p.vx = (p.x - ox) / Math.max(dt, 1e-4);
    p.vz = (p.z - oz) / Math.max(dt, 1e-4);

    this.trailT -= dt;
    if (this.trailT <= 0) {
      this.trailT = 0.06;
      const last = this.trail[0];
      if (!last || dist(last.x, last.z, p.x, p.z) > 0.12) {
        this.trail.unshift({ x: p.x, z: p.z });
        if (this.trail.length > 120) this.trail.pop();
      }
    }
  }

  private flip(s: number) {
    const p = this.p;
    if (s === p.side) return;
    if (p.sinceFlip < TUNING.comboWindow) p.combo++;
    else p.combo = 1;
    p.side = s;
    p.sinceFlip = 0;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, p.combo);
    if (p.combo >= 3) {
      this.stats.score += 5 * p.combo;
      this.emit({ t: 'combo', n: p.combo, x: p.x, z: p.z });
    }
    if (p.combo >= TUNING.wiggleNeed && !p.wiggle) {
      p.wiggle = true;
      p.combo = 0;
      this.emit({ t: 'wiggle', x: p.x, z: p.z });
    }
  }

  private pushOut(x: number, z: number, r: number) {
    const p = this.p;
    const d = dist(p.x, p.z, x, z);
    const min = r + TUNING.bodyR;
    if (d < min) {
      const nx = d > 1e-3 ? (p.x - x) / d : 1;
      const nz = d > 1e-3 ? (p.z - z) / d : 0;
      p.x = x + nx * min;
      p.z = z + nz * min;
    }
  }

  hurt(fromX: number, fromZ: number, why: string): boolean {
    const p = this.p;
    if (this.god || p.iframes > 0 || p.dashT > 0 || this.state !== 'play') return false;
    p.hp--;
    p.iframes = TUNING.hurtIframes;
    p.combo = 0;
    const d = dist(p.x, p.z, fromX, fromZ) || 1;
    p.kx = ((p.x - fromX) / d) * 9;
    p.kz = ((p.z - fromZ) / d) * 9;
    this.stats.hurts++;
    this.emit({ t: 'hurt', x: p.x, z: p.z, text: why, n: p.hp });
    if (p.hp <= 0) {
      this.state = 'lost';
      this.stats.deaths++;
      this.emit({ t: 'lose' });
    }
    return true;
  }

  // ---------- pinching ----------

  private pinch() {
    const p = this.p;
    if (p.pinchCd > 0) return;
    p.pinchCd = TUNING.pinchCd;
    p.pinchT = 0.22;
    const mega = p.wiggle;
    const range = mega ? TUNING.megaRange : TUNING.pinchRange;
    // the claw sits a little to the right and in front of the body
    const cx = p.x + 0.3;
    const cz = p.z + 0.15;
    let hit = false;

    type Target = { d: number; fn: () => void };
    const targets: Target[] = [];

    const b = this.boss;
    if (b && b.state === 'stuck') {
      const d = dist(cx, cz, b.screwX, b.screwZ);
      if (d < range + 0.3) targets.push({ d: d - 0.5, fn: () => this.hitScrew() });
    }
    for (const m of this.minions) {
      if (m.state === 'flee') continue;
      const d = dist(cx, cz, m.x, m.z) - 0.9;
      if (d < range) targets.push({ d, fn: () => this.hitMinion(m, mega) });
    }
    for (const r of this.rings) {
      if (r.freed) continue;
      const d = dist(cx, cz, r.x, r.z) - 0.4;
      if (d < range) targets.push({ d, fn: () => this.hitRing(r, mega) });
    }
    targets.sort((a, b2) => a.d - b2.d);
    const hits = mega ? targets : targets.slice(0, 1);
    for (const t of hits) t.fn();
    hit = hits.length > 0;

    if (mega) {
      p.wiggle = false;
      this.stats.megas++;
      this.emit({ t: 'mega', x: p.x, z: p.z });
    } else if (!hit) {
      this.emit({ t: 'miss', x: p.x, z: p.z });
    }
  }

  private hitRing(r: Ring, mega: boolean) {
    r.hp -= mega ? 3 : 1;
    this.stats.snips++;
    this.stats.score += 25;
    this.emit({ t: 'snip', x: r.x, z: r.z, id: r.id, n: Math.max(r.hp, 0) });
    if (r.hp <= 0) {
      r.freed = true;
      this.followers.push(r.critter);
      this.stats.freed++;
      this.stats.score += 200;
      this.emit({ t: 'free', x: r.x, z: r.z, id: r.id, text: this.pick(FREED_LINES), who: r.critter });
      if (this.stats.freed === 2) this.gullT = Math.min(this.gullT, 2);
    }
  }

  private hitMinion(m: Minion, mega: boolean) {
    const p = this.p;
    const dx = p.x - m.x;
    const dz = p.z - m.z;
    const d = Math.hypot(dx, dz) || 1;
    const front = Math.sin(m.a) * (dx / d) + Math.cos(m.a) * (dz / d);
    const open = m.state === 'stuck' || m.state === 'hurt' || front < 0.35;
    if (!open && !mega) {
      p.kx = (dx / d) * 6;
      p.kz = (dz / d) * 6;
      this.emit({ t: 'blocked', x: m.x, z: m.z, text: this.pick(BLOCKED_LINES), id: m.id });
      return;
    }
    m.hp -= mega ? 2 : 1;
    this.stats.snips++;
    this.stats.score += front < 0.35 ? 120 : 80; // style points for flanking
    this.emit({ t: 'hit', x: m.x, z: m.z, id: m.id, text: this.pick(MINION_HURT), who: m.name });
    if (m.hp <= 0) {
      m.state = 'flee';
      m.t = 0;
      this.minionsDown++;
      this.stats.minions++;
      this.stats.score += 250;
      this.emit({ t: 'minionDown', x: m.x, z: m.z, id: m.id, who: m.name });
      if (this.rand() < 0.4 && p.hp < TUNING.maxHp) this.spawnKelp(m.x, m.z);
    } else {
      m.state = 'hurt';
      m.t = 0.45;
    }
  }

  private hitScrew() {
    const b = this.boss!;
    b.screws--;
    this.stats.screws++;
    this.stats.snips++;
    this.stats.score += 800;
    this.emit({ t: 'screw', x: b.screwX, z: b.screwZ, n: b.screws, text: BOSS_LINES.screw[BOSS_SCREWS - 1 - b.screws] ?? BOSS_LINES.screw[0], who: 'admiral' });
    b.state = 'hurt';
    b.t = 1.5;
    b.anger = 1;
  }

  // ---------- hazards ----------

  addBlast(kind: BlastKind, x: number, z: number, r: number, t: number) {
    const bl: Blast = { id: this.id(), kind, x: clamp(x, -ARENA.hw, ARENA.hw), z: clamp(z, ARENA.zMin, ARENA.zMax), r, t, total: t, done: false };
    this.blasts.push(bl);
    return bl;
  }

  private updateBlasts(dt: number) {
    const p = this.p;
    for (const b of this.blasts) {
      b.t -= dt;
      if (!b.done && b.t <= 0) {
        b.done = true;
        this.emit({ t: 'impact', x: b.x, z: b.z, id: b.id, text: b.kind });
        if (dist(p.x, p.z, b.x, b.z) < b.r + TUNING.bodyR * 0.5) this.hurt(b.x, b.z, b.kind === 'gull' ? 'Seagulled!' : 'Bubbled!');
      }
    }
    this.blasts = this.blasts.filter((b) => b.t > -0.6);
  }

  addWave(gaps: number) {
    const gs: Gap[] = [];
    const w = 3.6;
    for (let tries = 0; gs.length < gaps && tries < 40; tries++) {
      const x = this.r(-ARENA.hw + 2.5, ARENA.hw - 2.5);
      if (gs.every((g) => Math.abs(g.x - x) > 7)) gs.push({ x, w });
    }
    const wave: Wave = { id: this.id(), z: ARENA.zMin - 4, gaps: gs, hit: false };
    this.waves.push(wave);
    this.emit({ t: 'wave', id: wave.id, n: gs.length });
    return wave;
  }

  inGap(w: Wave, x: number) {
    return w.gaps.some((g) => Math.abs(x - g.x) < g.w / 2 - TUNING.bodyR * 0.6);
  }

  private updateWaves(dt: number) {
    const p = this.p;
    for (const w of this.waves) {
      w.z += TUNING.waveSpeed * dt;
      if (!w.hit && Math.abs(p.z - w.z) < 0.5 && !this.inGap(w, p.x)) {
        if (this.hurt(p.x, w.z - 1, 'Tide-walled!')) {
          w.hit = true;
          p.kz = 7;
          p.kx = 0;
        }
      }
    }
    this.waves = this.waves.filter((w) => w.z < ARENA.zMax + 3);
  }

  private spawnKelp(x: number, z: number) {
    const k = { id: this.id(), x: clamp(x, -ARENA.hw + 1, ARENA.hw - 1), z: clamp(z, ARENA.zMin + 1, ARENA.zMax - 1) };
    this.kelps.push(k);
    this.emit({ t: 'kelpSpawn', x: k.x, z: k.z, id: k.id });
  }

  private updateKelp(dt: number) {
    const p = this.p;
    if (this.chapter === 2) {
      this.kelpT -= dt;
      if (this.kelpT <= 0) {
        this.kelpT = 18;
        if (p.hp < TUNING.maxHp && this.kelps.length === 0) this.spawnKelp(this.r(-9, 9), this.r(0, 6));
      }
    }
    for (const k of this.kelps) {
      if (dist(p.x, p.z, k.x, k.z) < 1.1 && p.hp < TUNING.maxHp) {
        p.hp++;
        this.stats.score += 50;
        this.emit({ t: 'kelp', x: k.x, z: k.z, id: k.id, n: p.hp });
        k.id = -1;
      }
    }
    this.kelps = this.kelps.filter((k) => k.id !== -1);
  }

  // ---------- minions ----------

  spawnMinion(x?: number, z?: number) {
    const side = this.rand() < 0.5 ? -1 : 1;
    const m: Minion = {
      id: this.id(),
      name: MINION_NAMES[this.minionsSpawned % MINION_NAMES.length],
      x: x ?? side * this.r(5, 10),
      z: z ?? ARENA.zMin - 1,
      a: 0,
      hp: 2,
      state: 'walk',
      t: 0,
      sx: 0,
      sz: 0,
      anim: this.rand() * 10,
    };
    this.minionsSpawned++;
    this.minions.push(m);
    this.emit({ t: 'minionSpawn', x: m.x, z: m.z, id: m.id, who: m.name, text: this.pick(MINION_TAUNTS) });
    return m;
  }

  private updateMinions(dt: number) {
    const p = this.p;
    for (const m of this.minions) {
      m.anim += dt;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const d = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      const diff = wrapAngle(want - m.a);
      switch (m.state) {
        case 'walk': {
          // big claws are heavy: slow to turn, slow to walk, and they can only go forward
          const turn = 1.5 * dt;
          m.a = wrapAngle(m.a + clamp(diff, -turn, turn));
          if (d > 2.3) {
            m.x += Math.sin(m.a) * 1.8 * dt;
            m.z += Math.cos(m.a) * 1.8 * dt;
          }
          if (d < 3.1 && Math.abs(diff) < 0.55 && this.chapterTime > 1) {
            m.state = 'windup';
            m.t = 0.8;
            m.sx = m.x + Math.sin(m.a) * 1.9;
            m.sz = m.z + Math.cos(m.a) * 1.9;
            this.emit({ t: 'windup', x: m.sx, z: m.sz, id: m.id });
          }
          break;
        }
        case 'windup':
          m.t -= dt;
          if (m.t <= 0) {
            this.emit({ t: 'slam', x: m.sx, z: m.sz, id: m.id });
            if (dist(p.x, p.z, m.sx, m.sz) < 1.5 + TUNING.bodyR * 0.5) this.hurt(m.sx, m.sz - 0.5, 'CLAWED!');
            m.state = 'stuck';
            m.t = 1.7;
          }
          break;
        case 'stuck':
        case 'hurt':
          m.t -= dt;
          if (m.t <= 0) m.state = 'walk';
          break;
        case 'flee':
          m.t += dt;
          m.z -= 7 * dt;
          m.a += 12 * dt;
          break;
      }
      if (m.state !== 'flee') {
        m.x = clamp(m.x, -ARENA.hw - 1, ARENA.hw + 1);
        m.z = clamp(m.z, ARENA.zMin - 2, ARENA.zMax);
      }
    }
    // keep them from stacking
    for (let i = 0; i < this.minions.length; i++) {
      for (let j = i + 1; j < this.minions.length; j++) {
        const a = this.minions[i];
        const b = this.minions[j];
        if (a.state === 'flee' || b.state === 'flee') continue;
        const d = dist(a.x, a.z, b.x, b.z);
        if (d < 2.2 && d > 1e-3) {
          const push = (2.2 - d) / 2;
          const nx = (a.x - b.x) / d;
          const nz = (a.z - b.z) / d;
          a.x += nx * push;
          a.z += nz * push;
          b.x -= nx * push;
          b.z -= nz * push;
        }
      }
    }
    this.minions = this.minions.filter((m) => !(m.state === 'flee' && m.z < ARENA.zMin - 6));
  }

  // ---------- the Admiral ----------

  private bossLine(kind: keyof typeof BOSS_LINES) {
    this.emit({ t: 'bossLine', who: 'admiral', text: this.pick(BOSS_LINES[kind]) });
  }

  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b) return;
    const p = this.p;
    const lost = BOSS_SCREWS - b.screws; // 0..5, the angrier the faster
    const speed = 1 + lost * 0.08;
    b.t -= dt * speed;
    b.anger = Math.max(0, b.anger - dt);
    const toward = (x: number, z: number, y: number, rate: number) => {
      const k = 1 - Math.exp(-rate * dt);
      b.cx += (x - b.cx) * k;
      b.cz += (z - b.cz) * k;
      b.cy += (y - b.cy) * k;
    };
    switch (b.state) {
      case 'idle':
        toward(BOSS_HOME.x, BOSS_HOME.z, BOSS_HOME.y, 3);
        if (b.screws <= 2 && !b.adds) {
          b.adds = true;
          this.bossLine('adds');
          this.spawnMinion(-8, ARENA.zMin - 1);
          this.spawnMinion(8, ARENA.zMin - 1);
        }
        if (b.t <= 0) {
          const atk = BOSS_PATTERN[b.step % BOSS_PATTERN.length];
          b.step++;
          if (atk === 'slam') {
            b.state = 'track';
            b.t = 1.3;
            this.bossLine('slam');
          } else if (atk === 'bubbles') {
            b.state = 'bubbles';
            b.t = 2.6;
            this.bossLine('bubbles');
            const n = 7 + lost;
            for (let i = 0; i < n; i++) this.addBlast('bubble', this.r(-ARENA.hw, ARENA.hw), this.r(ARENA.zMin, ARENA.zMax), 1.25, 1.3 + i * 0.12);
            this.addBlast('bubble', p.x, p.z, 1.25, 1.2);
          } else {
            b.state = 'waves';
            b.sub = lost >= 3 ? 3 : 2;
            b.subT = 0;
            b.t = 99;
            this.bossLine('waves');
          }
        }
        break;
      case 'track':
        toward(p.x, p.z, 3.6, 5);
        if (b.t <= 0) {
          b.state = 'lock';
          b.t = 0.5;
          this.emit({ t: 'windup', x: b.cx, z: b.cz, id: -1 });
        }
        break;
      case 'lock':
        b.cy += (6.5 - b.cy) * (1 - Math.exp(-6 * dt));
        if (b.t <= 0) {
          b.cy = 0;
          this.emit({ t: 'bigSlam', x: b.cx, z: b.cz });
          if (dist(p.x, p.z, b.cx, b.cz) < 2.3 + TUNING.bodyR * 0.5) this.hurt(b.cx, b.cz, 'MEGA-CLAWED!');
          b.state = 'stuck';
          b.t = Math.max(1.7, 2.8 - lost * 0.2);
          // the screw pops out on the side of the claw that faces the camera
          b.screwX = clamp(b.cx, -ARENA.hw + 0.5, ARENA.hw - 0.5);
          b.screwZ = clamp(b.cz + 1.5, ARENA.zMin, ARENA.zMax);
        }
        break;
      case 'stuck':
        b.cy = 0;
        if (b.t <= 0) {
          b.state = 'retract';
          b.t = 0.6;
        }
        break;
      case 'hurt':
        toward(b.cx, b.cz, 3, 4);
        if (b.t <= 0) {
          if (b.screws <= 0) {
            b.state = 'dead';
            this.emit({ t: 'bossDown' });
          } else {
            b.state = 'idle';
            b.t = 1.2;
          }
        }
        break;
      case 'retract':
        toward(BOSS_HOME.x, BOSS_HOME.z, BOSS_HOME.y, 4);
        if (b.t <= 0) {
          b.state = 'idle';
          b.t = 1.3;
        }
        break;
      case 'bubbles':
        toward(BOSS_HOME.x, BOSS_HOME.z, BOSS_HOME.y + Math.sin(this.time * 8) * 0.5, 3);
        if (b.t <= 0) {
          b.state = 'idle';
          b.t = 1.2;
        }
        break;
      case 'waves':
        toward(BOSS_HOME.x, BOSS_HOME.z, BOSS_HOME.y, 3);
        b.subT -= dt;
        if (b.subT <= 0 && b.sub > 0) {
          b.sub--;
          b.subT = 1.9;
          this.addWave(b.sub === 0 && lost >= 3 ? 1 : 2);
          this.emit({ t: 'bigSlam', x: BOSS_HOME.x, z: ARENA.zMin - 2 });
        }
        if (b.sub <= 0 && b.subT <= 0) {
          b.state = 'idle';
          b.t = 1.8;
        }
        break;
      case 'dead':
        b.cy = Math.max(0, b.cy - dt * 4);
        break;
    }
  }

  // ---------- who spawns what, when ----------

  private chapterDirector(dt: number) {
    const p = this.p;
    if (this.chapter === 0) {
      if (this.stats.freed >= 2 || this.chapterTime > 25) {
        this.gullT -= dt;
        if (this.gullT <= 0) {
          this.gullT = this.r(3.2, 5.2);
          this.addBlast('gull', p.x + p.vx * 0.35, p.z + p.vz * 0.35, 1.35, 1.35);
          this.emit({ t: 'gull', text: this.pick(GULL_LINES) });
        }
      }
    } else if (this.chapter === 1) {
      const alive = this.minions.filter((m) => m.state !== 'flee').length;
      const maxAlive = this.minionsDown >= 4 ? 3 : 2;
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive < maxAlive && this.minionsSpawned < MINION_GOAL) {
        this.spawnMinion();
        this.spawnT = 2.4;
      }
      if (this.minionsDown >= 1) {
        this.waveT -= dt;
        if (this.waveT <= 0) {
          this.waveT = this.r(8, 10.5);
          this.addWave(this.minionsDown >= 5 ? 1 : 2);
        }
      }
      if (this.minionsDown >= 3) {
        this.gullT -= dt;
        if (this.gullT <= 0) {
          this.gullT = this.r(6, 8);
          this.addBlast('gull', p.x + p.vx * 0.3, p.z + p.vz * 0.3, 1.35, 1.35);
          this.emit({ t: 'gull', text: this.pick(GULL_LINES) });
        }
      }
    }
  }

  private chatter(dt: number) {
    this.chatterT -= dt;
    if (this.chatterT > 0) return;
    this.chatterT = this.r(4.5, 7.5);
    const d = this.pick(this.doubters);
    const def = DOUBTERS.find((x) => x.id === d.id)!;
    this.emit({ t: 'say', who: d.id, text: this.pick(d.believes ? def.believe : def.doubt) });
  }

  private checkCleared() {
    if (this.state !== 'play') return;
    const done =
      (this.chapter === 0 && this.rings.length > 0 && this.rings.every((r) => r.freed)) ||
      (this.chapter === 1 && this.minionsDown >= MINION_GOAL) ||
      (this.chapter === 2 && this.boss?.state === 'dead');
    if (!done) return;
    this.blasts = [];
    this.waves = [];
    this.stats.score += this.p.hp * 100;
    if (this.chapter === 2) this.minions.forEach((m) => (m.state = 'flee'));
    if (this.chapter >= CHAPTERS.length - 1) {
      this.state = 'won';
      for (const d of this.doubters) d.believes = true;
      this.emit({ t: 'win' });
    } else {
      this.state = 'cutscene';
      this.emit({ t: 'cleared', n: this.chapter });
    }
  }
}
