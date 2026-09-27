// Every model in the game, built from primitives. No asset files.
import * as THREE from 'three';

let gradientMap: THREE.DataTexture | null = null;
function toonRamp() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map<string, THREE.Material>();
export function toon(color: THREE.ColorRepresentation, opts: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; transparent?: boolean; opacity?: number } = {}) {
  const key = `${new THREE.Color(color).getHexString()}|${opts.emissive ?? ''}|${opts.emissiveIntensity ?? ''}|${opts.opacity ?? ''}`;
  if (!opts.transparent && matCache.has(key)) return matCache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: toonRamp(),
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
  });
  if (!opts.transparent) matCache.set(key, m);
  return m;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  return m;
}

const WHITE = 0xffffff;
const BLACK = 0x161616;

// ---------- eyes ----------

export interface Eye {
  root: THREE.Object3D;
  pupil: THREE.Object3D;
  vx: number; // googly spring state
  vy: number;
  ox: number;
  oy: number;
}

function googlyEye(r: number): Eye {
  const root = new THREE.Group();
  const ball = mesh(new THREE.SphereGeometry(r, 16, 12), toon(WHITE));
  root.add(ball);
  const pupil = mesh(new THREE.SphereGeometry(r * 0.52, 12, 10), toon(BLACK), false);
  pupil.position.z = r * 0.62;
  pupil.scale.z = 0.5;
  root.add(pupil);
  const shine = mesh(new THREE.SphereGeometry(r * 0.16, 8, 6), toon(WHITE, { emissive: WHITE, emissiveIntensity: 0.6 }), false);
  shine.position.set(r * 0.18, r * 0.2, r * 0.85);
  root.add(shine);
  return { root, pupil, vx: 0, vy: 0, ox: 0, oy: 0 };
}

export function updateEyes(eyes: Eye[], dt: number, ax: number, ay: number, r: number) {
  // googly: pupils lag behind motion on a sloppy spring
  for (const e of eyes) {
    e.vx += (-e.ox * 60 - e.vx * 5 - ax * 0.8) * dt;
    e.vy += (-e.oy * 60 - e.vy * 5 - ay * 0.8) * dt;
    e.ox += e.vx * dt;
    e.oy += e.vy * dt;
    const len = Math.hypot(e.ox, e.oy);
    const max = r * 0.45;
    if (len > max) {
      e.ox = (e.ox / len) * max;
      e.oy = (e.oy / len) * max;
      e.vx *= -0.4;
      e.vy *= -0.4;
    }
    e.pupil.position.x = e.ox;
    e.pupil.position.y = e.oy;
  }
}

// ---------- claws ----------

export interface Claw {
  root: THREE.Group;
  hinge: THREE.Group;
  palm: THREE.Mesh;
}

export function makeClaw(scale: number, color: THREE.ColorRepresentation, tip: THREE.ColorRepresentation = 0xfff1e0): Claw {
  const root = new THREE.Group();
  const m = toon(color);
  const palm = mesh(new THREE.SphereGeometry(0.5, 20, 14), m);
  palm.scale.set(0.8, 0.62, 1.05);
  root.add(palm);
  const lower = mesh(new THREE.ConeGeometry(0.2, 0.85, 12), m);
  lower.rotation.x = Math.PI / 2;
  lower.position.set(0, -0.12, 0.72);
  root.add(lower);
  const lowerTip = mesh(new THREE.ConeGeometry(0.09, 0.22, 8), toon(tip));
  lowerTip.rotation.x = Math.PI / 2;
  lowerTip.position.set(0, -0.12, 1.2);
  root.add(lowerTip);
  const hinge = new THREE.Group();
  hinge.position.set(0, 0.12, 0.3);
  const upper = mesh(new THREE.ConeGeometry(0.22, 0.95, 12), m);
  upper.rotation.x = Math.PI / 2;
  upper.position.set(0, 0.05, 0.45);
  hinge.add(upper);
  const upperTip = mesh(new THREE.ConeGeometry(0.1, 0.24, 8), toon(tip));
  upperTip.rotation.x = Math.PI / 2;
  upperTip.position.set(0, 0.05, 0.98);
  hinge.add(upperTip);
  root.add(hinge);
  root.scale.setScalar(scale);
  return { root, hinge, palm };
}

// ---------- crabs ----------

export interface CrabOpts {
  color: number;
  belly?: number;
  size?: number;
  bigClaw?: number; // scale of the right claw
  smallClaw?: number;
  shades?: boolean;
  brows?: boolean;
  blush?: boolean;
}

export interface CrabRig {
  root: THREE.Group; // moves around the world
  body: THREE.Group; // bobs and wobbles
  legs: { hip: THREE.Group; knee: THREE.Group; side: number; phase: number }[];
  eyes: Eye[];
  eyeR: number;
  clawR: Claw;
  clawL: Claw;
  armR: THREE.Group;
  armL: THREE.Group;
  glow: THREE.Mesh;
  walk: number;
  size: number;
}

