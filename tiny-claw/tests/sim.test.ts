import { describe, expect, it } from 'vitest';
import { ARENA, BOSS_SCREWS, type Input, MINION_GOAL, NO_INPUT, Sim, TUNING } from '../src/sim';
import { CHAPTERS, DOUBTERS, INTRO, SPEAKERS, rankFor } from '../src/content';

const DT = 1 / 60;

function run(sim: Sim, seconds: number, input: Input | ((s: Sim) => Input) = NO_INPUT) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n && sim.state === 'play'; i++) sim.step(DT, typeof input === 'function' ? input(sim) : input);
}

function playing(ch = 0, seed = 1) {
  const s = new Sim(seed);
  s.start(ch);
  s.go();
  return s;
}

/**
 * A decent but not superhuman player: chases the objective, flanks minions,
 * scuttles into wave gaps, sidesteps telegraphs and pinches screws.
 */
function bot(s: Sim): Input {
  const p = s.p;
  let tx = p.x;
  let tz = p.z;
  let pinch = false;
  let dash = false;
  const near = (x: number, z: number) => Math.hypot(p.x - x, p.z - z);

  if (s.chapter === 0) {
    const ring = s.rings.filter((r) => !r.freed).sort((a, b) => near(a.x, a.z) - near(b.x, b.z))[0];
    if (ring) {
      tx = ring.x - 0.3;
      tz = ring.z;
      pinch = near(ring.x, ring.z) < 1.6;
    }
  } else if (s.chapter === 1) {
    const m = s.minions.filter((m) => m.state !== 'flee').sort((a, b) => near(a.x, a.z) - near(b.x, b.z))[0];
    if (m) {
      // get to the side opposite the one it's facing toward
      const px = Math.cos(m.a);
      const pz = -Math.sin(m.a);
      const side = (p.x - m.x) * px + (p.z - m.z) * pz >= 0 ? 1 : -1;
      tx = m.x + px * side * 1.9 - Math.sin(m.a) * 0.8;
      tz = m.z + pz * side * 1.9 - Math.cos(m.a) * 0.8;
      if (m.state === 'stuck') {
        tx = m.x + px * side * 1.6;
        tz = m.z + pz * side * 1.6;
      }
      pinch = near(m.x, m.z) < 2.4;
    } else {
      tx = 0;
      tz = 3;
    }
  } else {
    const b = s.boss!;
    if (b.state === 'stuck') {
      tx = b.screwX - 0.3;
      tz = b.screwZ;
      pinch = near(b.screwX, b.screwZ) < 1.8;
    } else if (b.state === 'track' || b.state === 'lock') {
      // lure it, then run sideways
      tx = b.cx + (p.x < b.cx ? -4 : 4);
      tz = b.cz;
      if (b.state === 'lock' && near(b.cx, b.cz) < 3.2) dash = true;
    } else {
      const m = s.minions.find((m) => m.state !== 'flee');
      if (m) {
        tx = m.x + Math.cos(m.a) * 1.9;
        tz = m.z - Math.sin(m.a) * 1.9;
        pinch = near(m.x, m.z) < 2.3;
      } else {
        tx = 0;
        tz = 1;
      }
    }
  }

  // dodge circles that are about to land
  for (const bl of s.blasts) {
    if (bl.done || bl.t > 0.9) continue;
    const d = near(bl.x, bl.z);
    if (d < bl.r + 0.8) {
      const dir = p.x >= bl.x ? 1 : -1;
      tx = bl.x + dir * (bl.r + 2);
      tz = p.z;
      if (bl.t < 0.3) dash = true;
    }
  }
  for (const m of s.minions) {
    if (m.state === 'windup' && near(m.sx, m.sz) < 2.3) {
      tx = m.sx + (p.x >= m.sx ? 3 : -3);
      tz = p.z;
      if (m.t < 0.3) dash = true;
    }
  }
  // waves win over everything: get in the gap
  const incoming = s.waves.filter((w) => w.z < p.z + 0.6 && !w.hit).sort((a, b) => b.z - a.z)[0];
  for (const w of incoming ? [incoming] : []) {
    if (p.z - w.z < 5) {
      const g = [...w.gaps].sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
      if (g) {
        tx = g.x;
        tz = p.z;
        if (Math.abs(g.x - p.x) > 3) dash = true;
      }
    }
  }

  const dx = tx - p.x;
  const dz = tz - p.z;
  return {
    mx: Math.abs(dx) > 0.15 ? Math.max(-1, Math.min(1, dx * 2)) : 0,
    mz: Math.abs(dz) > 0.15 ? Math.max(-1, Math.min(1, -dz * 2)) : 0,
    pinch: pinch && s.time % 0.25 < DT * 1.5,
    dash: dash && p.dashCd <= 0,
  };
}

