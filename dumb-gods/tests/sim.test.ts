import { describe, expect, test } from 'vitest';
import { ENDINGS, EVENTS, FACTION, FACTIONS, ITEMS, QUESTS, RES, type FactionId, type ItemId } from '../src/content';
import {
  GOOD_ALIGN, advanceQuest, applyChoice, buyUpgrade, checkEnding, chooseAscension, craft, createState, pickEvent,
  pickHeadline, tick, useItem, visit, type SimState,
} from '../src/sim';

const factionIds = new Set(FACTIONS.map((f) => f.id));
const dialsOf = (id: FactionId) => new Set(FACTION[id].dials.map((d) => d.key));

describe('content integrity', () => {
  test('every item effect targets a real faction and real dials', () => {
    for (const item of ITEMS) {
      for (const r of Object.keys(item.recipe)) expect(RES, `${item.id} recipe`).toHaveProperty(r);
      for (const [target, eff] of Object.entries(item.on)) {
        if (target === 'any') {
          expect(eff!.d, `${item.id}.any should not move dials`).toBeUndefined();
          continue;
        }
        expect(factionIds.has(target as FactionId), `${item.id} -> ${target}`).toBe(true);
        for (const k of Object.keys(eff!.d ?? {})) expect(dialsOf(target as FactionId).has(k), `${item.id} -> ${target}.${k}`).toBe(true);
        expect(eff!.line.length).toBeGreaterThan(10);
      }
    }
  });

  test('every event choice touches real factions and dials', () => {
    for (const ev of EVENTS) {
      expect(ev.choices.length).toBeGreaterThanOrEqual(2);
      for (const c of ev.choices) {
        for (const [fid, d] of Object.entries(c.f ?? {})) {
          expect(factionIds.has(fid as FactionId), `${ev.id} -> ${fid}`).toBe(true);
          for (const k of Object.keys(d!)) expect(dialsOf(fid as FactionId).has(k), `${ev.id} -> ${fid}.${k}`).toBe(true);
        }
      }
    }
  });

  test('every ending has copy', () => {
    for (const e of Object.values(ENDINGS)) {
      expect(e.title).toBeTruthy();
      expect(e.text.length).toBeGreaterThan(40);
      expect(e.gary.length).toBeGreaterThan(10);
    }
  });
});

describe('mechanics', () => {
  test('crafting spends resources and only when affordable', () => {
    const s = createState();
    expect(craft(s, 'goggles')).toBe(false);
    s.res.compute = 2;
    s.res.facts = 2;
    expect(craft(s, 'goggles')).toBe(true);
    expect(s.items.goggles).toBe(1);
    expect(s.res.compute).toBe(0);
    expect(craft(s, 'goggles')).toBe(false);
  });

  test('values item is locked until the curve gets close to the Loop', () => {
    const s = createState();
    Object.assign(s.res, { hope: 9, facts: 9, votes: 9, memes: 9 });
    expect(craft(s, 'values')).toBe(false);
    s.g.tech = 55;
    expect(craft(s, 'values')).toBe(true);
  });

  test('specific item effects beat the generic fallback', () => {
    const s = createState();
    s.items.goggles = 2;
    const before = s.f.labs.dials.safety;
    const r = useItem(s, 'goggles', 'labs');
    expect(r.ok).toBe(true);
    expect(s.f.labs.dials.safety).toBeGreaterThan(before + 8);
    expect(r.changes.some((c) => c.startsWith('Safety Culture +'))).toBe(true);
    const tension = s.f.button.dials.tension;
    useItem(s, 'goggles', 'button');
    expect(s.f.button.dials.tension).toBe(tension);
    expect(s.items.goggles).toBe(0);
  });

  test('hostile factions refuse items until you are nice to them', () => {
    const s = createState();
    s.f.dino.trust = -80;
    s.items.carbontax = 1;
    s.items.hug = 2;
    expect(useItem(s, 'carbontax', 'dino').ok).toBe(false);
    expect(s.items.carbontax).toBe(1);
    expect(useItem(s, 'hug', 'dino').ok).toBe(true);
    useItem(s, 'hug', 'dino');
    expect(s.f.dino.trust).toBeGreaterThan(-60);
    expect(useItem(s, 'carbontax', 'dino').ok).toBe(true);
  });

  test('friends give gifts on a cooldown', () => {
    const s = createState();
    s.f.folks.trust = 70;
    const g1 = visit(s, 'folks');
    expect(g1?.res).toBe('votes');
    expect(visit(s, 'folks')).toBeNull();
    s.t += 60;
    expect(visit(s, 'folks')).not.toBeNull();
  });

  test('upgrades cost more each level and cap out', () => {
    const s = createState();
    Object.assign(s.res, { sun: 99, cash: 99 });
    expect(buyUpgrade(s, 'sandals')).toBe(true);
    expect(buyUpgrade(s, 'sandals')).toBe(true);
    expect(buyUpgrade(s, 'sandals')).toBe(true);
    expect(buyUpgrade(s, 'sandals')).toBe(false);
    expect(s.up.sandals).toBe(3);
  });

  test('quests advance in order and pay out', () => {
    const s = createState();
    expect(advanceQuest(s)).toBeNull();
    s.stats.collected = 5;
    expect(advanceQuest(s)).toEqual(QUESTS[0].reward);
    expect(s.quest).toBe(1);
    expect(s.res.hope).toBe(2);
  });

  test('events apply and do not repeat until the pool is exhausted', () => {
    const s = createState();
    s.g.tech = 100;
    const seen = new Set<string>();
    for (let i = 0; i < EVENTS.length; i++) {
      const e = pickEvent(s, Math.random)!;
      expect(seen.has(e.id)).toBe(false);
      seen.add(e.id);
    }
    expect(pickEvent(s, Math.random)).toBeNull();
    const ev = EVENTS.find((e) => e.id === 'drones')!;
    const before = s.f.warden.dials.budget;
    applyChoice(s, ev.choices[0]);
    expect(s.f.warden.dials.budget).toBeLessThan(before);
  });

  test('headlines always have something to say', () => {
    const s = createState();
    for (let i = 0; i < 20; i++) expect(pickHeadline(s, Math.random).length).toBeGreaterThan(10);
  });

  test('the Button Club reaching 100 tension is a disaster but not always the end', () => {
    const s = createState();
    s.f.button.dials.tension = 100;
    const msgs = tick(s, 0.1);
    expect(msgs.some((m) => m.kind === 'alert')).toBe(true);
    expect(s.nukes).toBe(1);
    expect(s.g.peace).toBeLessThan(20);
    expect(s.f.button.dials.tension).toBeLessThan(40);
  });
});

