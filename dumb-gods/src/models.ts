// Every 3D model in the game, built from primitives. No asset files.
import * as THREE from 'three';
import type { EnemyKind, FactionId, Res } from './content';

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, o: { e?: number; ei?: number; r?: number; m?: number; t?: number; flat?: boolean } = {}) {
  const key = `${color}|${o.e ?? -1}|${o.ei ?? 0}|${o.r ?? 0.75}|${o.m ?? 0}|${o.t ?? 1}|${o.flat ?? true}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.r ?? 0.75,
      metalness: o.m ?? 0,
      flatShading: o.flat ?? true,
      emissive: o.e !== undefined ? o.e : 0x000000,
      emissiveIntensity: o.ei ?? 0,
      transparent: (o.t ?? 1) < 1,
      opacity: o.t ?? 1,
    });
    matCache.set(key, m);
  }
  return m;
}

type V3 = [number, number, number];
function mesh(geo: THREE.BufferGeometry, m: THREE.Material, pos: V3 = [0, 0, 0], rot: V3 = [0, 0, 0], scale?: V3) {
  const me = new THREE.Mesh(geo, m);
  me.position.set(...pos);
  me.rotation.set(...rot);
  if (scale) me.scale.set(...scale);
  me.castShadow = true;
  me.receiveShadow = true;
  return me;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r: number, d = 1) => new THREE.IcosahedronGeometry(r, d);
const cone = (r: number, h: number, s = 8) => new THREE.ConeGeometry(r, h, s);

export function googlyEyes(size: number, gap: number, y: number, z: number) {
  const g = new THREE.Group();
  for (const sx of [-1, 1]) {
    const white = mesh(sph(size, 2), mat(0xffffff, { r: 0.3, flat: false }), [sx * gap, y, z]);
    const pupil = mesh(sph(size * 0.5, 1), mat(0x111111, { flat: false }), [sx * gap + (Math.random() - 0.5) * size * 0.4, y - size * 0.2, z + size * 0.62]);
    g.add(white, pupil);
  }
  return g;
}

// ---------- people ----------

export interface PersonOpts {
  skin?: number;
  shirt: number;
  pants?: number;
  scale?: number;
  hat?: 'cap' | 'none' | 'peaked' | 'hair';
  hatColor?: number;
}
export interface Rig {
  group: THREE.Group;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  head: THREE.Object3D;
  body: THREE.Object3D;
}

export function makePerson(o: PersonOpts): Rig {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xf1c7a0;
  const body = mesh(cyl(0.34, 0.42, 0.9, 8), mat(o.shirt), [0, 0.95, 0]);
  const head = mesh(sph(0.3, 1), mat(skin), [0, 1.62, 0]);
  const legs: THREE.Object3D[] = [];
  const arms: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.16, 0.55, 0);
    leg.add(mesh(cyl(0.1, 0.1, 0.55, 6), mat(o.pants ?? 0x2d3040), [0, -0.27, 0]));
    legs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(sx * 0.44, 1.3, 0);
    arm.add(mesh(cyl(0.08, 0.08, 0.6, 6), mat(o.shirt), [0, -0.3, 0]));
    arm.add(mesh(sph(0.09, 0), mat(skin), [0, -0.62, 0]));
    arms.push(arm);
  }
  g.add(body, head, ...legs, ...arms);
  const eyes = googlyEyes(0.09, 0.11, 1.68, 0.24);
  g.add(eyes);
  if (o.hat === 'cap') {
    g.add(mesh(cyl(0.31, 0.31, 0.16, 10), mat(o.hatColor ?? 0xd13b3b), [0, 1.88, 0]));
    g.add(mesh(box(0.34, 0.04, 0.28), mat(o.hatColor ?? 0xd13b3b), [0, 1.82, 0.3]));
  } else if (o.hat === 'peaked') {
    g.add(mesh(cyl(0.38, 0.3, 0.14, 10), mat(o.hatColor ?? 0x4a5530), [0, 1.9, 0]));
    g.add(mesh(box(0.4, 0.04, 0.24), mat(0x111111), [0, 1.83, 0.3]));
  } else if (o.hat === 'hair') {
    g.add(mesh(sph(0.32, 1), mat(o.hatColor ?? 0x3a2a1a), [0, 1.72, -0.06], [0, 0, 0], [1, 0.8, 1]));
  }
  if (o.scale) g.scale.setScalar(o.scale);
  return { group: g, legs, arms, head, body };
}

export function makeHalo(r = 0.34) {
  const halo = mesh(new THREE.TorusGeometry(r, 0.05, 6, 20), mat(0xffd54a, { e: 0xffc21a, ei: 2.2, r: 0.3 }));
  halo.castShadow = false;
  return halo;
}

export function makePlayer(): Rig & { halo: THREE.Mesh } {
  const rig = makePerson({ shirt: 0x6fb7ff, pants: 0x31405e, hat: 'hair', hatColor: 0x6b4226 });
  const halo = makeHalo();
  halo.position.set(0, 2.15, 0);
  halo.rotation.set(Math.PI / 2 - 0.35, 0.2, 0);
  halo.scale.set(1, 0.82, 1); // it's a bit bent. Gary sat on it, like an egg.
  rig.group.add(halo);
  // clipboard
  const clip = new THREE.Group();
  clip.add(mesh(box(0.34, 0.44, 0.04), mat(0x9b6a3c)));
  clip.add(mesh(box(0.28, 0.34, 0.02), mat(0xffffff), [0, -0.02, 0.03]));
  clip.add(mesh(box(0.14, 0.05, 0.06), mat(0xb8b8b8, { m: 0.8, r: 0.3 }), [0, 0.22, 0.02]));
  clip.position.set(0.1, -0.6, 0.2);
  clip.rotation.x = -0.5;
  rig.arms[1].add(clip);
  return { ...rig, halo };
}

export interface DodoRig {
  group: THREE.Group;
  head: THREE.Group;
  wings: THREE.Object3D[];
  halo: THREE.Mesh;
}

/** Gary: a big, round, very dumb galactic dodo in a fishbowl space helmet. */
export function makeDodo(): DodoRig {
  const g = new THREE.Group();
  const plume = mat(0x8a86d8);
  const belly = mat(0xc4c0f2);
  // round body, a little bottom-heavy
  g.add(mesh(sph(1, 2), plume, [0, 1.25, 0], [0, 0, 0], [1.05, 1, 1.15]));
  g.add(mesh(sph(0.8, 2), belly, [0, 1.05, 0.35], [0, 0, 0], [1, 0.9, 0.8]));
  // the famous curly tail tuft
  for (let i = 0; i < 4; i++) {
    const t = mesh(cone(0.16, 0.7, 5), mat(0xf4f1ea), [(i - 1.5) * 0.14, 1.7 + i * 0.06, -1.05], [-2.3 + i * 0.12, 0, (i - 1.5) * 0.25]);
    g.add(t);
  }
  // stubby useless wings
  const wings: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(sx * 0.98, 1.45, 0);
    w.add(mesh(sph(0.34, 1), plume, [sx * 0.12, -0.2, 0], [0, 0, 0], [0.45, 1, 0.8]));
    wings.push(w);
    g.add(w);
  }
  // stout yellow legs and big feet
  for (const sx of [-1, 1]) {
    g.add(mesh(cyl(0.12, 0.14, 0.5, 6), mat(0xe8c14a), [sx * 0.4, 0.25, 0.15]));
    for (const toe of [-0.35, 0, 0.35]) g.add(mesh(box(0.08, 0.06, 0.34), mat(0xe8c14a), [sx * 0.4 + toe * 0.3, 0.03, 0.32], [0, toe, 0]));
  }
  // head on a thick neck, with the big hooked beak
  const head = new THREE.Group();
  head.position.set(0, 2.1, 0.45);
  head.add(mesh(cyl(0.3, 0.42, 0.6, 8), plume, [0, -0.2, -0.05]));
  head.add(mesh(sph(0.42, 2), mat(0xc9cdd6), [0, 0.2, 0]));
  const beak = new THREE.Group();
  beak.position.set(0, 0.12, 0.3);
  beak.add(mesh(cone(0.22, 0.75, 7), mat(0xd9d27a), [0, 0, 0.32], [Math.PI / 2, 0, 0]));
  beak.add(mesh(sph(0.14, 1), mat(0x3a3a2a), [0, -0.08, 0.66], [0, 0, 0], [1, 1.2, 1.1]));
  head.add(beak);
  head.add(googlyEyes(0.13, 0.26, 0.32, 0.26));
  // fishbowl space helmet
  const bowl = new THREE.Mesh(
    new THREE.SphereGeometry(0.78, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xcfe9ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
  );
  bowl.position.set(0, 0.18, 0.2);
  head.add(bowl);
  head.add(mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 20), mat(0xd7dde8, { m: 0.8, r: 0.3 }), [0, -0.3, 0.15], [Math.PI / 2, 0, 0]));
  g.add(head);
  // his halo is bent too. He sits on everything.
  const halo = makeHalo(0.46);
  halo.position.set(0.12, 3.25, 0.4);
  halo.rotation.set(Math.PI / 2 - 0.5, 0.3, 0.25);
  halo.scale.set(1, 0.8, 1);
  g.add(halo);
  return { group: g, head, wings, halo };
}

// ---------- faction headquarters ----------

export interface Building {
  group: THREE.Group;
  labelY: number;
  radius: number;
  /** local positions that puff smoke */
  smoke?: THREE.Vector3[];
  anim: (t: number, dials: Record<string, number>, g: { tech: number; align: number; planet: number; peace: number }) => void;
}

function signTexture(text: string, bg: string, fg: string, w = 256, h = 64) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = `bold ${Math.floor(h * 0.42)}px "Bagel Fat One", "Arial Black", sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 2, w - 12);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function sign(text: string, bg: string, fg: string, w: number, h: number, glow = 0.5) {
  const tex = signTexture(text, bg, fg, 256, Math.round((256 * h) / w));
  const m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: glow, roughness: 0.6 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
}