export function makeCrab(o: CrabOpts): CrabRig {
  const size = o.size ?? 1;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shell = toon(o.color);
  const belly = toon(o.belly ?? 0xffd2b0);

  const carapace = mesh(new THREE.SphereGeometry(0.55, 28, 18), shell);
  carapace.scale.set(1.12, 0.58, 0.86);
  carapace.position.y = 0.5;
  body.add(carapace);
  const under = mesh(new THREE.SphereGeometry(0.5, 20, 12), belly);
  under.scale.set(1.05, 0.35, 0.8);
  under.position.y = 0.38;
  body.add(under);
  // freckles on top
  for (const [x, z, r] of [
    [-0.22, -0.12, 0.07],
    [0.2, -0.18, 0.06],
    [0.02, -0.28, 0.05],
    [0.32, 0.02, 0.045],
    [-0.35, 0.05, 0.05],
  ]) {
    const f = mesh(new THREE.SphereGeometry(r, 8, 6), toon(new THREE.Color(o.color).multiplyScalar(0.75)), false);
    f.scale.y = 0.35;
    f.position.set(x, 0.8, z);
    body.add(f);
  }

  // eyes on stalks
  const eyeR = 0.13;
  const eyes: Eye[] = [];
  for (const s of [-1, 1]) {
    const stalk = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.42, 8), shell);
    stalk.position.set(s * 0.17, 0.88, 0.28);
    stalk.rotation.z = -s * 0.18;
    body.add(stalk);
    const e = googlyEye(eyeR);
    e.root.position.set(s * 0.21, 1.12, 0.3);
    body.add(e.root);
    eyes.push(e);
    if (o.brows) {
      const brow = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), toon(BLACK), false);
      brow.position.set(s * 0.21, 1.27, 0.38);
      brow.rotation.z = s * 0.45;
      body.add(brow);
    }
  }
  if (o.shades) {
    const shades = new THREE.Group();
    for (const s of [-1, 1]) {
      const lens = mesh(new THREE.BoxGeometry(0.26, 0.14, 0.04), toon(0x111122, { emissive: 0x223355, emissiveIntensity: 0.4 }), false);
      lens.position.set(s * 0.21, 0, 0);
      shades.add(lens);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), toon(0x111111), false);
    shades.add(bridge);
    shades.position.set(0, 1.13, 0.44);
    body.add(shades);
  }

  // face
  const smile = mesh(new THREE.TorusGeometry(0.09, 0.018, 6, 14, Math.PI), toon(0x5a1a10), false);
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.55, 0.47);
  body.add(smile);
  if (o.blush) {
    for (const s of [-1, 1]) {
      const cheek = mesh(new THREE.CircleGeometry(0.07, 14), toon(0xff8aa0, { emissive: 0xff5577, emissiveIntensity: 0.25 }), false);
      cheek.position.set(s * 0.26, 0.56, 0.44);
      cheek.rotation.y = s * 0.5;
      body.add(cheek);
    }
  }

  // legs: three a side
  const legs: CrabRig['legs'] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.5, 0.45, 0.15 - i * 0.22);
      hip.rotation.y = side * (i - 1) * 0.35;
      const upper = mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.42, 6), shell);
      upper.rotation.z = side * (Math.PI / 2 - 0.5);
      upper.position.set(side * 0.18, 0.1, 0);
      hip.add(upper);
      const knee = new THREE.Group();
      knee.position.set(side * 0.36, 0.2, 0);
      const lower = mesh(new THREE.CylinderGeometry(0.02, 0.045, 0.5, 6), shell);
      lower.rotation.z = side * 0.35;
      lower.position.set(side * 0.08, -0.22, 0);
      knee.add(lower);
      hip.add(knee);
      body.add(hip);
      legs.push({ hip, knee, side, phase: i * 2.1 + (side > 0 ? Math.PI : 0) });
    }
  }

  // arms and claws: the right one is "the big one", Sidney's is not
  const armR = new THREE.Group();
  armR.position.set(0.42, 0.5, 0.3);
  const armRMesh = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 6), shell);
  armRMesh.rotation.x = Math.PI / 2 - 0.4;
  armRMesh.position.set(0.05, 0.02, 0.12);
  armR.add(armRMesh);
  const clawR = makeClaw(o.bigClaw ?? 0.22, o.color);
  clawR.root.position.set(0.1, 0.08, 0.28);
  armR.add(clawR.root);
  body.add(armR);

  const armL = new THREE.Group();
  armL.position.set(-0.42, 0.5, 0.3);
  const armLMesh = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.24, 6), shell);
  armLMesh.rotation.x = Math.PI / 2 - 0.4;
  armLMesh.position.set(-0.04, 0.02, 0.1);
  armL.add(armLMesh);
  const clawL = makeClaw(o.smallClaw ?? 0.14, o.color);
  clawL.root.position.set(-0.08, 0.06, 0.22);
  armL.add(clawL.root);
  body.add(armL);

  // the Mega Snip glow around the claw
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  clawR.root.add(glow);
  glow.position.z = 0.5;
  glow.scale.setScalar(1 / (o.bigClaw ?? 0.22));

  root.scale.setScalar(size);
  return { root, body, legs, eyes, eyeR, clawR, clawL, armR, armL, glow, walk: 0, size };
}