describe('crab physics', () => {
  it('scuttles sideways way faster than forward', () => {
    const a = playing();
    run(a, 0.5, { ...NO_INPUT, mx: 1 });
    const side = Math.abs(a.p.x - 0);
    const b = playing();
    const z0 = b.p.z;
    run(b, 0.5, { ...NO_INPUT, mz: 1 });
    const fwd = Math.abs(b.p.z - z0);
    expect(side).toBeGreaterThan(fwd * 3);
    expect(b.p.z).toBeLessThan(z0); // "up" goes toward the sea
  });

  it('stays inside the beach', () => {
    const s = playing();
    run(s, 5, { ...NO_INPUT, mx: 1, mz: -1 });
    expect(s.p.x).toBeLessThanOrEqual(ARENA.hw);
    expect(s.p.z).toBeLessThanOrEqual(ARENA.zMax);
  });

  it('dashes sideways and is untouchable while dashing', () => {
    const s = playing();
    const x0 = s.p.x;
    s.addBlast('gull', s.p.x, s.p.z, 1, 0.05);
    s.step(DT, { ...NO_INPUT, dash: true, mx: 1 });
    for (let i = 0; i < 5; i++) s.step(DT, NO_INPUT);
    expect(s.p.hp).toBe(TUNING.maxHp);
    expect(s.p.x - x0).toBeGreaterThan(1.5);
    expect(s.stats.dashes).toBe(1);
  });

  it('side to side charges the Mega Snip', () => {
    const s = playing();
    let dir = 1;
    for (let i = 0; i < 12 && !s.p.wiggle; i++) {
      run(s, 0.15, { ...NO_INPUT, mx: dir });
      dir = -dir;
    }
    expect(s.p.wiggle).toBe(true);
    expect(s.drain().some((e) => e.t === 'wiggle')).toBe(true);
    s.step(DT, { ...NO_INPUT, pinch: true });
    expect(s.p.wiggle).toBe(false);
    expect(s.stats.megas).toBe(1);
  });

  it('slow wiggling does not count', () => {
    const s = playing();
    let dir = 1;
    for (let i = 0; i < 12; i++) {
      run(s, 1, { ...NO_INPUT, mx: dir });
      dir = -dir;
    }
    expect(s.p.wiggle).toBe(false);
  });

  it('losing all hp ends the run and retry restores the chapter', () => {
    const s = playing(1);
    for (let i = 0; i < TUNING.maxHp; i++) {
      s.p.iframes = 0;
      s.hurt(s.p.x + 1, s.p.z, 'test');
    }
    expect(s.state).toBe('lost');
    expect(s.drain().some((e) => e.t === 'lose')).toBe(true);
    s.retry();
    expect(s.chapter).toBe(1);
    expect(s.p.hp).toBe(TUNING.maxHp);
    expect(s.followers.length).toBeGreaterThan(0);
  });
});

describe('chapter 1: rings', () => {
  it('three snips free a critter, who joins the conga line', () => {
    const s = playing();
    const r = s.rings[0];
    s.p.x = r.x - 0.5;
    s.p.z = r.z;
    for (let i = 0; i < 3; i++) run(s, 0.3, { ...NO_INPUT, pinch: true });
    expect(r.freed).toBe(true);
    expect(s.followers).toContain(r.critter);
  });

  it('pinching thin air is a miss', () => {
    const s = playing();
    s.p.x = 11;
    s.p.z = 7;
    s.step(DT, { ...NO_INPUT, pinch: true });
    expect(s.drain().some((e) => e.t === 'miss')).toBe(true);
  });

  it('freeing every ring clears the chapter', () => {
    const s = playing();
    for (const r of s.rings) {
      s.p.x = r.x;
      s.p.z = r.z;
      s.p.wiggle = true;
      s.step(DT, { ...NO_INPUT, pinch: true });
      s.p.pinchCd = 0;
    }
    expect(s.state).toBe('cutscene');
    expect(s.drain().some((e) => e.t === 'cleared')).toBe(true);
  });
});