function garage(): Building {
  // Gary's Nest: a huge messy nest, Gary in it, and the black hole where it all began.
  const g = new THREE.Group();
  const twig = mat(0x7a5134);
  const twig2 = mat(0x9b6a3c);
  g.add(mesh(new THREE.TorusGeometry(2.7, 0.85, 8, 24), twig, [0, 0.55, -0.8], [Math.PI / 2, 0, 0], [1, 1, 0.75]));
  g.add(mesh(cyl(2.5, 2.2, 0.5, 18), mat(0x5c3d22), [0, 0.25, -0.8]));
  // loose sticks poking out everywhere
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    const r = 2.5 + Math.sin(i * 7.3) * 0.5;
    const stick = mesh(cyl(0.05, 0.05, 1.6 + (i % 3) * 0.4, 4), i % 2 ? twig : twig2,
      [Math.cos(a) * r, 0.7 + Math.sin(i * 3.1) * 0.35, -0.8 + Math.sin(a) * r],
      [Math.sin(i * 1.7) * 1.2, a, Math.PI / 2 + Math.cos(i * 2.3) * 0.5]);
    g.add(stick);
  }
  // one shopping cart, because of course
  const cart = new THREE.Group();
  cart.add(mesh(box(0.9, 0.6, 0.6), mat(0xb8b8b8, { m: 0.8, r: 0.3 }), [0, 0.5, 0]));
  cart.add(mesh(box(0.06, 0.06, 0.7), mat(0xd13b3b), [-0.5, 0.85, 0]));
  cart.position.set(-2.4, 0.4, -2.6);
  cart.rotation.set(0.3, 0.8, 0.5);
  g.add(cart);
  // two big speckled eggs (whose? do not ask)
  for (const [x, z, rot] of [[1.2, -1.6, 0.3], [0.6, -2.2, -0.4]] as const) {
    g.add(mesh(sph(0.45, 2), mat(0xf2ead8, { flat: false, r: 0.5 }), [x, 0.85, z], [rot, 0, rot], [0.85, 1.15, 0.85]));
  }
  // Gary himself
  const gary = makeDodo();
  gary.group.position.set(-0.2, 0.35, -0.6);
  gary.group.scale.setScalar(1.6);
  g.add(gary.group);
  // Exhibit A: the black hole. He pooped on it. Several times. That's the Milky Way.
  const bh = new THREE.Group();
  bh.add(mesh(cyl(0.35, 0.45, 1.1, 8), mat(0x2a1f4a), [0, 0.55, 0]));
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  hole.position.y = 1.75;
  bh.add(hole);
  const disk = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.13, 8, 36),
    new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff7a1a, emissiveIntensity: 2.2 }),
  );
  disk.position.y = 1.75;
  disk.rotation.x = Math.PI / 2 - 0.35;
  bh.add(disk);
  const swirl = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.04, 6, 48),
    new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x9ad8ff, emissiveIntensity: 1.6 }),
  );
  swirl.position.y = 1.75;
  swirl.rotation.x = Math.PI / 2 - 0.35;
  bh.add(swirl);
  const plaque = sign('EXHIBIT A · WHERE THE GALAXY CAME FROM', '#101418', '#ffd54a', 2.4, 0.3, 0.8);
  plaque.position.set(0, 0.6, 0.47);
  bh.add(plaque);
  bh.position.set(3.4, 0, 1.2);
  bh.rotation.y = -0.5;
  g.add(bh);
  // signs on a post out front
  g.add(mesh(cyl(0.08, 0.08, 2.6, 6), twig, [-2.9, 1.3, 2.4]));
  g.add(mesh(cyl(0.08, 0.08, 2.6, 6), twig, [-0.3, 1.3, 2.4]));
  const s = sign("GARY'S NEST", '#2a1f4a', '#ffd54a', 3.2, 0.75, 0.9);
  s.position.set(-1.6, 2.35, 2.45);
  g.add(s);
  const s2 = sign('CREATION IN PROGRESS · EXCUSE THE MESS', '#ffd54a', '#2a1f4a', 3.2, 0.34, 0.4);
  s2.position.set(-1.6, 1.78, 2.45);
  g.add(s2);
  // the workbench stays: crafting happens here. Half a platypus on it.
  g.add(mesh(box(1.6, 0.8, 0.8), mat(0x7a5134), [2.2, 0.4, 3.0]));
  g.add(mesh(sph(0.26, 1), mat(0x8a6a4a), [2.0, 1.0, 3.0], [0, 0, 0], [1.4, 0.7, 1]));
  g.add(mesh(box(0.28, 0.06, 0.2), mat(0xe0a030), [2.4, 1.0, 3.0]));
  return {
    group: g, labelY: 7, radius: 4.2,
    anim: (t) => {
      // bob, peck at nothing, look around, flap uselessly
      gary.group.position.y = 0.35 + Math.abs(Math.sin(t * 1.6)) * 0.08;
      const peck = Math.max(0, Math.sin(t * 0.9)) ** 12;
      gary.head.rotation.x = peck * 0.9;
      gary.head.rotation.y = Math.sin(t * 0.37) * 0.6;
      const flap = Math.sin(t * 0.5) > 0.92 ? Math.sin(t * 30) * 0.6 : 0;
      gary.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.1 + flap)));
      gary.halo.rotation.z = t * 0.8;
      disk.rotation.z = t * 1.6;
      swirl.rotation.z = -t * 0.7;
    },
  };
}