/** Scuttle animation. speed is ground speed, pinch 0..1 closes the claw. */
export function animateCrab(c: CrabRig, dt: number, speed: number, ax: number, ay: number, pinch: number, t: number) {
  c.walk += dt * Math.min(speed, 12) * 3.2;
  const moving = Math.min(1, speed / 2);
  for (const l of c.legs) {
    const ph = c.walk + l.phase;
    l.hip.rotation.z = l.side * (Math.sin(ph) * 0.45 * moving + 0.05);
    l.knee.rotation.z = l.side * Math.max(0, Math.cos(ph)) * 0.5 * moving;
  }
  c.body.position.y = Math.abs(Math.sin(c.walk * 2)) * 0.06 * moving + Math.sin(t * 2.2) * 0.01;
  c.body.rotation.z = Math.sin(c.walk) * 0.08 * moving;
  const open = 0.55 - pinch * 0.6 + Math.sin(t * 3) * 0.05;
  c.clawR.hinge.rotation.x = -Math.max(0, open);
  c.clawL.hinge.rotation.x = -Math.max(0, 0.35 + Math.sin(t * 2.3) * 0.1);
  c.armR.rotation.x = -pinch * 0.6;
  updateEyes(c.eyes, dt, ax, ay, c.eyeR);
}

export function makeSidney() {
  return makeCrab({ color: 0xff6a3d, belly: 0xffd9b8, size: 1.45, bigClaw: 0.2, smallClaw: 0.12, blush: true });
}

export function makeBrute() {
  const c = makeCrab({ color: 0x6d4bd8, belly: 0xc9b8ff, size: 1.8, bigClaw: 1.25, smallClaw: 0.2, shades: true, brows: true });
  c.clawR.root.position.set(0.55, 0.15, 0.55);
  c.armR.position.x = 0.45;
  return c;
}

// ---------- the Admiral ----------

export interface BossRig {
  root: THREE.Group;
  crab: CrabRig;
  slamClaw: Claw;
  slamArm: THREE.Mesh;
  moonClaw: Claw;
  moonArm: THREE.Mesh;
  screws: THREE.Mesh[];
  looseScrew: THREE.Group;
  shoulderR: THREE.Vector3;
  shoulderL: THREE.Vector3;
}

function hat() {
  const g = new THREE.Group();
  const felt = toon(0x1b1d33);
  const gold = toon(0xf2c14e, { emissive: 0x6b4a00, emissiveIntensity: 0.4 });
  const brim = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.36, 24, 1, false, 0, Math.PI), felt);
  brim.rotation.z = Math.PI / 2;
  brim.rotation.y = Math.PI / 2;
  brim.scale.set(1, 1, 1);
  g.add(brim);
  const trim = mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 24, Math.PI), gold, false);
  trim.position.z = 0.19;
  g.add(trim);
  const trim2 = trim.clone();
  trim2.position.z = -0.19;
  g.add(trim2);
  const cockade = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 16), toon(0xd7263d), false);
  cockade.rotation.x = Math.PI / 2;
  cockade.position.set(0.3, 0.25, 0.2);
  g.add(cockade);
  const plume = mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(WHITE), false);
  plume.scale.set(0.6, 1.6, 0.6);
  plume.position.set(0.32, 0.5, 0.18);
  plume.rotation.z = -0.4;
  g.add(plume);
  return g;
}

export function makeScrew(r = 0.12) {
  const g = new THREE.Group();
  const gold = toon(0xffd166, { emissive: 0x8a5a00, emissiveIntensity: 0.5 });
  const head = mesh(new THREE.CylinderGeometry(r, r, r * 0.5, 16), gold);
  head.rotation.x = Math.PI / 2;
  g.add(head);
  const slot = mesh(new THREE.BoxGeometry(r * 1.6, r * 0.25, r * 0.2), toon(0x3b2a00), false);
  slot.position.z = r * 0.26;
  g.add(slot);
  const shaft = mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.2, r * 2.2, 8), toon(0xb0b0b0));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -r * 1.2;
  g.add(shaft);
  return g;
}