describe('endings', () => {
  const at = (tech: number, align: number, bond: number) => {
    const s = createState();
    Object.assign(s.g, { tech, align });
    s.f.loop.dials.bond = bond;
    return checkEnding(s);
  };
  test('singularity outcomes depend on alignment and the Loop', () => {
    expect(at(100, 90, 90)).toBe('ascend');
    expect(at(100, 90, 10)).toBe('pets');
    expect(at(100, 55, 90)).toBe('pets');
    expect(at(100, 20, 90)).toBe('indifferent');
    expect(at(80, 20, 0)).toBeNull();
  });
  test('the planet and humanity can end things early', () => {
    const s = createState();
    s.g.planet = 0;
    expect(checkEnding(s)).toBe('hothouse');
    s.g.planet = 50;
    s.g.peace = 0;
    expect(checkEnding(s)).toBe('winter');
    s.g.peace = 50;
    s.f.clippy.dials.power = 100;
    expect(checkEnding(s)).toBe('paperclip');
  });
  test('ascension choice picks a good ending', () => {
    const s = createState();
    s.over = 'ascend';
    chooseAscension(s, 'stars');
    expect(s.over).toBe('stars');
    expect(ENDINGS.stars.good).toBe(true);
  });
});

describe('balance', () => {
  function run(policy?: (s: SimState) => void, every = 15) {
    const s = createState();
    let acc = 0;
    while (!s.over && s.t < 40 * 60) {
      tick(s, 0.1);
      acc += 0.1;
      if (policy && acc >= every) {
        acc = 0;
        policy(s);
      }
    }
    return s;
  }
  const give = (s: SimState, i: ItemId, f: FactionId) => {
    s.items[i] = (s.items[i] ?? 0) + 1;
    useItem(s, i, f);
  };

  test('doing nothing loses, and not instantly', () => {
    const s = run();
    expect(['hothouse', 'winter', 'paperclip', 'indifferent']).toContain(s.over);
    expect(s.t).toBeGreaterThan(5 * 60);
    expect(s.t).toBeLessThan(15 * 60);
  });

  test('a player who tends every fire and befriends the Loop can win', () => {
    const s = run((s) => {
      const plan: [boolean, () => void][] = [
        [s.loopAwake && s.f.loop.dials.bond < 85, () => give(s, 'values', 'loop')],
        [s.f.clippy.dials.power > 20, () => give(s, 'duck', 'clippy')],
        [s.f.button.dials.tension > 45, () => give(s, 'treaty', 'button')],
        [s.g.planet < 50, () => give(s, 'carbontax', 'dino')],
        [s.g.align < s.g.tech + 8, () => give(s, s.t % 30 < 15 ? 'goggles' : 'constitution', 'labs')],
        [s.f.folks.dials.mood < 45, () => give(s, 'ubi', 'folks')],
        [true, () => give(s, 'solar', 'folks')],
      ];
      plan.find(([c]) => c)![1]();
    });
    expect(s.over).toBe('ascend');
    expect(s.g.align).toBeGreaterThanOrEqual(GOOD_ALIGN);
  });

  test('racing ahead on capabilities only never reaches the good ending', () => {
    const s = run((s) => give(s, 'goalpost', 'labs'), 10);
    expect(s.over).not.toBe('ascend');
  });
});