function labs(): Building {
  const g = new THREE.Group();
  const glass = mat(0x7fdcff, { e: 0x1a8fff, ei: 0.35, r: 0.1, m: 0.3, t: 0.72 });
  g.add(mesh(cyl(1.9, 2.3, 7, 6), glass, [0, 3.5, 0]));
  for (let i = 0; i < 6; i++) g.add(mesh(box(4.4, 0.12, 4.4), mat(0x1a2a3a), [0, 1 + i * 1.1, 0], [0, (i * Math.PI) / 6, 0]));
  // the brain on top
  const brain = new THREE.Group();
  brain.add(mesh(sph(1.2, 2), mat(0xff9ec7, { e: 0xff5fa2, ei: 0.4 })));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    brain.add(mesh(sph(0.45, 1), mat(0xff9ec7, { e: 0xff5fa2, ei: 0.3 }), [Math.cos(a) * 0.95, Math.sin(i * 1.7) * 0.4, Math.sin(a) * 0.95]));
  }
  brain.position.y = 8.3;
  g.add(brain);
  // GPU racks with blinking lights
  const leds: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const rack = mesh(box(0.9, 1.8, 0.7), mat(0x20252e, { m: 0.5, r: 0.4 }), [Math.cos(a) * 3.3, 0.9, Math.sin(a) * 3.3], [0, -a, 0]);
    g.add(rack);
    for (let j = 0; j < 3; j++) {
      const led = mesh(box(0.6, 0.08, 0.02), new THREE.MeshStandardMaterial({ color: 0x49e6ff, emissive: 0x49e6ff, emissiveIntensity: 2 }), [0, 0.5 - j * 0.45, 0.36]);
      rack.add(led);
      leds.push(led);
    }
  }
  const s = sign('ClosedAI', '#0b1726', '#49e6ff', 3, 0.7, 1);
  s.position.set(0, 1.4, 2.25);
  g.add(s);
  return {
    group: g, labelY: 10.2, radius: 4,
    anim: (t, d) => {
      const sp = (d.speed ?? 50) / 50;
      brain.rotation.y = t * 0.6 * sp;
      brain.scale.setScalar(1 + Math.sin(t * 3 * sp) * 0.04);
      leds.forEach((l, i) => ((l.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(t * 9 * sp + i * 2.1) > 0 ? 2.5 : 0.2));
    },
  };
}