export function makeBoss(): BossRig {
  const root = new THREE.Group();
  const crab = makeCrab({ color: 0xd1343f, belly: 0xffc2a8, size: 5.2, bigClaw: 0.01, smallClaw: 0.01, brows: true });
  crab.armR.visible = false;
  crab.armL.visible = false;
  root.add(crab.root);
  const h = hat();
  h.position.set(0, 1.5, -0.05);
  h.scale.setScalar(0.9);
  crab.body.add(h);
  // monocle
  const mono = mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 20), toon(0xf2c14e), false);
  mono.position.set(0.21, 1.12, 0.44);
  crab.body.add(mono);
  // epaulettes
  for (const s of [-1, 1]) {
    const ep = mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.06, 16), toon(0xf2c14e, { emissive: 0x6b4a00, emissiveIntensity: 0.3 }), false);
    ep.position.set(s * 0.55, 0.78, 0.05);
    ep.rotation.z = s * 0.5;
    crab.body.add(ep);
  }
  // a very proud moustache
  for (const s of [-1, 1]) {
    const m = mesh(new THREE.TorusGeometry(0.1, 0.03, 6, 12, Math.PI * 1.2), toon(0x2a1a14), false);
    m.position.set(s * 0.09, 0.62, 0.48);
    m.rotation.z = s > 0 ? -0.2 : Math.PI + 0.2;
    crab.body.add(m);
  }

  const shell = toon(0xd1343f);
  const slamClaw = makeClaw(2.4, 0xd1343f);
  root.add(slamClaw.root);
  const slamArm = mesh(new THREE.CylinderGeometry(0.28, 0.42, 1, 10), shell);
  root.add(slamArm);
  const moonClaw = makeClaw(2.2, 0xd1343f);
  root.add(moonClaw.root);
  const moonArm = mesh(new THREE.CylinderGeometry(0.3, 0.45, 1, 10), shell);
  root.add(moonArm);

  // screws dotted round the slamming claw: they fall out one by one
  const screws: THREE.Mesh[] = [];
  const screwSpots: [number, number, number][] = [
    [0.38, 0.1, 0.1],
    [-0.38, 0.1, 0.1],
    [0.25, 0.3, -0.2],
    [-0.25, 0.3, -0.2],
    [0, 0.34, 0.25],
  ];
  for (const [x, y, z] of screwSpots) {
    const s = makeScrew(0.07);
    s.position.set(x, y, z);
    s.lookAt(new THREE.Vector3(x * 3, y * 3, z * 3));
    slamClaw.root.add(s);
    screws.push(s as unknown as THREE.Mesh);
  }
  const looseScrew = makeScrew(0.28);
  looseScrew.visible = false;
  root.add(looseScrew);

  return {
    root,
    crab,
    slamClaw,
    slamArm,
    moonClaw,
    moonArm,
    screws,
    looseScrew,
    shoulderR: new THREE.Vector3(2.4, 2.6, -11),
    shoulderL: new THREE.Vector3(-2.6, 3, -11.5),
  };
}

/** Stretch a cylinder between two points. */
export function stretch(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(1, len, 1);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
}

// ---------- the townsfolk ----------

export interface Critter {
  root: THREE.Group;
  eyes: Eye[];
  talk: (amount: number, t: number) => void;
}

function eyesOn(parent: THREE.Object3D, r: number, y: number, z: number, spread: number): Eye[] {
  const out: Eye[] = [];
  for (const s of [-1, 1]) {
    const e = googlyEye(r);
    e.root.position.set(s * spread, y, z);
    parent.add(e.root);
    out.push(e);
  }
  return out;
}

export function makeClam(): Critter {
  const root = new THREE.Group();
  const shellM = toon(0xd9c7a7);
  const bottom = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellM);
  bottom.scale.set(1, 0.45, 0.8);
  bottom.position.y = 0.3;
  root.add(bottom);
  const lid = new THREE.Group();
  lid.position.set(0, 0.3, -0.35);
  const top = mesh(new THREE.SphereGeometry(0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), shellM);
  top.scale.set(1, 0.5, 0.8);
  top.position.z = 0.35;
  lid.add(top);
  for (let i = -3; i <= 3; i++) {
    const ridge = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.9), toon(0xb8a17c), false);
    ridge.position.set(i * 0.14, 0.26, 0.35);
    ridge.rotation.x = -0.35;
    lid.add(ridge);
  }
  root.add(lid);
  const inside = mesh(new THREE.SphereGeometry(0.45, 16, 10), toon(0xffb3a7));
  inside.scale.set(1, 0.3, 0.8);
  inside.position.y = 0.32;
  root.add(inside);
  const eyes = eyesOn(root, 0.11, 0.42, 0.25, 0.16);
  // grumpy brows
  for (const s of [-1, 1]) {
    const b = mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), toon(BLACK), false);
    b.position.set(s * 0.16, 0.56, 0.33);
    b.rotation.z = -s * 0.35;
    root.add(b);
  }
  lid.rotation.x = -0.35;
  return {
    root,
    eyes,
    talk: (a, t) => {
      lid.rotation.x = -0.3 - a * (0.2 + Math.abs(Math.sin(t * 14)) * 0.25);
    },
  };
}

