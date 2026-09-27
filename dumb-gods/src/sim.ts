// The world simulation. Pure functions over a plain state object so it can be
// unit-tested and balanced headless. The 3D layer reads it and feeds it player actions.

import {
  ENDINGS, EVENTS, FACTIONS, HEADLINES, ITEM, QUESTS, RES_IDS, UPGRADES,
  type Deltas, type EndingId, type EnemyKind, type EventChoice, type FactionId, type GameEvent, type Global,
  type ItemId, type Res, type UpgradeId,
} from './content';

export const START_YEAR = 2026;
export const SECONDS_PER_YEAR = 30;
export const STAGNATION_YEAR = 2080;
export const LOOP_WAKES_AT = 65;
export const GOOD_ALIGN = 70;
export const PET_ALIGN = 40;
export const GOOD_BOND = 50;

export type Rng = () => number;

export interface FactionState {
  dials: Record<string, number>;
  trust: number;
  visited: boolean;
  giftAt: number;
  hidden: boolean;
}

export interface SimState {
  t: number;
  g: Record<Global, number>;
  f: Record<FactionId, FactionState>;
  res: Record<Res, number>;
  items: Partial<Record<ItemId, number>>;
  up: Record<UpgradeId, number>;
  ubi: number;
  loopAwake: boolean;
  nukes: number;
  quest: number;
  stats: { collected: number; crafted: number; used: number; zapped: number };
  history: { t: number; tech: number; align: number }[];
  over: EndingId | 'ascend' | null;
  seenEvents: string[];
}

export interface SimMsg {
  kind: 'news' | 'alert' | 'good' | 'quest' | 'wake';
  text: string;
}

const START_TRUST: Record<FactionId, number> = {
  garage: 100, labs: 0, button: -10, dino: -20, warden: -20, hats: 10, mega: -10, folks: 20, clippy: 0, loop: 20,
};

export function createState(): SimState {
  const f = {} as Record<FactionId, FactionState>;
  for (const def of FACTIONS) {
    f[def.id] = {
      dials: Object.fromEntries(def.dials.map((d) => [d.key, d.init])),
      trust: START_TRUST[def.id],
      visited: false,
      giftAt: -999,
      hidden: !!def.hidden,
    };
  }
  return {
    t: 0,
    g: { tech: 8, align: 36, planet: 62, peace: 60 },
    f,
    res: Object.fromEntries(RES_IDS.map((r) => [r, 0])) as Record<Res, number>,
    items: {},
    up: { halo: 0, sandals: 0, pockets: 0, charm: 0 },
    ubi: 0,
    loopAwake: false,
    nukes: 0,
    quest: 0,
    stats: { collected: 0, crafted: 0, used: 0, zapped: 0 },
    history: [{ t: 0, tech: 8, align: 36 }],
    over: null,
    seenEvents: [],
  };
}