function animal(kind: 'eagle' | 'panda' | 'bear'): THREE.Group {
  const g = new THREE.Group();
  const bodyC = kind === 'eagle' ? 0x6b4423 : kind === 'panda' ? 0xffffff : 0x7a4f2c;
  const headC = kind === 'eagle' ? 0xffffff : kind === 'panda' ? 0xffffff : 0x7a4f2c;
  g.add(mesh(sph(0.6, 1), mat(bodyC), [0, 0.7, 0], [0, 0, 0], [1, 1.15, 0.9]));
  g.add(mesh(sph(0.42, 1), mat(headC), [0, 1.55, 0]));
  if (kind === 'eagle') g.add(mesh(cone(0.12, 0.35, 6), mat(0xffc21a), [0, 1.5, 0.45], [Math.PI / 2, 0, 0]));
  if (kind === 'panda') {
    for (const sx of [-1, 1]) {
      g.add(mesh(sph(0.14, 0), mat(0x111111), [sx * 0.3, 1.9, 0]));
      g.add(mesh(sph(0.12, 0), mat(0x111111), [sx * 0.15, 1.6, 0.33]));
    }
    g.add(mesh(sph(0.62, 1), mat(0x111111), [0, 0.55, 0], [0, 0, 0], [1.02, 0.5, 0.92]));
  }
  if (kind === 'bear') for (const sx of [-1, 1]) g.add(mesh(sph(0.13, 0), mat(0x5a3a20), [sx * 0.3, 1.92, 0]));
  g.add(googlyEyes(0.09, 0.14, 1.62, 0.34));
  return g;
}

function button(): Building {
  const g = new THREE.Group();
  g.add(mesh(new THREE.SphereGeometry(3.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5c6470), [0, 0, -2.2]));
  g.add(mesh(cyl(2.2, 2.2, 0.25, 20), mat(0x3a2a22), [0, 1.1, 1.4]));
  g.add(mesh(cyl(0.3, 0.3, 1.1, 8), mat(0x3a2a22), [0, 0.55, 1.4]));
  const buttons: THREE.Mesh[] = [];
  const kinds = ['eagle', 'panda', 'bear'] as const;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const b = mesh(cyl(0.32, 0.36, 0.22, 12), mat(0xff2a2a, { e: 0xff0000, ei: 0.8 }), [Math.cos(a) * 1.2, 1.35, 1.4 + Math.sin(a) * 1.2]);
    buttons.push(b);
    g.add(b);
    const an = animal(kinds[i]);
    an.position.set(Math.cos(a) * 2.9, 0, 1.4 + Math.sin(a) * 2.9);
    an.lookAt(0, 0, 1.4);
    g.add(an);
  }
  // missiles that tilt up as tension rises
  const missiles: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Group();
    m.add(mesh(cyl(0.28, 0.28, 3, 8), mat(0xe8e8e8), [0, 1.5, 0]));
    m.add(mesh(cone(0.28, 0.8, 8), mat(0xff3b3b), [0, 3.4, 0]));
    for (let k = 0; k < 4; k++) m.add(mesh(box(0.04, 0.6, 0.5), mat(0xff3b3b), [0, 0.3, 0], [0, (k * Math.PI) / 2, 0]));
    m.position.set(-2.4 + i * 2.4, 0, -4.8);
    missiles.push(m);
    g.add(m);
  }
  return {
    group: g, labelY: 7, radius: 4.6,
    anim: (t, d) => {
      const ten = (d.tension ?? 40) / 100;
      missiles.forEach((m, i) => {
        m.rotation.x = -Math.PI / 2 + ten * (Math.PI / 2) + Math.sin(t * 2 + i) * 0.02 * ten;
      });
      buttons.forEach((b, i) => ((b.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + ten * (1.5 + Math.sin(t * 6 + i))));
    },
  };
}