function starShape(outer: number, inner: number) {
  const s = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

export function makeStarfish(): Critter {
  const root = new THREE.Group();
  const star = mesh(
    new THREE.ExtrudeGeometry(starShape(0.7, 0.3), { depth: 0.18, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }),
    toon(0xff9447),
  );
  star.position.set(0, 0.8, -0.1);
  root.add(star);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dot = mesh(new THREE.SphereGeometry(0.04, 6, 4), toon(0xffd29a), false);
    dot.position.set(Math.cos(a) * 0.35, 0.8 + Math.sin(a) * 0.35, 0.18);
    root.add(dot);
  }
  const eyes = eyesOn(root, 0.1, 0.92, 0.2, 0.12);
  const mouth = mesh(new THREE.TorusGeometry(0.07, 0.02, 6, 12, Math.PI), toon(0x7a2a10), false);
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 0.74, 0.2);
  root.add(mouth);
  return {
    root,
    eyes,
    talk: (a, t) => {
      root.rotation.z = Math.sin(t * 6) * 0.15 * a;
      mouth.scale.y = 1 + a * Math.abs(Math.sin(t * 12)) * 1.5;
    },
  };
}

export function makeHermit(): Critter {
  const root = new THREE.Group();
  const cup = mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.8, 20, 1, true), toon(0xf4f4f4));
  (cup.material as THREE.Material).side = THREE.DoubleSide;
  cup.rotation.x = -Math.PI / 2 + 0.25;
  cup.position.set(0, 0.42, -0.25);
  root.add(cup);
  const label = mesh(new THREE.CylinderGeometry(0.4, 0.35, 0.3, 20, 1, true), toon(0x4da3ff));
  label.rotation.copy(cup.rotation);
  label.position.copy(cup.position);
  label.scale.setScalar(1.02);
  root.add(label);
  const strawberry = mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0xff3b5c), false);
  strawberry.position.set(0, 0.62, -0.2);
  root.add(strawberry);
  const face = mesh(new THREE.SphereGeometry(0.3, 16, 12), toon(0xff8c5a));
  face.scale.set(1, 0.8, 0.8);
  face.position.set(0, 0.36, 0.2);
  root.add(face);
  const eyes = eyesOn(root, 0.09, 0.62, 0.3, 0.1);
  for (const s of [-1, 1]) {
    const st = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 6), toon(0xff8c5a), false);
    st.position.set(s * 0.1, 0.5, 0.28);
    root.add(st);
  }
  return {
    root,
    eyes,
    talk: (a, t) => {
      face.position.z = 0.2 + a * Math.abs(Math.sin(t * 10)) * 0.08;
    },
  };
}

export function makePuffer(): Critter {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.position.y = 0.75;
  root.add(bodyG);
  const body = mesh(new THREE.SphereGeometry(0.45, 20, 14), toon(0xffd84d));
  bodyG.add(body);
  const belly = mesh(new THREE.SphereGeometry(0.4, 16, 10), toon(0xfff3c4));
  belly.position.set(0, -0.12, 0.12);
  belly.scale.set(0.9, 0.7, 0.8);
  bodyG.add(belly);
  const spike = new THREE.ConeGeometry(0.04, 0.16, 5);
  const spikeM = toon(0xe0a800);
  for (let i = 0; i < 26; i++) {
    const y = 1 - (i / 25) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996;
    const n = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const s = mesh(spike, spikeM, false);
    s.position.copy(n).multiplyScalar(0.46);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    bodyG.add(s);
  }
  const tail = mesh(new THREE.ConeGeometry(0.2, 0.3, 4), toon(0xffb000));
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -0.55;
  bodyG.add(tail);
  const eyes = eyesOn(bodyG, 0.12, 0.12, 0.36, 0.17);
  const lips = mesh(new THREE.TorusGeometry(0.06, 0.03, 8, 12), toon(0xff6f91), false);
  lips.position.set(0, -0.08, 0.44);
  bodyG.add(lips);
  // glasses: he's a doctor
  for (const s of [-1, 1]) {
    const g = mesh(new THREE.TorusGeometry(0.13, 0.015, 6, 16), toon(0x333333), false);
    g.position.set(s * 0.17, 0.12, 0.47);
    bodyG.add(g);
  }
  return {
    root,
    eyes,
    talk: (a, t) => {
      bodyG.scale.setScalar(1 + a * (0.25 + Math.sin(t * 8) * 0.05));
      bodyG.position.y = 0.75 + Math.sin(t * 2) * 0.08;
    },
  };
}