describe('chapter 2: the brigade', () => {
  it('big claws block pinches from the front', () => {
    const s = playing(1);
    const m = s.spawnMinion(0, 0);
    m.a = 0; // facing +z, toward the camera
    s.p.x = 0.2;
    s.p.z = 1.9;
    s.chapterTime = 0; // too early to wind up
    s.step(DT, { ...NO_INPUT, pinch: true });
    expect(m.hp).toBe(2);
    expect(s.drain().some((e) => e.t === 'blocked')).toBe(true);
  });

  it('but not from the side', () => {
    const s = playing(1);
    const m = s.spawnMinion(0, 0);
    m.a = 0;
    s.p.x = 1.9;
    s.p.z = 0;
    s.step(DT, { ...NO_INPUT, pinch: true });
    expect(m.hp).toBe(1);
  });

  it('slams hurt, and leave the claw stuck and open', () => {
    const s = playing(1);
    const m = s.spawnMinion(0, 0);
    m.a = 0;
    s.p.x = 0;
    s.p.z = 2.4;
    s.chapterTime = 5;
    run(s, 1.2);
    expect(s.p.hp).toBe(TUNING.maxHp - 1);
    expect(m.state).toBe('stuck');
  });

  it('tide walls hit you unless you are in the gap', () => {
    const s = playing(1);
    s.minionsSpawned = MINION_GOAL; // no minions for this one
    const w = s.addWave(1);
    s.p.z = 0;
    s.p.x = w.gaps[0].x > 0 ? w.gaps[0].x - 6 : w.gaps[0].x + 6;
    run(s, 4);
    expect(s.p.hp).toBe(TUNING.maxHp - 1);

    const t = playing(1);
    t.minionsSpawned = MINION_GOAL;
    const w2 = t.addWave(1);
    t.p.z = 0;
    t.p.x = w2.gaps[0].x;
    run(t, 4);
    expect(t.p.hp).toBe(TUNING.maxHp);
  });
});

describe('chapter 3: the Admiral', () => {
  it('pinching the exposed screw costs him a screw', () => {
    const s = playing(2);
    const b = s.boss!;
    b.t = 0;
    run(s, 0.1); // picks slam
    expect(b.state).toBe('track');
    s.god = true;
    run(s, 3, () => NO_INPUT);
    expect(b.state).toBe('stuck');
    s.p.x = b.screwX - 0.3;
    s.p.z = b.screwZ;
    s.step(DT, { ...NO_INPUT, pinch: true });
    expect(b.screws).toBe(BOSS_SCREWS - 1);
  });

  it('sends in the brigade when he gets desperate', () => {
    const s = playing(2);
    s.god = true;
    s.boss!.screws = 2;
    run(s, 0.1);
    expect(s.minions.length).toBe(2);
  });
});

describe('a bot can finish the game without cheating', () => {
  for (const seed of [1, 2, 3]) {
    it(`seed ${seed}`, () => {
      const s = new Sim(seed);
      let deaths = 0;
      let clock = 0;
      for (let ch = 0; ch < CHAPTERS.length; ch++) {
        s.start(ch);
        s.go();
        while (clock < 900) {
          run(s, 1, bot);
          clock++;
          if (s.state === 'lost') {
            deaths++;
            s.retry();
            s.go();
          }
          if (s.state === 'cutscene' || s.state === 'won') break;
        }
      }
      expect(s.state).toBe('won');
      expect(s.stats.freed).toBe(6);
      expect(s.boss!.screws).toBe(0);
      expect(s.doubters.every((d) => d.believes)).toBe(true);
      // beatable, but not instantly
      expect(deaths).toBeLessThan(6);
      expect(s.time).toBeGreaterThan(45);
    });
  }
});

describe('content', () => {
  it('every line has a known speaker', () => {
    const all = [...INTRO, ...CHAPTERS.flatMap((c) => [...c.intro, ...c.outro])];
    for (const [who, text] of all) {
      expect(SPEAKERS[who], who).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it('Gerald holds out until the very end', () => {
    const gerald = DOUBTERS.find((d) => d.id === 'gerald')!;
    expect(gerald.believesFrom).toBeGreaterThanOrEqual(CHAPTERS.length);
  });

  it('ranks go up with score', () => {
    expect(rankFor(0)).not.toBe(rankFor(99999));
  });

  it('the ocean gets stiller as the Admiral wins, and moves again when he loses', () => {
    const s = playing(0);
    const a = s.stillness();
    s.start(2);
    expect(s.stillness()).toBeGreaterThan(a);
    s.state = 'won';
    expect(s.stillness()).toBe(0);
  });
});