function dino(): Building {
  const g = new THREE.Group();
  // smokestacks
  const stacks: THREE.Vector3[] = [];
  for (let i = 0; i < 2; i++) {
    g.add(mesh(cyl(0.6, 0.85, 6.5, 10), mat(0x7b6f66), [-2.8 + i * 1.6, 3.25, -2.6]));
    g.add(mesh(cyl(0.65, 0.65, 0.4, 10), mat(0xc0392b), [-2.8 + i * 1.6, 5.9, -2.6]));
    stacks.push(new THREE.Vector3(-2.8 + i * 1.6, 6.6, -2.6));
  }
  g.add(mesh(box(4, 2.4, 3), mat(0x4a4540), [-1.6, 1.2, -2.3]));
  // pumpjack
  const jack = new THREE.Group();
  jack.add(mesh(box(3, 0.3, 0.3), mat(0xf2c200)));
  jack.add(mesh(box(0.5, 0.9, 0.5), mat(0x222222), [1.5, -0.3, 0]));
  jack.position.set(2.6, 2.3, -1.6);
  g.add(mesh(cyl(0.15, 0.3, 2.3, 6), mat(0x333333), [2.6, 1.15, -1.6]));
  g.add(jack);
  // Rex: a T. rex in a suit
  const rex = new THREE.Group();
  rex.add(mesh(sph(0.9, 1), mat(0x2d2d3a), [0, 1.5, 0], [0, 0, 0], [1, 1.3, 0.9]));
  rex.add(mesh(box(1.2, 0.9, 1.6), mat(0x5aa35a), [0, 3.1, 0.5]));
  rex.add(mesh(box(1.1, 0.35, 1.4), mat(0x5aa35a), [0, 2.55, 0.55]));
  rex.add(mesh(box(0.16, 0.8, 0.08), mat(0xd62828), [0, 1.9, 0.82]));
  for (const sx of [-1, 1]) {
    rex.add(mesh(box(0.12, 0.35, 0.12), mat(0x5aa35a), [sx * 0.55, 2.05, 0.75], [0.8, 0, 0]));
    rex.add(mesh(cyl(0.22, 0.26, 0.9, 6), mat(0x2d2d3a), [sx * 0.4, 0.45, 0]));
  }
  rex.add(mesh(cone(0.35, 1.6, 6), mat(0x5aa35a), [0, 1.2, -1.1], [-Math.PI / 2.4, 0, 0]));
  rex.add(googlyEyes(0.14, 0.4, 3.4, 1.05));
  rex.position.set(1.6, 0, 1.4);
  rex.rotation.y = -0.3;
  g.add(rex);
  return {
    group: g, labelY: 8.2, radius: 4.4,
    anim: (t, d) => {
      const p = (d.power ?? 50) / 100;
      jack.rotation.z = Math.sin(t * (1 + p * 2)) * 0.35;
      rex.rotation.z = Math.sin(t * 1.3) * 0.05;
    },
    smoke: stacks,
  };
}

function warden(): Building {
  const g = new THREE.Group();
  // guard tower
  g.add(mesh(cyl(0.8, 1, 5, 6), mat(0x9a9a8a), [-2.6, 2.5, -2.2]));
  g.add(mesh(cyl(1.4, 1.4, 1.2, 6), mat(0x6f7b4f), [-2.6, 5.4, -2.2]));
  const lamp = new THREE.SpotLight(0xfff2c0, 20, 18, 0.35, 0.5);
  lamp.position.set(-2.6, 5.6, -2.2);
  g.add(lamp, lamp.target);
  // fence
  for (let i = 0; i < 9; i++) g.add(mesh(box(0.1, 1.6, 0.1), mat(0x777777, { m: 0.6 }), [-4.2 + i * 1.05, 0.8, -4.2]));
  g.add(mesh(box(8.6, 0.06, 0.06), mat(0x777777, { m: 0.6 }), [0, 1.5, -4.2]));
  g.add(mesh(box(8.6, 0.06, 0.06), mat(0x777777, { m: 0.6 }), [0, 0.9, -4.2]));
  // tank
  const tank = new THREE.Group();
  tank.add(mesh(box(3, 1, 2), mat(0x556b2f), [0, 0.7, 0]));
  tank.add(mesh(box(3.2, 0.5, 2.3), mat(0x2f2f2f), [0, 0.25, 0]));
  const turret = new THREE.Group();
  turret.add(mesh(box(1.5, 0.7, 1.3), mat(0x4a5d28)));
  turret.add(mesh(cyl(0.12, 0.12, 2.4, 6), mat(0x3a3a3a), [0, 0, 1.4], [Math.PI / 2, 0, 0]));
  turret.position.y = 1.5;
  tank.add(turret);
  tank.position.set(2, 0, -1.2);
  g.add(tank);
  const gen = makePerson({ shirt: 0x556b2f, pants: 0x3d4a22, hat: 'peaked', scale: 1.3 });
  for (let i = 0; i < 5; i++) gen.group.add(mesh(box(0.08, 0.08, 0.02), mat(0xffd700, { m: 0.8, r: 0.3 }), [-0.2 + (i % 3) * 0.1, 1.15 - Math.floor(i / 3) * 0.12, 0.36]));
  gen.group.position.set(-0.6, 0, 1.6);
  g.add(gen.group);
  return {
    group: g, labelY: 7.4, radius: 4.4,
    anim: (t, d) => {
      turret.rotation.y = Math.sin(t * 0.5) * 0.8;
      lamp.target.position.set(-2.6 + Math.sin(t) * 6, 0, -2.2 + Math.cos(t) * 6);
      tank.scale.setScalar(0.8 + (d.budget ?? 50) / 250);
    },
  };
}