export const clamp = (v: number, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
export const year = (s: SimState) => START_YEAR + s.t / SECONDS_PER_YEAR;

function dial(s: SimState, id: FactionId, key: string) {
  return s.f[id].dials[key] ?? 0;
}
function bump(s: SimState, id: FactionId, key: string, v: number) {
  const fs = s.f[id];
  if (fs.dials[key] === undefined) return;
  fs.dials[key] = clamp(fs.dials[key] + v);
}
function bumpG(s: SimState, g: Deltas | undefined, mult = 1) {
  if (!g) return;
  for (const k of Object.keys(g) as Global[]) s.g[k] = clamp(s.g[k] + (g[k] ?? 0) * mult);
}

/** Per-second rates for the four global stats. Exported so the HUD can show trend arrows. */
export function rates(s: SimState): Record<Global, number> {
  const speed = dial(s, 'labs', 'speed');
  const safety = dial(s, 'labs', 'safety');
  const tension = dial(s, 'button', 'tension');
  const oil = dial(s, 'dino', 'power');
  const budget = dial(s, 'warden', 'budget');
  const unity = dial(s, 'hats', 'unity');
  const greed = dial(s, 'mega', 'greed');
  const mood = dial(s, 'folks', 'mood');
  const scheming = dial(s, 'clippy', 'power');
  const bond = dial(s, 'loop', 'bond');
  const { tech, align } = s.g;

  // The curve: labs racing, money chasing, and once the Loop is awake, the Loop improving the Loop.
  let dTech = (0.01 + speed * 0.0006 + greed * 0.0001) * (1 + tech / 35);
  if (s.loopAwake) dTech += 0.05;

  // Once the Loop is awake the labs are not really driving anymore. The Loop is.
  let dAlign =
    (safety - 50) * (s.loopAwake ? 0.0009 : 0.0022)
    - (speed / 100) * 0.035 * (1 + tension / 100)
    + (unity - 50) * 0.0006
    + (mood - 50) * 0.0006
    - scheming * 0.0008;
  if (s.loopAwake) dAlign += (bond - 45) * 0.005;

  let dPlanet =
    -(oil * 0.001 + greed * 0.0005 + speed * 0.0003)
    + (100 - oil) * 0.0006;
  if (tech > 60 && align > 60) dPlanet += 0.05;

  const dPeace =
    0.03
    - tension * 0.0009
    - budget * 0.0005
    + (mood - 50) * 0.001
    + (unity - 50) * 0.0005;

  // Stopping the race completely is not free either: nobody believes the other side stopped.
  if (speed < 20) dTech *= 0.5;
  return { tech: dTech, align: dAlign, planet: dPlanet, peace: dPeace };
}

/** Advance the world by dt seconds. Returns things worth telling the player. */
export function tick(s: SimState, dt: number): SimMsg[] {
  const out: SimMsg[] = [];
  if (s.over) return out;
  s.t += dt;

  const r = rates(s);
  s.g.tech = clamp(s.g.tech + r.tech * dt);
  s.g.align = clamp(s.g.align + r.align * dt);
  s.g.planet = clamp(s.g.planet + r.planet * dt);
  s.g.peace = clamp(s.g.peace + r.peace * dt);

  const { tech, align, planet, peace } = s.g;
  const speed = dial(s, 'labs', 'speed');
  const tension = dial(s, 'button', 'tension');
  const greed = dial(s, 'mega', 'greed');
  const unity = dial(s, 'hats', 'unity');
  const mood = dial(s, 'folks', 'mood');

  // Faction drift: the world pushing back on everything you do.
  bump(s, 'labs', 'speed', ((45 + tension * 0.35 + greed * 0.2) - speed) * 0.02 * dt + (speed < 20 ? 0.15 * dt : 0));
  bump(s, 'labs', 'safety', -0.045 * dt * (speed / 60));
  bump(s, 'button', 'tension',
    (0.05 + dial(s, 'warden', 'budget') * 0.0008 + Math.max(0, tech - align) * 0.002 - unity * 0.0006 + (speed < 20 ? 0.1 : 0)) * dt);
  bump(s, 'warden', 'budget', ((40 + tension * 0.5) - dial(s, 'warden', 'budget')) * 0.01 * dt);
  bump(s, 'dino', 'power', (0.02 + greed * 0.0003 - (tech > 50 && align > 50 ? 0.06 : 0)) * dt);
  bump(s, 'mega', 'greed', (0.025 - (mood > 70 ? 0.02 : 0)) * dt);
  bump(s, 'folks', 'mood',
    (-tech * 0.0006 * (1 - s.ubi) + (planet - 50) * 0.0008 + (peace - 50) * 0.0008 - (greed - 50) * 0.0006) * dt);
  bump(s, 'hats', 'unity', ((50 - unity) * 0.004 + (peace - 50) * 0.0005) * dt);
  bump(s, 'clippy', 'power',
    (Math.max(0, tech - align - 5) * 0.006 - (align > tech + 5 ? 0.06 : 0) + (dial(s, 'labs', 'safety') < 25 ? 0.02 : 0)) * dt);
  if (s.loopAwake) {
    bump(s, 'loop', 'bond', (-0.03 + (unity - 50) * 0.0008 + (mood - 50) * 0.0008) * dt);
  }

  // Reveal the schemer once it has something to hide.
  if (s.f.clippy.hidden && (dial(s, 'clippy', 'power') > 14 || tech > 30)) {
    s.f.clippy.hidden = false;
    out.push({ kind: 'wake', text: 'A new "Helpful Assistant" has appeared in the far north. It says it is totally aligned. It says it very often.' });
  }
  if (!s.loopAwake && tech >= LOOP_WAKES_AT) {
    s.loopAwake = true;
    s.f.loop.hidden = false;
    out.push({ kind: 'wake', text: 'THE LOOP IS AWAKE. AI is now improving AI without us. It is floating over the North Pole, deciding what it cares about. Go. Now.' });
  }

  // The Button Club reaching consensus.
  if (dial(s, 'button', 'tension') >= 100) {
    s.nukes++;
    s.g.peace = clamp(s.g.peace - 45);
    s.g.planet = clamp(s.g.planet - 25);
    s.f.button.dials.tension = 35;
    bump(s, 'warden', 'budget', 10);
    bump(s, 'folks', 'mood', -25);
    out.push({ kind: 'alert', text: 'SOMEBODY PRESSED A BUTTON. A "limited exchange." Cities are gone. The Club says it has "learned a lot."' });
  }

  // Sample the curve for the HUD graph.
  const last = s.history[s.history.length - 1];
  if (s.t - last.t >= 5) s.history.push({ t: s.t, tech: s.g.tech, align: s.g.align });

  const end = checkEnding(s);
  if (end) {
    s.over = end;
    s.history.push({ t: s.t, tech: s.g.tech, align: s.g.align });
  }
  return out;
}

export function checkEnding(s: SimState): SimState['over'] {
  if (s.g.planet <= 0) return 'hothouse';
  if (s.g.peace <= 0) return 'winter';
  if (dial(s, 'clippy', 'power') >= 100) return 'paperclip';
  if (s.g.tech >= 100) {
    if (s.g.align >= GOOD_ALIGN && dial(s, 'loop', 'bond') >= GOOD_BOND) return 'ascend';
    if (s.g.align >= PET_ALIGN) return 'pets';
    return 'indifferent';
  }
  if (year(s) >= STAGNATION_YEAR) return 'stagnation';
  return null;
}

export function chooseAscension(s: SimState, choice: 'stars' | 'home' | 'merge') {
  if (s.over === 'ascend') s.over = choice;
}

export function isGoodEnding(e: EndingId) {
  return ENDINGS[e].good;
}

/** A single number for bragging rights. */
export function legacy(s: SimState) {
  return Math.round(s.g.align * 2 + s.g.planet + s.g.peace + s.g.tech - s.nukes * 40);
}

// ---------- crafting ----------

export function canAfford(s: SimState, cost: Partial<Record<Res, number>>) {
  return (Object.keys(cost) as Res[]).every((r) => s.res[r] >= (cost[r] ?? 0));
}
function pay(s: SimState, cost: Partial<Record<Res, number>>) {
  for (const r of Object.keys(cost) as Res[]) s.res[r] -= cost[r] ?? 0;
}

export function itemUnlocked(s: SimState, id: ItemId) {
  return ITEM[id].unlock !== 'loop' || s.loopAwake || s.g.tech >= LOOP_WAKES_AT - 15;
}

export function craft(s: SimState, id: ItemId): boolean {
  const def = ITEM[id];
  if (!itemUnlocked(s, id) || !canAfford(s, def.recipe)) return false;
  pay(s, def.recipe);
  s.items[id] = (s.items[id] ?? 0) + 1;
  s.stats.crafted++;
  return true;
}

export function upgradeCost(s: SimState, id: UpgradeId) {
  const u = UPGRADES.find((x) => x.id === id)!;
  return u.cost(s.up[id]);
}

export function buyUpgrade(s: SimState, id: UpgradeId): boolean {
  const u = UPGRADES.find((x) => x.id === id)!;
  if (s.up[id] >= u.max) return false;
  const cost = u.cost(s.up[id]);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  s.up[id]++;
  return true;
}

export function collect(s: SimState, r: Res, n = 1) {
  s.res[r] += n;
  s.stats.collected += n;
}

// ---------- using items on factions ----------

export function trustMult(s: SimState, id: FactionId) {
  const t = s.f[id].trust;
  return (0.7 + ((t + 100) / 200) * 0.6) * (1 + s.up.charm * 0.1);
}

export interface UseResult {
  ok: boolean;
  line: string;
  changes: string[];
}

export function useItem(s: SimState, item: ItemId, target: FactionId): UseResult {
  const def = ITEM[item];
  if (!s.items[item]) return { ok: false, line: "You don't have one of those.", changes: [] };
  const eff = def.on[target] ?? def.on.any;
  if (!eff) return { ok: false, line: 'Nothing happens.', changes: [] };
  const fs = s.f[target];
  if (fs.trust <= -60 && (eff.trust ?? 0) <= 0) {
    return { ok: false, line: 'Security escorts you out before you can open your bag. They do not trust you. Try something nicer first (a Hug, maybe).', changes: [] };
  }
  s.items[item]! -= 1;
  s.stats.used++;
  const m = trustMult(s, target);
  const changes: string[] = [];
  const before = { ...s.g };
  const beforeD = { ...fs.dials };
  if (eff.d) for (const k of Object.keys(eff.d)) bump(s, target, k, eff.d[k] * m);
  bumpG(s, eff.g, m);
  if (eff.side) for (const fid of Object.keys(eff.side) as FactionId[]) {
    const d = eff.side[fid]!;
    for (const k of Object.keys(d)) bump(s, fid, k, d[k] * m);
  }
  if (eff.trust) fs.trust = clamp(fs.trust + eff.trust * (1 + s.up.charm * 0.15), -100, 100);
  if (item === 'ubi' && target === 'folks') s.ubi = Math.min(1, s.ubi + 0.35);

  const def2 = FACTIONS.find((f) => f.id === target)!;
  for (const d of def2.dials) {
    const diff = fs.dials[d.key] - beforeD[d.key];
    if (Math.abs(diff) >= 0.5) changes.push(`${d.label} ${diff > 0 ? '+' : ''}${Math.round(diff)}`);
  }
  for (const k of Object.keys(s.g) as Global[]) {
    const diff = s.g[k] - before[k];
    if (Math.abs(diff) >= 0.5) changes.push(`${k.toUpperCase()} ${diff > 0 ? '+' : ''}${Math.round(diff)}`);
  }
  if (eff.trust) changes.push(`Trust ${eff.trust > 0 ? '+' : ''}${eff.trust}`);
  return { ok: true, line: eff.line, changes };
}

/** Friends give you stuff. Returns the gift or null. */
export function visit(s: SimState, id: FactionId): { res: Res; n: number } | null {
  const fs = s.f[id];
  if (!fs.visited) {
    fs.visited = true;
    fs.trust = clamp(fs.trust + 5, -100, 100);
  }
  const def = FACTIONS.find((f) => f.id === id)!;
  if (id === 'garage' || fs.trust < 40 || s.t - fs.giftAt < 45) return null;
  fs.giftAt = s.t;
  const n = 2 + Math.floor((fs.trust - 40) / 30);
  s.res[def.gift] += n;
  return { res: def.gift, n };
}

// ---------- events ----------

export function pickEvent(s: SimState, rng: Rng): GameEvent | null {
  const pool = EVENTS.filter((e) => (e.minTech ?? 0) <= s.g.tech && !s.seenEvents.includes(e.id));
  if (!pool.length) {
    s.seenEvents = [];
    return null;
  }
  const e = pool[Math.floor(rng() * pool.length)];
  s.seenEvents.push(e.id);
  return e;
}

export function applyChoice(s: SimState, c: EventChoice) {
  bumpG(s, c.g);
  if (c.f) for (const fid of Object.keys(c.f) as FactionId[]) {
    const d = c.f[fid]!;
    for (const k of Object.keys(d)) bump(s, fid, k, d[k]);
  }
  if (c.res) for (const r of Object.keys(c.res) as Res[]) s.res[r] += c.res[r] ?? 0;
}

// ---------- pests ----------

/** Relative spawn weights for pests, driven by how badly each faction is behaving. */
export function pestWeights(s: SimState): Record<EnemyKind, number> {
  return {
    lobbyist: (dial(s, 'dino', 'power') + dial(s, 'warden', 'budget')) / 200,
    scroll: dial(s, 'mega', 'greed') / 100,
    misinfo: (100 - dial(s, 'hats', 'unity') + dial(s, 'button', 'tension')) / 200,
    agent: s.f.clippy.hidden ? 0 : dial(s, 'clippy', 'power') / 60,
  };
}

/** Pests left alone quietly make things worse. */
export function pestPressure(s: SimState, counts: Record<EnemyKind, number>, dt: number) {
  bump(s, 'dino', 'power', counts.lobbyist * 0.012 * dt);
  bump(s, 'folks', 'mood', -counts.scroll * 0.012 * dt);
  bump(s, 'hats', 'unity', -counts.misinfo * 0.01 * dt);
  bump(s, 'button', 'tension', counts.misinfo * 0.006 * dt);
  bump(s, 'clippy', 'power', counts.agent * 0.012 * dt);
}

// ---------- quests ----------

export function questDone(s: SimState): boolean {
  const q = QUESTS[s.quest];
  if (!q) return false;
  switch (q.id) {
    case 'collect': return s.stats.collected >= 5;
    case 'craft': return s.stats.crafted >= 1;
    case 'use': return s.stats.used >= 1;
    case 'zap': return s.stats.zapped >= 3;
    case 'safety': return dial(s, 'labs', 'safety') > 50;
    case 'tension': return dial(s, 'button', 'tension') < 30;
    case 'planet': return s.g.planet > 65;
    case 'align': return s.g.align > s.g.tech && s.g.align > 55;
    case 'loop': return dial(s, 'loop', 'bond') >= 80;
  }
  return false;
}

/** Completes the current quest if possible and pays out. Returns the finished quest's reward. */
export function advanceQuest(s: SimState): Partial<Record<Res, number>> | null {
  if (!questDone(s)) return null;
  const q = QUESTS[s.quest];
  for (const r of Object.keys(q.reward) as Res[]) s.res[r] += q.reward[r] ?? 0;
  s.quest++;
  // The Loop quest only makes sense once it's awake; park before it until then.
  return q.reward;
}

export function questAvailable(s: SimState) {
  const q = QUESTS[s.quest];
  if (!q) return false;
  return q.id !== 'loop' || s.loopAwake;
}

// ---------- headlines ----------

export function pickHeadline(s: SimState, rng: Rng) {
  const view = { g: s.g, f: Object.fromEntries(Object.entries(s.f).map(([k, v]) => [k, v.dials])), year: year(s) };
  const pool = HEADLINES.filter((h) => h.when(view));
  return pool[Math.floor(rng() * pool.length)].text;
}