export function makeTurtle(): Critter {
  const root = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(0.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x3fa34d));
  shell.scale.set(1, 0.75, 1.15);
  shell.position.y = 0.12;
  root.add(shell);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hex = mesh(new THREE.CircleGeometry(0.1, 6), toon(0x2c7a38), false);
    hex.position.set(Math.cos(a) * 0.22, 0.34, Math.sin(a) * 0.26);
    hex.lookAt(hex.position.clone().multiplyScalar(3).setY(1.5));
    root.add(hex);
  }
  const skin = toon(0x9be07a);
  const head = mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
  head.position.set(0, 0.2, 0.5);
  root.add(head);
  for (const [x, z] of [
    [-0.35, 0.3],
    [0.35, 0.3],
    [-0.32, -0.3],
    [0.32, -0.3],
  ]) {
    const f = mesh(new THREE.SphereGeometry(0.1, 8, 6), skin);
    f.scale.set(1.6, 0.4, 0.8);
    f.position.set(x, 0.08, z);
    root.add(f);
  }
  const eyes = eyesOn(head, 0.06, 0.06, 0.13, 0.07);
  return { root, eyes, talk: (a, t) => (head.position.y = 0.2 + a * Math.abs(Math.sin(t * 10)) * 0.05) };
}

export function makeFish(): Critter {
  const root = new THREE.Group();
  const bodyG = new THREE.Group();
  bodyG.position.y = 0.35;
  root.add(bodyG);
  const body = mesh(new THREE.SphereGeometry(0.3, 16, 12), toon(0x3ab4ff));
  body.scale.set(0.7, 1, 1.3);
  bodyG.add(body);
  const stripe = mesh(new THREE.SphereGeometry(0.31, 16, 12), toon(0xffe14d));
  stripe.scale.set(0.72, 1.02, 0.35);
  bodyG.add(stripe);
  const tail = mesh(new THREE.ConeGeometry(0.22, 0.3, 4), toon(0x3ab4ff));
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.45;
  bodyG.add(tail);
  const eyes = eyesOn(bodyG, 0.07, 0.08, 0.3, 0.1);
  return { root, eyes, talk: (a, t) => (bodyG.rotation.z = Math.sin(t * 10) * 0.2 * a) };
}

export function makeSeal(): Critter {
  const root = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), toon(0x9aa7b5));
  body.rotation.x = Math.PI / 2 - 0.5;
  body.position.set(0, 0.3, 0);
  root.add(body);
  const head = mesh(new THREE.SphereGeometry(0.2, 14, 10), toon(0xaab6c4));
  head.position.set(0, 0.55, 0.28);
  root.add(head);
  const nose = mesh(new THREE.SphereGeometry(0.04, 8, 6), toon(BLACK), false);
  nose.position.set(0, 0.52, 0.47);
  root.add(nose);
  const eyes = eyesOn(head, 0.06, 0.06, 0.15, 0.08);
  return { root, eyes, talk: (a, t) => (head.rotation.x = Math.sin(t * 12) * 0.2 * a) };
}

export function makeCritter(kind: string): Critter {
  if (kind === 'fish') return makeFish();
  if (kind === 'seal') return makeSeal();
  return makeTurtle();
}

export function makeDoubter(kind: 'clam' | 'starfish' | 'hermit' | 'puffer'): Critter {
  if (kind === 'clam') return makeClam();
  if (kind === 'starfish') return makeStarfish();
  if (kind === 'hermit') return makeHermit();
  return makePuffer();
}

// ---------- props and hazards ----------

export function makeSixPack() {
  const g = new THREE.Group();
  const m = new THREE.MeshToonMaterial({ color: 0xe8f4ff, gradientMap: toonRamp(), transparent: true, opacity: 0.9 });
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.045, 6, 18), m);
    r.rotation.x = Math.PI / 2 + (i % 2 ? 0.25 : -0.2);
    r.rotation.y = (i % 3) * 0.2;
    r.position.set(((i % 3) - 1) * 0.42, 0.3 + (i % 2) * 0.06, (Math.floor(i / 3) - 0.5) * 0.44);
    r.castShadow = true;
    g.add(r);
    rings.push(r);
  }
  return { root: g, rings };
}