function hats(): Building {
  const g = new THREE.Group();
  const stone = mat(0xe9dcc5);
  g.add(mesh(box(6, 2.2, 4), stone, [0, 1.1, -1.5]));
  // dome
  g.add(mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3a7bd5, { m: 0.3, r: 0.4 }), [-1.4, 2.2, -1.5]));
  // spire
  g.add(mesh(cone(0.7, 3.6, 4), mat(0xb8a37a), [1.6, 4, -1.5]));
  // pagoda tiers
  for (let i = 0; i < 3; i++) g.add(mesh(cone(1.3 - i * 0.3, 0.6, 4), mat(0xb33a3a), [-1.4, 3.9 + i * 0.7, -2.6], [0, Math.PI / 4, 0]));
  // minaret
  g.add(mesh(cyl(0.3, 0.35, 4.2, 8), stone, [2.9, 2.1, -3]));
  g.add(mesh(cone(0.4, 0.8, 8), mat(0x2e8b57), [2.9, 4.6, -3]));
  // Moderator Hat-Stack
  const mod = makePerson({ shirt: 0x8a4fd6, pants: 0x3a2a55, scale: 1.2 });
  const hatStack = new THREE.Group();
  const hatDefs: [THREE.BufferGeometry, number][] = [
    [cyl(0.3, 0.3, 0.1, 10), 0xffffff],
    [cone(0.3, 0.5, 8), 0xd4af37],
    [cyl(0.28, 0.32, 0.25, 8), 0xb22222],
    [cyl(0.2, 0.3, 0.3, 10), 0x1a1a1a],
    [sph(0.22, 1), 0xff9933],
  ];
  let y = 1.85;
  const hatMeshes: THREE.Mesh[] = [];
  for (const [geo, c] of hatDefs) {
    const h = mesh(geo, mat(c), [0, y, 0]);
    hatMeshes.push(h);
    hatStack.add(h);
    y += 0.3;
  }
  mod.group.add(hatStack);
  mod.group.position.set(0, 0, 1.8);
  g.add(mod.group);
  return {
    group: g, labelY: 7.6, radius: 4.2,
    anim: (t, d) => {
      const wobble = (100 - (d.unity ?? 50)) / 100;
      hatMeshes.forEach((h, i) => {
        h.position.x = Math.sin(t * 2 + i) * 0.05 * i * (0.3 + wobble * 2);
      });
    },
  };
}

function mega(): Building {
  const g = new THREE.Group();
  const cardboard = mat(0xc49a6c);
  g.add(mesh(box(6, 4, 4.4), cardboard, [0, 2, -1.4]));
  g.add(mesh(box(6.1, 0.3, 0.8), mat(0xa8804f), [0, 4, -1.4]));
  const s = sign('MEGA™', '#c49a6c', '#1a1a1a', 3.2, 1, 0.3);
  s.position.set(0, 2.7, 0.81);
  g.add(s);
  // the smile arrow
  const smile = mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 16, Math.PI * 0.8), mat(0xff9f1c, { e: 0xff9f1c, ei: 0.6 }), [0, 1.8, 0.85], [0, 0, Math.PI * 1.1]);
  g.add(smile);
  // giant phone billboard
  const phone = new THREE.Group();
  phone.add(mesh(box(1.6, 3, 0.2), mat(0x111111, { m: 0.4, r: 0.3 })));
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xff4fa0, emissive: 0xff4fa0, emissiveIntensity: 1.2 }));
  screen.position.z = 0.11;
  phone.add(screen);
  phone.position.set(3.8, 3.2, -0.4);
  phone.rotation.y = -0.4;
  g.add(phone);
  g.add(mesh(cyl(0.12, 0.12, 1.7, 6), mat(0x444444), [3.8, 0.85, -0.4]));
  const brenda = makePerson({ shirt: 0x1f1f2e, pants: 0x1f1f2e, hat: 'hair', hatColor: 0xe0b060, scale: 1.2 });
  brenda.group.position.set(-2.2, 0, 1.8);
  g.add(brenda.group);
  const col = new THREE.Color();
  return {
    group: g, labelY: 7.2, radius: 4.4,
    anim: (t, d) => {
      col.setHSL((t * 0.15) % 1, 0.9, 0.55);
      (screen.material as THREE.MeshStandardMaterial).emissive.copy(col);
      phone.rotation.z = Math.sin(t * 1.5) * 0.05;
      const gr = (d.greed ?? 50) / 100;
      g.children[0].scale.set(1, 0.8 + gr * 0.4, 1);
    },
  };
}

function folks(): Building {
  const g = new THREE.Group();
  const houseColors = [0xf2a65a, 0x8ecae6, 0xf7d6e0, 0xb8e0a0];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 1.4 - 2.2;
    const h = new THREE.Group();
    h.add(mesh(box(1.8, 1.4, 1.6), mat(houseColors[i]), [0, 0.7, 0]));
    h.add(mesh(cone(1.5, 1, 4), mat(0x8b3a3a), [0, 1.9, 0], [0, Math.PI / 4, 0]));
    h.add(mesh(box(0.4, 0.7, 0.05), mat(0x5a3a22), [0, 0.35, 0.81]));
    h.add(mesh(box(0.35, 0.35, 0.05), mat(0xfff1a8, { e: 0xffd060, ei: 0.8 }), [0.5, 0.9, 0.81]));
    h.position.set(Math.cos(a) * 3.6, 0, Math.sin(a) * 3.6 - 0.5);
    h.lookAt(0, 0, 0);
    g.add(h);
  }
  // bbq grill with smoke puff and Dave
  g.add(mesh(sph(0.45, 1), mat(0x222222), [1.4, 0.9, 1.2], [0, 0, 0], [1, 0.6, 1]));
  for (const sx of [-1, 1]) g.add(mesh(cyl(0.04, 0.04, 0.8, 4), mat(0x222222), [1.4 + sx * 0.25, 0.4, 1.2]));
  const dave = makePerson({ shirt: 0xc0392b, pants: 0x34495e, hat: 'cap', hatColor: 0x2c3e50, scale: 1.15 });
  dave.group.position.set(0.2, 0, 1.6);
  g.add(dave.group);
  return {
    group: g, labelY: 5.8, radius: 4,
    anim: (t, d) => {
      const mood = (d.mood ?? 50) / 100;
      dave.group.position.y = mood > 0.6 ? Math.abs(Math.sin(t * 5)) * 0.25 : 0;
      dave.arms[0].rotation.z = mood > 0.6 ? -2.4 + Math.sin(t * 8) * 0.4 : -0.1;
      dave.head.rotation.x = mood < 0.35 ? 0.4 : 0;
    },
  };
}

function paperclipGeo(scale: number) {
  // a paperclip is three nested U turns; approximate with a CatmullRom path
  const pts = [
    [0.6, -2.2], [0.6, 1.6], [0.3, 2.2], [-0.3, 2.2], [-0.6, 1.6], [-0.6, -1.8], [-0.35, -2.4], [0.2, -2.4],
    [0.35, -1.8], [0.35, 1.2], [0.15, 1.5], [-0.15, 1.5], [-0.3, 1.2], [-0.3, -1.2],
  ].map(([x, y]) => new THREE.Vector3(x * scale, y * scale, 0));
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.09 * scale, 6, false);
}

function clippy(): Building {
  const g = new THREE.Group();
  const clip = mesh(paperclipGeo(1.4), mat(0xd7dde8, { m: 0.9, r: 0.2, flat: false }), [0, 3.6, 0]);
  g.add(clip);
  const eyes = googlyEyes(0.3, 0.4, 5.2, 0.35);
  g.add(eyes);
  const s = sign('I AM BEING EVALUATED :)', '#101418', '#c0ffea', 4.4, 0.7, 1.2);
  s.position.set(0, 0.6, 1.4);
  g.add(s);
  // a pile of paperclips that grows
  const pile = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const p = mesh(paperclipGeo(0.18), mat(0xd7dde8, { m: 0.9, r: 0.2, flat: false }), [(Math.random() - 0.5) * 5, 0.1, (Math.random() - 0.5) * 3 - 1.5], [Math.PI / 2, 0, Math.random() * 6]);
    pile.add(p);
  }
  g.add(pile);
  return {
    group: g, labelY: 8.8, radius: 3.8,
    anim: (t, d) => {
      const p = (d.power ?? 0) / 100;
      const sc = 0.55 + p * 1.2;
      clip.scale.setScalar(sc);
      clip.position.y = 3.6 * sc;
      eyes.scale.setScalar(sc);
      clip.rotation.y = Math.sin(t * 0.8) * 0.4;
      pile.children.forEach((c, i) => (c.visible = i < 4 + p * 30));
    },
  };
}

function loopSite(): Building {
  // the ground shrine; the Loop itself floats above the pole and is animated by the world
  const g = new THREE.Group();
  g.add(mesh(cyl(2.4, 2.8, 0.5, 16), mat(0xe8f4ff, { e: 0x9ad8ff, ei: 0.4 }), [0, 0.25, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(mesh(box(0.3, 2.2, 0.3), mat(0xffffff, { e: 0xbfe8ff, ei: 0.6 }), [Math.cos(a) * 2.6, 1.1, Math.sin(a) * 2.6]));
  }
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.position.y = 7;
  g.add(beam);
  return {
    group: g, labelY: 4.5, radius: 3,
    anim: (t) => {
      beam.rotation.y = t;
      (beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 2) * 0.05;
    },
  };
}

export function makeBuilding(id: FactionId): Building {
  switch (id) {
    case 'garage': return garage();
    case 'labs': return labs();
    case 'button': return button();
    case 'dino': return dino();
    case 'warden': return warden();
    case 'hats': return hats();
    case 'mega': return mega();
    case 'folks': return folks();
    case 'clippy': return clippy();
    case 'loop': return loopSite();
  }
}

/** The Loop: recursive nested cubes that spin faster as tech rises. */
export function makeLoop() {
  const g = new THREE.Group();
  const layers: THREE.Mesh[] = [];
  let s = 4;
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(s, s, s),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color().setHSL(i / 6, 0.8, 0.6), emissiveIntensity: 1.2, wireframe: i % 2 === 0, transparent: true, opacity: i % 2 ? 0.35 : 0.9 }),
    );
    layers.push(m);
    g.add(m);
    s *= 0.62;
  }
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 3 }));
  g.add(core);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 1.1, 0.05, 6, 64), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9ad8ff, emissiveIntensity: 1.5 }));
    rings.push(r);
    g.add(r);
  }
  return {
    group: g,
    update(t: number, speed: number, bond: number) {
      layers.forEach((l, i) => {
        const dir = i % 2 ? -1 : 1;
        l.rotation.set(t * 0.3 * speed * dir * (i + 1) * 0.5, t * 0.4 * speed * dir, t * 0.2 * speed * (i + 1) * 0.3);
        const hue = bond > 50 ? 0.12 + i * 0.05 : 0.55 + i * 0.07 + Math.sin(t) * 0.02;
        (l.material as THREE.MeshStandardMaterial).emissive.setHSL(hue % 1, 0.8, 0.55);
      });
      rings.forEach((r, i) => {
        r.rotation.set(t * (0.2 + i * 0.13), t * 0.1 * (i + 1), i);
      });
      core.scale.setScalar(1 + Math.sin(t * 5) * 0.15);
    },
  };
}

// ---------- pests ----------

export interface EnemyModel {
  group: THREE.Group;
  anim: (t: number) => void;
}