export function makeGull() {
  const root = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.4, 14, 10), toon(WHITE));
  body.scale.set(0.8, 0.8, 1.5);
  root.add(body);
  const head = mesh(new THREE.SphereGeometry(0.28, 12, 10), toon(WHITE));
  head.position.set(0, 0.25, 0.55);
  root.add(head);
  const beak = mesh(new THREE.ConeGeometry(0.08, 0.35, 8), toon(0xffc233));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.2, 0.9);
  root.add(beak);
  const spot = mesh(new THREE.SphereGeometry(0.03, 6, 4), toon(0xff3030), false);
  spot.position.set(0, 0.16, 1.02);
  root.add(spot);
  const eyes = eyesOn(head, 0.08, 0.1, 0.18, 0.14);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    const wing = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), toon(0xb8c4d0));
    wing.position.x = s * 0.6;
    w.add(wing);
    const tip = mesh(new THREE.BoxGeometry(0.4, 0.052, 0.45), toon(0x333a44));
    tip.position.x = s * 1.1;
    w.add(tip);
    w.position.set(s * 0.25, 0.15, 0);
    root.add(w);
    wings.push(w);
  }
  return { root, wings, eyes };
}

export function makeKelp() {
  const g = new THREE.Group();
  const m = toon(0x3dbb5a, { emissive: 0x0a4a16, emissiveIntensity: 0.4 });
  const blades: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.CylinderGeometry(0.02, 0.09, 1, 6, 6);
    const b = mesh(geo, m);
    b.position.set((i - 1.5) * 0.12, 0.5, (i % 2) * 0.1);
    b.scale.set(1, 0.9 + (i % 3) * 0.25, 1);
    g.add(b);
    blades.push(b);
  }
  const bubble = mesh(new THREE.SphereGeometry(0.1, 10, 8), toon(0x8dffb0, { emissive: 0x3dff7a, emissiveIntensity: 0.6 }), false);
  bubble.position.y = 1.2;
  g.add(bubble);
  return { root: g, blades };
}

export function makeTideWall(width: number) {
  const g = new THREE.Group();
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(width, 1.4, 0.9, Math.max(1, Math.round(width * 2)), 3, 1),
    new THREE.MeshToonMaterial({ color: 0x2fb6e8, gradientMap: toonRamp(), transparent: true, opacity: 0.82, emissive: 0x0a4a70, emissiveIntensity: 0.3 }),
  );
  water.position.y = 0.7;
  g.add(water);
  const foam = mesh(new THREE.CapsuleGeometry(0.28, Math.max(0.01, width - 0.56), 4, 8), toon(0xf4fbff, { emissive: 0x8fdfff, emissiveIntensity: 0.25 }), false);
  foam.rotation.z = Math.PI / 2;
  foam.position.set(0, 1.45, 0.1);
  g.add(foam);
  return g;
}

export function makePalm(h = 5) {
  const g = new THREE.Group();
  const trunkM = toon(0x9c6b3e);
  let y = 0;
  let x = 0;
  const segs = 7;
  for (let i = 0; i < segs; i++) {
    const s = mesh(new THREE.CylinderGeometry(0.16 - i * 0.012, 0.2 - i * 0.012, h / segs + 0.05, 8), trunkM);
    const lean = i * 0.06;
    x += Math.sin(lean) * (h / segs);
    y += Math.cos(lean) * (h / segs);
    s.position.set(x, y - h / segs / 2, 0);
    s.rotation.z = -lean;
    g.add(s);
  }
  const leafM = toon(0x2fa84f);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = mesh(new THREE.SphereGeometry(0.5, 10, 6), leafM);
    leaf.scale.set(0.35, 0.08, 2.2);
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.rotation.y = a;
    leaf.position.z = 0.9;
    leaf.rotation.x = 0.45;
    pivot.add(leaf);
    g.add(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.SphereGeometry(0.16, 10, 8), toon(0x6b4a2b));
    c.position.set(x + Math.cos(i * 2.1) * 0.2, y - 0.2, Math.sin(i * 2.1) * 0.2);
    g.add(c);
  }
  return g;
}

export function makeUmbrella() {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), toon(0xeeeeee));
  pole.position.y = 1.3;
  pole.rotation.z = 0.12;
  g.add(pole);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const seg = mesh(new THREE.ConeGeometry(1.4, 0.6, 3, 1, true, (i / n) * Math.PI * 2, (Math.PI * 2) / n), toon(i % 2 ? 0xffffff : 0xff4d6d));
    (seg.material as THREE.Material).side = THREE.DoubleSide;
    seg.position.set(0.3, 2.6, 0);
    seg.rotation.z = 0.12;
    g.add(seg);
  }
  const towel = mesh(new THREE.BoxGeometry(1, 0.02, 1.8), toon(0x4dd0e1), false);
  towel.position.set(0.9, 0.02, 0.4);
  towel.receiveShadow = true;
  g.add(towel);
  return g;
}

export function makeSandcastle() {
  const g = new THREE.Group();
  const sand = toon(0xe9c77b);
  const base = mesh(new THREE.BoxGeometry(1.6, 0.5, 1.2), sand);
  base.position.y = 0.25;
  g.add(base);
  for (const [x, z] of [
    [-0.7, -0.5],
    [0.7, -0.5],
    [-0.7, 0.5],
    [0.7, 0.5],
  ]) {
    const t = mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.9, 10), sand);
    t.position.set(x, 0.45, z);
    g.add(t);
    const r = mesh(new THREE.ConeGeometry(0.26, 0.35, 10), sand);
    r.position.set(x, 1.07, z);
    g.add(r);
  }
  const flagPole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4), toon(0x8b5a2b), false);
  flagPole.position.set(0.7, 1.5, -0.5);
  g.add(flagPole);
  const flag = mesh(new THREE.PlaneGeometry(0.35, 0.22), toon(0xff7a4d), false);
  (flag.material as THREE.Material).side = THREE.DoubleSide;
  flag.position.set(0.88, 1.75, -0.5);
  g.add(flag);
  return g;
}

export function makeSign(text: string, sub = '') {
  const g = new THREE.Group();
  const wood = toon(0xa87444);
  for (const s of [-1, 1]) {
    const post = mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), wood);
    post.position.set(s * 0.8, 0.75, 0);
    g.add(post);
  }
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#e8c38f';
  c.fillRect(0, 0, 512, 256);
  c.strokeStyle = '#8a5a2b';
  c.lineWidth = 14;
  c.strokeRect(7, 7, 498, 242);
  c.fillStyle = '#5a2e12';
  c.textAlign = 'center';
  c.font = 'bold 64px "Bagel Fat One", "Arial Black", sans-serif';
  c.fillText(text, 256, sub ? 120 : 150);
  if (sub) {
    c.font = 'bold 34px Arial, sans-serif';
    c.fillText(sub, 256, 190);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.08), [wood, wood, wood, wood, new THREE.MeshToonMaterial({ map: tex, gradientMap: toonRamp() }), wood]);
  board.position.y = 1.35;
  board.castShadow = true;
  g.add(board);
  return g;
}

export function makeShell(color: number) {
  const s = mesh(new THREE.ConeGeometry(0.14, 0.3, 7), toon(color));
  s.rotation.set(Math.PI / 2, 0, Math.random() * 6);
  s.position.y = 0.07;
  return s;
}

export function makeRock(r: number) {
  const geo = new THREE.DodecahedronGeometry(r, 0);
  const m = mesh(geo, toon(0x8d8a86));
  m.scale.y = 0.6;
  m.position.y = r * 0.25;
  m.rotation.y = Math.random() * 6;
  m.receiveShadow = true;
  return m;
}

// ---------- the Moon ----------

export function moonTexture(mood: 'happy' | 'worried' | 'relieved') {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f3efd9';
  c.fillRect(0, 0, 512, 256);
  const craters: [number, number, number][] = [
    [60, 60, 22],
    [420, 70, 30],
    [470, 190, 18],
    [120, 200, 26],
    [330, 210, 14],
    [30, 150, 12],
    [200, 40, 10],
  ];
  for (const [x, y, r] of craters) {
    c.fillStyle = '#d8d2b4';
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#c9c2a1';
    c.beginPath();
    c.arc(x + 3, y + 3, r * 0.7, 0, Math.PI * 2);
    c.fill();
  }
  // u=0.25 is the side of a SphereGeometry that faces +z, i.e. the camera
  const fx = 128;
  c.fillStyle = '#3b3526';
  c.strokeStyle = '#3b3526';
  c.lineWidth = 7;
  c.lineCap = 'round';
  if (mood === 'worried') {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(fx + s * 34, 120, 13, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(fx + s * 20, 92 - (s > 0 ? 0 : 0));
      c.lineTo(fx + s * 50, 100);
      c.stroke();
    }
    c.beginPath();
    c.ellipse(fx, 168, 18, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#7fd4ff';
    c.beginPath();
    c.ellipse(fx + 60, 130, 6, 10, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    for (const s of [-1, 1]) {
      c.beginPath();
      if (mood === 'relieved') c.arc(fx + s * 34, 125, 13, Math.PI * 1.1, Math.PI * 1.9);
      else c.arc(fx + s * 34, 118, 13, Math.PI * 0.1, Math.PI * 0.9);
      c.stroke();
    }
    c.beginPath();
    c.arc(fx, 150, 26, Math.PI * 0.15, Math.PI * 0.85);
    c.stroke();
    c.fillStyle = 'rgba(255,140,150,0.55)';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(fx + s * 62, 150, 14, 0, Math.PI * 2);
      c.fill();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function makeMoon() {
  const mat = new THREE.MeshBasicMaterial({ map: moonTexture('happy') });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 40, 24), mat);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(3.3, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff5cc, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  moon.add(halo);
  return { moon, mat };
}