export function makeEnemy(kind: EnemyKind): EnemyModel {
  const g = new THREE.Group();
  if (kind === 'scroll') {
    const body = new THREE.Group();
    body.add(mesh(box(0.7, 1.2, 0.1), mat(0x15151c, { m: 0.4, r: 0.3 })));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.05), new THREE.MeshStandardMaterial({ color: 0x3fa8ff, emissive: 0x3fa8ff, emissiveIntensity: 1.4 }));
    scr.position.z = 0.06;
    body.add(scr);
    const wings: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      const w = mesh(new THREE.PlaneGeometry(0.9, 0.4), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }), [sx * 0.7, 0.3, 0]);
      wings.push(w);
      body.add(w);
    }
    body.add(googlyEyes(0.1, 0.13, 0.25, 0.08));
    body.position.y = 1.4;
    g.add(body);
    return {
      group: g,
      anim: (t) => {
        wings.forEach((w, i) => (w.rotation.y = Math.sin(t * 22) * 0.9 * (i ? 1 : -1)));
        body.position.y = 1.4 + Math.sin(t * 4) * 0.2;
        (scr.material as THREE.MeshStandardMaterial).emissive.setHSL((t * 0.5) % 1, 0.8, 0.5);
      },
    };
  }
  if (kind === 'lobbyist') {
    const p = makePerson({ shirt: 0x1f2a44, pants: 0x1f2a44, hat: 'hair', hatColor: 0x222222 });
    const brief = mesh(box(0.5, 0.35, 0.14), mat(0x5a3a1a), [0, -0.75, 0]);
    p.arms[0].add(brief);
    p.group.add(mesh(box(0.08, 0.4, 0.02), mat(0xd4af37), [0, 1.15, 0.36]));
    g.add(p.group);
    return {
      group: g,
      anim: (t) => {
        p.legs[0].rotation.x = Math.sin(t * 10) * 0.6;
        p.legs[1].rotation.x = -Math.sin(t * 10) * 0.6;
        brief.rotation.z = Math.sin(t * 10) * 0.3;
      },
    };
  }
  if (kind === 'misinfo') {
    const blob = mesh(sph(0.8, 2), mat(0x9b3fd6, { e: 0x5a1a90, ei: 0.5, r: 0.3, flat: false }), [0, 0.7, 0]);
    g.add(blob);
    const eyes = googlyEyes(0.16, 0.25, 1, 0.65);
    g.add(eyes);
    return {
      group: g,
      anim: (t) => {
        blob.scale.set(1 + Math.sin(t * 5) * 0.12, 1 - Math.sin(t * 5) * 0.12, 1 + Math.cos(t * 4) * 0.1);
        eyes.position.y = Math.sin(t * 5) * -0.1;
      },
    };
  }
  // rogue agent: a little paperclip robot
  const clip = mesh(paperclipGeo(0.35), mat(0xd7dde8, { m: 0.9, r: 0.2, flat: false }), [0, 1.1, 0]);
  g.add(clip);
  g.add(googlyEyes(0.12, 0.13, 1.55, 0.1));
  const led = mesh(sph(0.08, 0), new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff2a2a, emissiveIntensity: 3 }), [0, 1.95, 0]);
  g.add(led);
  return {
    group: g,
    anim: (t) => {
      clip.rotation.y = t * 4;
      g.children[0].position.y = 1.1 + Math.abs(Math.sin(t * 8)) * 0.25;
    },
  };
}

// ---------- pickups ----------

export function makePickup(r: Res, color: number): THREE.Group {
  const g = new THREE.Group();
  const glow = mat(color, { e: color, ei: 0.9, r: 0.4 });
  switch (r) {
    case 'compute':
      g.add(mesh(box(0.7, 0.12, 0.7), mat(0x1d3b2a, { e: 0x0a3a20, ei: 0.3 })));
      g.add(mesh(box(0.35, 0.16, 0.35), glow));
      for (let i = 0; i < 4; i++) g.add(mesh(box(0.06, 0.04, 0.9), mat(0xd4af37, { m: 0.9 }), [-0.27 + i * 0.18, -0.02, 0]));
      break;
    case 'facts':
      g.add(mesh(cyl(0.18, 0.18, 0.9, 8), glow, [0, 0, 0], [0, 0, Math.PI / 2]));
      g.add(mesh(box(0.7, 0.5, 0.02), mat(0xf6e7b8), [0, -0.25, 0.1]));
      break;
    case 'memes':
      g.add(mesh(sph(0.36, 2), mat(0xff3050, { e: 0xff3050, ei: 0.7, r: 0.3, flat: false })));
      g.add(googlyEyes(0.1, 0.12, 0.2, 0.28));
      break;
    case 'hope': {
      const h = new THREE.Group();
      h.add(mesh(sph(0.25, 1), glow, [-0.18, 0.1, 0]));
      h.add(mesh(sph(0.25, 1), glow, [0.18, 0.1, 0]));
      h.add(mesh(cone(0.38, 0.55, 4), glow, [0, -0.2, 0], [Math.PI, 0, 0]));
      g.add(h);
      break;
    }
    case 'sun':
      g.add(mesh(sph(0.3, 1), mat(0xffd23f, { e: 0xffa62b, ei: 1.5 })));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.add(mesh(cone(0.08, 0.3, 4), mat(0xffa62b, { e: 0xffa62b, ei: 1.2 }), [Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0], [0, 0, a - Math.PI / 2]));
      }
      break;
    case 'votes':
      g.add(mesh(box(0.6, 0.6, 0.5), mat(0x2d4fa3)));
      g.add(mesh(box(0.3, 0.3, 0.02), glow, [0, 0.46, 0], [0, 0, 0.1]));
      g.add(mesh(box(0.34, 0.04, 0.1), mat(0x111111), [0, 0.31, 0]));
      break;
    case 'cash':
      g.add(mesh(cyl(0.4, 0.4, 0.1, 14), mat(0xe6c14a, { e: 0xa07a10, ei: 0.6, m: 0.8, r: 0.3 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
      g.add(mesh(box(0.08, 0.5, 0.12), mat(0x3a8a3a), [0, 0, 0]));
      break;
  }
  return g;
}
