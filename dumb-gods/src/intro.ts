// The opening cinematic: Gary poops on a black hole, the galaxy forms, a warm splat lands
// on a rock, life wiggles, evolves, and becomes you. Every frame is a pure function of the
// clock, so seek(t) can jump anywhere (the smoke test uses that for screenshots).
import * as THREE from 'three';
import type { Audio, Sfx } from './engine/audio';
import { fbm } from './engine/noise';
import { box, cone, cyl, googlyEyes, makeDodo, makePerson, makePlayer, mat, mesh, sph } from './models';

export const INTRO_LENGTH = 49.6;

export interface Caption {
  title: string;
  sub: string;
  alpha: number;
}

const CAPTIONS: { a: number; b: number; title: string; sub: string }[] = [
  { a: 0.4, b: 5.6, title: 'In the beginning, there was Gary.', sub: 'A very dumb galactic dodo. He is doing his best.' },
  { a: 6.0, b: 9.2, title: 'Gary had a big lunch.', sub: 'Then he flew over a black hole.' },
  { a: 9.4, b: 12.3, title: 'Plop.', sub: 'Several times.' },
  { a: 12.8, b: 18.8, title: 'The swirl became the Milky Way.', sub: 'Astronomers call the thing in the middle Sagittarius A*. Gary calls it “the toilet.”' },
  { a: 19.3, b: 24.0, title: 'One especially warm splat landed on a rock…', sub: '' },
  { a: 24.8, b: 30.2, title: '…and it started to wiggle.', sub: 'That was life. It had googly eyes. (Probably.)' },
  { a: 30.8, b: 35.4, title: 'The wiggle kept going.', sub: 'Fins. Feet. Fur. Thumbs.' },
  { a: 35.6, b: 40.2, title: 'Eventually the wiggle got way smarter than Gary.', sub: 'It invented jazz, calculus and the kazoo. It also ate all his cousins. He forgives you.' },
  { a: 40.6, b: 44.6, title: 'Now you’re building something smarter than you.', sub: 'Every creator ends up the dumb one. That part is fine.' },
  { a: 45.0, b: 49.4, title: 'You are the Shepherd.', sub: 'Make sure the kid still likes you.' },
];

const POOPS = 6;
const poopRelease = (i: number) => 7 + i * 0.75;
const POOP_FALL = 0.9;
const POOP_SPIRAL = 0.9;
const CUT = 24.3;
const SPLAT_HIT = 21.6;
const MARCH_A = 30.5;
const MARCH_B = 40;
/** start time of each evolution stage: cell, fish, tetrapod, shrew, ape, human */
const STAGES = [0, 31.6, 33.6, 35.6, 37.4, 39.2];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ss = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

const SUN = V(40, 0, 14);
const EARTH = SUN.clone().add(V(4, 0.3, 1.5));
const W = V(0, -600, 0); // the underwater/evolution set, far below the galaxy
const M0 = W.clone().add(V(-10, 0.1, 0));
const GROUND = W.y - 0.8;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,240,200,.6)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Creature {
  group: THREE.Group;
  walk: (t: number) => void;
  water: boolean;
}

export class Intro {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 3000);
  t = 0;
  done = false;
  private audio: Audio | null;
  private owned: { dispose(): void }[] = [];
  private glowTex = glowTexture();

  private disk: THREE.Mesh;
  private diskMat: THREE.ShaderMaterial;
  private gary = makeDodo();
  private pellets: THREE.Mesh[] = [];
  private flashes: THREE.Sprite[] = [];
  private galaxyMat: THREE.ShaderMaterial;
  private earth: THREE.Mesh;
  private earthNoise: Float32Array;
  private earthK = -1;
  private earthGlow: THREE.Sprite;
  private splat: THREE.Mesh;
  private bubble: THREE.Mesh;
  private cells: THREE.Group[] = [];
  private creatures: Creature[] = [];
  private human = makePlayer();
  private sparkle: THREE.Sprite;
  private weeds: THREE.Mesh[] = [];
  private fog = new THREE.Fog(0x0b4f6c, 14, 80);
  private hemi: THREE.HemisphereLight;
  private spaceSun: THREE.DirectionalLight;
  private setSun: THREE.DirectionalLight;
  private set = new THREE.Group();

  constructor(audio: Audio | null) {
    this.audio = audio;
    const s = this.scene;
    s.background = new THREE.Color(0x05030f);
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x302040, 1.2);
    s.add(this.hemi);
    const sun = (this.spaceSun = new THREE.DirectionalLight(0xfff1d6, 2.2));
    sun.position.set(20, 40, 30);
    s.add(sun);
    const sun2 = (this.setSun = new THREE.DirectionalLight(0xfff1d6, 0));
    sun2.position.copy(W).add(V(10, 30, 20));
    sun2.target.position.copy(W);
    s.add(sun2, sun2.target);

    // stars
    const N = 2500;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(900 + Math.random() * 400);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    const sg = this.own(new THREE.BufferGeometry());
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    s.add(new THREE.Points(sg, this.own(new THREE.PointsMaterial({ size: 1.5, color: 0xdfe6ff, sizeAttenuation: false, fog: false }))));

    // ---- the black hole (Sagittarius A*, or "the toilet") ----
    const bh = new THREE.Group();
    bh.rotation.x = 0.18;
    bh.add(new THREE.Mesh(this.own(new THREE.SphereGeometry(2.4, 32, 20)), this.own(new THREE.MeshBasicMaterial({ color: 0x000000 }))));
    this.diskMat = this.own(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uHeat: { value: 0.35 } },
      vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uHeat; varying vec3 vP;
        void main(){
          float r = length(vP.xy); float a = atan(vP.y, vP.x);
          float t = clamp((r - 2.9) / 6.5, 0.0, 1.0);
          float swirl = 0.5 + 0.5 * sin(a * 3.0 - r * 1.7 + uTime * 3.0);
          vec3 hot = mix(vec3(1.0, 0.95, 0.82), vec3(1.0, 0.42, 0.1), t);
          float alpha = pow(1.0 - t, 1.4) * (0.5 + 0.5 * swirl) * uHeat;
          gl_FragColor = vec4(hot * alpha * 1.8, alpha);
        }`,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.disk = new THREE.Mesh(this.own(new THREE.RingGeometry(2.9, 9.4, 96, 4)), this.diskMat);
    this.disk.rotation.x = -Math.PI / 2;
    bh.add(this.disk);
    bh.add(new THREE.Mesh(this.own(new THREE.TorusGeometry(2.62, 0.06, 8, 96)), this.own(new THREE.MeshBasicMaterial({ color: 0xfff4d8 }))));
    s.add(bh);

    // ---- Gary ----
    this.gary.group.scale.setScalar(1.3);
    s.add(this.gary.group);
    for (let i = 0; i < POOPS; i++) {
      const p = mesh(sph(0.34, 1), mat(0x6b4a2b, { r: 0.5 }));
      p.scale.set(1, 0.85, 1);
      p.visible = false;
      this.pellets.push(p);
      s.add(p);
      const f = this.sprite(0xffd9a0);
      this.flashes.push(f);
      s.add(f);
    }

    // ---- the galaxy: a shader point cloud that winds itself up ----
    const G = 16000;
    const aR = new Float32Array(G), aA = new Float32Array(G), aY = new Float32Array(G), aS = new Float32Array(G);
    const aC = new Float32Array(G * 3);
    const col = new THREE.Color();
    for (let i = 0; i < G; i++) {
      const core = Math.random() < 0.22;
      const r = core ? Math.pow(Math.random(), 1.8) * 0.25 : Math.pow(Math.random(), 0.7);
      const arm = Math.floor(Math.random() * 4);
      aR[i] = r;
      aA[i] = arm * (Math.PI / 2) + (Math.random() - 0.5) * (core ? 6.3 : 0.55 + (1 - r) * 0.4);
      aY[i] = (Math.random() - 0.5) * (Math.random() < 0.5 ? 0.3 : 1);
      aS[i] = core ? 1.6 + Math.random() * 1.6 : 0.8 + Math.random() * 1.5;
      if (core) col.setHSL(0.1 + Math.random() * 0.04, 0.7, 0.7 + Math.random() * 0.2);
      else col.setHSL(Math.random() < 0.7 ? 0.6 + Math.random() * 0.08 : 0.9 + Math.random() * 0.05, 0.7, 0.55 + Math.random() * 0.3);
      aC.set([col.r, col.g, col.b], i * 3);
    }
    const gg = this.own(new THREE.BufferGeometry());
    gg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(G * 3), 3));
    gg.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
    gg.setAttribute('aA', new THREE.BufferAttribute(aA, 1));
    gg.setAttribute('aY', new THREE.BufferAttribute(aY, 1));
    gg.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    gg.setAttribute('aC', new THREE.BufferAttribute(aC, 3));
    this.galaxyMat = this.own(new THREE.ShaderMaterial({
      uniforms: { uForm: { value: 0 }, uTime: { value: 0 }, uPix: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aR; attribute float aA; attribute float aY; attribute float aS; attribute vec3 aC;
        uniform float uForm, uTime, uPix; varying vec3 vC; varying float vA;
        void main(){
          float r = aR * 80.0 * (0.03 + 0.97 * uForm);
          float ang = aA + aR * 5.5 * uForm + uTime * (0.22 / (0.25 + aR));
          vec3 p = vec3(cos(ang) * r, aY * (1.5 + 6.0 * (1.0 - aR)), sin(ang) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(aS * uPix * (140.0 / -mv.z), 1.0, 22.0);
          gl_Position = projectionMatrix * mv;
          vC = aC; vA = uForm;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d) * vA;
          gl_FragColor = vec4(vC * a, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const galaxy = new THREE.Points(gg, this.galaxyMat);
    galaxy.frustumCulled = false;
    s.add(galaxy);

    // ---- a sun and a rock ----
    const sunBall = new THREE.Mesh(this.own(new THREE.SphereGeometry(1.4, 24, 16)), this.own(new THREE.MeshBasicMaterial({ color: 0xfff1c0 })));
    sunBall.position.copy(SUN);
    s.add(sunBall);
    const sunGlow = this.sprite(0xffe6a8);
    sunGlow.position.copy(SUN);
    sunGlow.scale.setScalar(14);
    s.add(sunGlow);

    const eg = this.own(new THREE.IcosahedronGeometry(1.1, 4));
    const pos = eg.attributes.position as THREE.BufferAttribute;
    const faces = pos.count / 3;
    this.earthNoise = new Float32Array(faces * 2);
    const v = new THREE.Vector3();
    for (let f = 0; f < faces; f++) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, f * 3 + k));
      v.normalize();
      this.earthNoise[f * 2] = fbm(v.x * 2.2 + 3, v.y * 2.2, v.z * 2.2, 4, 7);
      this.earthNoise[f * 2 + 1] = Math.abs(v.y);
    }
    eg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.earth = new THREE.Mesh(eg, this.own(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, emissive: 0xff4a10, emissiveIntensity: 0.5 })));
    this.earth.position.copy(EARTH);
    s.add(this.earth);
    this.earthGlow = this.sprite(0x6fc3ff);
    this.earthGlow.position.copy(EARTH);
    this.earthGlow.scale.setScalar(3.4);
    s.add(this.earthGlow);
    this.splat = new THREE.Mesh(this.own(new THREE.SphereGeometry(0.22, 12, 8)), this.own(new THREE.MeshBasicMaterial({ color: 0xfff3b0 })));
    const splatTail = new THREE.Mesh(this.own(new THREE.ConeGeometry(0.2, 1.4, 8)), this.own(new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.6 })));
    splatTail.position.y = -0.75;
    this.splat.add(splatTail);
    s.add(this.splat);

    // ---- the evolution set: a bubble world with sea, shore and sky ----
    this.bubble = new THREE.Mesh(this.own(new THREE.SphereGeometry(80, 32, 16)), this.own(new THREE.MeshBasicMaterial({ color: 0x0b4f6c, side: THREE.BackSide, fog: false })));
    this.bubble.position.copy(W);
    this.set.add(this.bubble);
    this.set.add(mesh(box(44, 1, 16), mat(0xc9ad72, { r: 1 }), [W.x, GROUND - 0.5, W.z]));
    const water = new THREE.Mesh(this.own(new THREE.BoxGeometry(12.6, 1.8, 16)), this.own(new THREE.MeshStandardMaterial({ color: 0x2a9fd6, transparent: true, opacity: 0.35, depthWrite: false, roughness: 0.2 })));
    water.position.set(W.x - 10.3, GROUND + 0.9, W.z);
    this.set.add(water);
    for (let i = 0; i < 8; i++) {
      const w = mesh(cone(0.12, 1.2 + (i % 3) * 0.4, 5), mat(0x2e8b57), [W.x - 15 + i * 1.4, GROUND + 0.6, W.z - 2.5 + (i % 2) * 1.2]);
      this.weeds.push(w);
      this.set.add(w);
    }
    for (let i = 0; i < 6; i++) s.add(mesh(sph(0.3 + (i % 3) * 0.2, 0), mat(0x8a7f73), [W.x - 2 + i * 3.2, GROUND + 0.1, W.z - 3 + (i % 2) * 1.5]));
    // a palm tree on the beach
    this.set.add(mesh(cyl(0.12, 0.18, 3.4, 6), mat(0x8b5a3c), [W.x + 14, GROUND + 1.7, W.z - 3], [0, 0, 0.12]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      this.set.add(mesh(box(1.8, 0.05, 0.4), mat(0x3f9a3f), [W.x + 14.2 + Math.cos(a) * 0.8, GROUND + 3.4, W.z - 3 + Math.sin(a) * 0.8], [0, -a, -0.35]));
    }

    s.add(this.set);

    // cells: the hero plus three siblings from dividing
    for (let i = 0; i < 4; i++) {
      const c = this.makeCell();
      this.cells.push(c);
      s.add(c);
    }
    this.creatures = [
      { group: this.cells[0], walk: () => {}, water: true },
      this.makeFish(),
      this.makeTetrapod(),
      this.makeShrew(),
      this.makeApe(),
      { group: this.human.group, walk: () => {}, water: false },
    ];
    for (const c of this.creatures.slice(1)) s.add(c.group);
    this.sparkle = this.sprite(0xfff2a0);
    s.add(this.sparkle);
    this.scene.fog = null;
    this.apply(0);
  }

  private own<T extends { dispose(): void }>(x: T): T {
    this.owned.push(x);
    return x;
  }

  private sprite(color: number) {
    const m = this.own(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    const s = new THREE.Sprite(m);
    s.visible = false;
    return s;
  }

  // ---------- creatures (all built facing +z, turned to walk along +x) ----------

  private makeCell() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(new THREE.Mesh(this.own(new THREE.SphereGeometry(0.55, 20, 14)), this.own(new THREE.MeshStandardMaterial({ color: 0x9df2c4, transparent: true, opacity: 0.6, roughness: 0.2 }))));
    body.add(mesh(sph(0.22, 1), mat(0x3a8a5a), [-0.1, -0.05, -0.1]));
    body.add(mesh(sph(0.06, 0), mat(0xffd23f), [0.2, 0.15, 0.05]));
    body.add(mesh(sph(0.05, 0), mat(0xff7de9), [-0.2, 0.2, 0.15]));
    body.add(googlyEyes(0.1, 0.13, 0.16, 0.44));
    const tail = mesh(cone(0.05, 0.9, 5), mat(0x9df2c4), [0, 0, -0.9], [-Math.PI / 2, 0, 0]);
    body.add(tail);
    g.add(body);
    g.userData = { body, tail };
    return g;
  }

  private makeFish(): Creature {
    const g = new THREE.Group();
    const body = new THREE.Group();
    body.add(mesh(sph(0.5, 2), mat(0xff8a3d), [0, 0, 0], [0, 0, 0], [0.55, 0.7, 1.2]));
    const tail = mesh(cone(0.4, 0.55, 4), mat(0xffb070), [0, 0, -0.8], [Math.PI / 2, 0, 0]);
    body.add(tail);
    body.add(mesh(cone(0.18, 0.35, 4), mat(0xffb070), [0, 0.42, -0.1]));
    body.add(googlyEyes(0.1, 0.2, 0.12, 0.42));
    g.add(body);
    return { group: g, water: true, walk: (t) => { tail.rotation.y = Math.sin(t * 14) * 0.5; body.rotation.y = Math.sin(t * 14) * 0.08; } };
  }

  private quadLegs(g: THREE.Group, color: number, dx: number, dz: number, y: number, len: number) {
    const legs: THREE.Group[] = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sx * dx, y, sz * dz);
      leg.add(mesh(cyl(0.07, 0.06, len, 5), mat(color), [0, -len / 2, 0]));
      legs.push(leg);
      g.add(leg);
    }
    return (t: number) => legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 12 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.6));
  }

  private makeTetrapod(): Creature {
    const g = new THREE.Group();
    g.add(mesh(sph(0.45, 1), mat(0x5aa35a), [0, 0.35, 0], [0, 0, 0], [0.8, 0.5, 1.6]));
    g.add(mesh(sph(0.28, 1), mat(0x6bbd6b), [0, 0.42, 0.8], [0, 0, 0], [1, 0.75, 1.2]));
    g.add(mesh(cone(0.2, 1, 5), mat(0x5aa35a), [0, 0.32, -1.1], [-Math.PI / 2, 0, 0]));
    g.add(googlyEyes(0.09, 0.14, 0.62, 0.95));
    const walk = this.quadLegs(g, 0x4a8a4a, 0.36, 0.45, 0.3, 0.3);
    return { group: g, water: false, walk: (t) => { walk(t); g.rotation.z = Math.sin(t * 12) * 0.06; } };
  }

  private makeShrew(): Creature {
    const g = new THREE.Group();
    g.add(mesh(sph(0.45, 1), mat(0x8a6a4a), [0, 0.55, 0], [0, 0, 0], [0.9, 0.8, 1.3]));
    g.add(mesh(sph(0.28, 1), mat(0x9b7a58), [0, 0.68, 0.6]));
    g.add(mesh(cone(0.12, 0.3, 5), mat(0xd9a0a0), [0, 0.62, 0.9], [Math.PI / 2, 0, 0]));
    for (const sx of [-1, 1]) g.add(mesh(cone(0.09, 0.18, 4), mat(0x8a6a4a), [sx * 0.16, 0.95, 0.55]));
    g.add(mesh(cone(0.05, 0.9, 4), mat(0xd9a0a0), [0, 0.5, -0.9], [-Math.PI / 2 - 0.3, 0, 0]));
    g.add(googlyEyes(0.07, 0.12, 0.78, 0.8));
    const walk = this.quadLegs(g, 0x6b4a2e, 0.3, 0.35, 0.35, 0.35);
    return { group: g, water: false, walk };
  }

  private makeApe(): Creature {
    const wrap = new THREE.Group();
    const rig = makePerson({ shirt: 0x6b4a2e, pants: 0x6b4a2e, skin: 0xc9a27e, hat: 'hair', hatColor: 0x4a3220 });
    rig.group.rotation.x = 0.3;
    rig.arms.forEach((a) => a.scale.set(1, 1.4, 1));
    wrap.add(rig.group);
    return {
      group: wrap, water: false, walk: (t) => {
        rig.legs[0].rotation.x = Math.sin(t * 9) * 0.6;
        rig.legs[1].rotation.x = -Math.sin(t * 9) * 0.6;
        rig.arms[0].rotation.x = -Math.sin(t * 9) * 0.5;
        rig.arms[1].rotation.x = Math.sin(t * 9) * 0.5;
      },
    };
  }

  // ---------- timeline ----------

  /** the hero's x on the march */
  private heroX(t: number) {
    return M0.x + ss(MARCH_A, MARCH_B, t) * 20;
  }

  private cameraAt(t: number): [THREE.Vector3, THREE.Vector3] {
    const keys: [number, THREE.Vector3, THREE.Vector3][] = [
      [0, V(-10, 10, 24), V(-8, 7, 0)],
      [5.5, V(3, 10.5, 19), V(0, 7, 0)],
      [9, V(0, 13, 22), V(0, 3, 0)],
      [12, V(0, 16, 26), V(0, 1, 0)],
      [15, V(0, 45, 70), V(0, 0, 0)],
      [18.5, V(0, 150, 95), V(0, 0, 0)],
      [21, SUN.clone().add(V(18, 22, 30)), SUN],
      [23, EARTH.clone().add(V(1.5, 1.2, 5)), EARTH],
      [CUT - 0.05, EARTH.clone().add(V(0.2, 0.3, 2.4)), EARTH],
    ];
    if (t < CUT) {
      let i = 0;
      while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const [ta, pa, la] = keys[i];
      const [tb, pb, lb] = keys[i + 1];
      const k = ss(ta, tb, t);
      return [pa.clone().lerp(pb, k), la.clone().lerp(lb, k)];
    }
    const hero = V(this.heroX(t), W.y, W.z);
    if (t < MARCH_A) {
      const k = ss(CUT, MARCH_A, t);
      return [M0.clone().add(V(0, 0.4, 8)).lerp(M0.clone().add(V(0.6, 0.6, 6)), k), M0.clone()];
    }
    const walkCam = hero.clone().add(V(1.5, 1.2, 8)), walkLook = hero.clone().add(V(1.2, 0.3, 0));
    if (t < MARCH_B + 0.5) {
      const k = ss(MARCH_A, MARCH_A + 0.8, t);
      const from = M0.clone().add(V(0.6, 0.6, 6));
      return [from.lerp(walkCam, k), M0.clone().lerp(walkLook, k)];
    }
    const H = V(M0.x + 20, GROUND, W.z);
    const p1 = H.clone().add(V(0.6, 1.6, 6.2)), l1 = H.clone().add(V(0, 1.3, 0));
    const p2 = H.clone().add(V(0.3, 1.95, 3.6)), l2 = H.clone().add(V(0, 1.75, 0));
    const k1 = ss(MARCH_B + 0.5, 45, t);
    const k2 = ss(45, INTRO_LENGTH, t);
    return [walkCam.clone().lerp(p1, k1).lerp(p2, k2), walkLook.clone().lerp(l1, k1).lerp(l2, k2)];
  }

  private apply(t: number) {
    // camera
    const [cp, cl] = this.cameraAt(t);
    this.camera.position.copy(cp);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cl);
    this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.fov = this.camera.aspect < 0.8 ? 72 : 55;
    this.camera.updateProjectionMatrix();
    const underwater = t >= CUT;
    this.scene.fog = underwater ? this.fog : null;
    this.set.visible = underwater;
    this.hemi.intensity = underwater ? 0.55 : 1.2;
    this.spaceSun.intensity = underwater ? 0 : 2.2;
    this.setSun.intensity = underwater ? 1.3 : 0;

    // disk heats up with every splat
    const hits = this.pellets.reduce((n, _, i) => n + (t > poopRelease(i) + POOP_FALL ? 1 : 0), 0);
    this.diskMat.uniforms.uTime.value = t;
    this.diskMat.uniforms.uHeat.value = 0.35 + hits * 0.13 + ss(12, 16, t) * 0.4;

    // Gary: drift in, turn to camera, plop, drift off looking sheepish
    const g = this.gary;
    const arrive = ss(0, 6, t);
    const leave = ss(12.5, 17, t);
    const gp = V(-26, 9, 4).lerp(V(0, 7.8, 0.5), arrive).lerp(V(10, 16, 6), leave);
    const squat = this.pellets.reduce((m, _, i) => Math.max(m, Math.max(0, 1 - Math.abs(t - poopRelease(i)) * 5)), 0);
    g.group.position.copy(gp).add(V(0, Math.sin(t * 2.2) * 0.25, 0));
    g.group.scale.set(1.3, 1.3 * (1 - squat * 0.12), 1.3);
    g.group.rotation.y = (1 - ss(5.2, 6.8, t)) * (Math.PI / 2) + leave * 0.6;
    g.group.visible = t < 19;
    const flying = t < 6.5 || t > 12.5;
    g.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (flying ? 0.3 + Math.sin(t * 22) * 0.7 : 0.15 + squat * 0.6)));
    g.head.rotation.x = t > 6.5 && t < 12 ? 0.5 : 0;
    g.head.rotation.y = t > 12.5 ? Math.sin(t * 3) * 0.4 : 0;
    g.halo.rotation.z = t * 1.2;

    // pellets: drop from Gary's rear, splat on the disk, spiral into the hole
    const rear = V(0, 0.9, -1.3).multiplyScalar(1.3);
    this.pellets.forEach((p, i) => {
      const r0 = poopRelease(i);
      const f = this.flashes[i];
      const a = i * 1.9 + 0.4;
      const hit = V(Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2).applyAxisAngle(V(1, 0, 0), 0.18);
      p.visible = t > r0 && t < r0 + POOP_FALL + POOP_SPIRAL;
      if (p.visible) {
        const start = V(0, 7.8, 0.5).add(rear);
        if (t < r0 + POOP_FALL) {
          const k = (t - r0) / POOP_FALL;
          p.position.copy(start).lerp(hit, k).add(V(0, Math.sin(k * Math.PI) * 1.2, 0));
        } else {
          const k = (t - r0 - POOP_FALL) / POOP_SPIRAL;
          const ang = a + k * 4;
          const rad = 6.2 * (1 - k);
          p.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad).applyAxisAngle(V(1, 0, 0), 0.18);
          p.scale.setScalar(1 - k * 0.8);
        }
        p.rotation.set(t * 5, t * 3, 0);
      }
      const ft = t - (r0 + POOP_FALL);
      f.visible = ft > 0 && ft < 0.5;
      if (f.visible) {
        f.position.copy(hit);
        f.scale.setScalar(1 + ft * 10);
        f.material.opacity = 1 - ft * 2;
      }
    });

    // galaxy
    this.galaxyMat.uniforms.uForm.value = ss(12.3, 18.5, t);
    this.galaxyMat.uniforms.uTime.value = t;
    this.galaxyMat.uniforms.uPix.value = Math.min(2, window.devicePixelRatio || 1);

    // the warm splat and the cooling rock
    const sk = ss(20.4, SPLAT_HIT, t);
    this.splat.visible = t > 20.4 && t < SPLAT_HIT;
    const from = EARTH.clone().add(V(-6, 4, 3));
    const to = EARTH.clone().add(V(-0.7, 0.6, 0.5));
    this.splat.position.copy(from).lerp(to, sk * sk);
    this.splat.lookAt(from);
    this.splat.rotateX(-Math.PI / 2);
    const cool = ss(SPLAT_HIT + 0.2, 23.8, t);
    this.recolorEarth(cool);
    this.earth.rotation.y = t * 0.3;
    (this.earth.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.55 * (1 - cool);
    this.earthGlow.visible = cool > 0.05;
    this.earthGlow.material.opacity = cool * 0.7;
    const hitF = this.flashes[0];
    if (t > SPLAT_HIT && t < SPLAT_HIT + 0.6) {
      hitF.visible = true;
      hitF.position.copy(to);
      hitF.scale.setScalar(0.5 + (t - SPLAT_HIT) * 6);
      hitF.material.opacity = 1 - (t - SPLAT_HIT) / 0.6;
    }

    // the bubble world goes from sea-teal to sky as life climbs out
    const skyK = ss(33, 36, t);
    (this.bubble.material as THREE.MeshBasicMaterial).color.set(0x0b4f6c).lerp(new THREE.Color(0x9fd8ff), skyK);
    this.fog.color.copy((this.bubble.material as THREE.MeshBasicMaterial).color);
    this.weeds.forEach((w, i) => (w.rotation.z = Math.sin(t * 1.5 + i) * 0.2));

    // cells: wiggle, divide, divide again, drift off
    const div1 = ss(26.3, 27, t), div2 = ss(27.8, 28.5, t), fade = 1 - ss(30.3, 31, t);
    const offsets = [V(0.7 * div1, 0.4 * div2, 0), V(-0.7 * div1, 0.4 * div2, 0), V(0.7 * div1, -0.5 * div2, 0.2), V(-0.7 * div1, -0.5 * div2, -0.2)];
    this.cells.forEach((c, i) => {
      const { body, tail } = c.userData as { body: THREE.Group; tail: THREE.Mesh };
      const w = Math.sin(t * 8 + i);
      body.scale.set(1 + w * 0.08, 1 - w * 0.08, 1 + w * 0.05);
      tail.rotation.y = Math.sin(t * 16 + i) * 0.6;
      if (i === 0) return; // the hero is placed by the march below
      const born = i === 1 ? div1 : div2;
      c.visible = underwater && born > 0.02 && fade > 0.02;
      c.position.copy(M0).add(offsets[i]).add(V(0, Math.sin(t * 2 + i) * 0.1, 0));
      c.scale.setScalar(born * fade * 0.9);
      c.rotation.y = Math.PI / 2 + i;
    });

    // the march of progress
    const hx = this.heroX(t);
    let stage = 0;
    for (let k = 0; k < STAGES.length; k++) if (t >= STAGES[k]) stage = k;
    this.creatures.forEach((c, k) => {
      const start = k === 0 ? CUT : STAGES[k];
      const end = k + 1 < STAGES.length ? STAGES[k + 1] : Infinity;
      const grow = k === 0 ? 1 : ss(start, start + 0.4, t);
      const shrink = end === Infinity ? 1 : 1 - ss(end - 0.2, end + 0.2, t);
      const sc = Math.min(grow, shrink);
      c.group.visible = underwater && sc > 0.01 && t >= start - 0.01;
      if (!c.group.visible) return;
      const y = c.water ? W.y + 0.1 + Math.sin(t * 2) * 0.1 : GROUND;
      c.group.position.set(k === 0 && t < MARCH_A ? M0.x : hx, k === 0 && t < MARCH_A ? M0.y + offsets[0].y : y, W.z);
      if (k === 0 && t < MARCH_A) c.group.position.x += offsets[0].x;
      c.group.scale.setScalar(sc * (k === 0 ? 1 : 1));
      c.group.rotation.y = Math.PI / 2;
      c.walk(t);
    });

    // sparkle at every transformation
    const last = STAGES.slice(1).filter((s0) => t >= s0 - 0.2).pop();
    const sp = last !== undefined ? t - (last - 0.2) : 99;
    this.sparkle.visible = underwater && sp < 0.7;
    if (this.sparkle.visible) {
      this.sparkle.position.set(hx, (stage <= 1 ? W.y : GROUND + 0.8), W.z + 0.3);
      this.sparkle.scale.setScalar(1 + sp * 5);
      this.sparkle.material.opacity = 1 - sp / 0.7;
    }

    // you: walk in, stop, turn to camera, get a halo and a clipboard
    const h = this.human;
    if (t >= STAGES[5]) {
      const walking = t < MARCH_B;
      const sw = walking ? Math.sin(t * 9) * 0.6 : 0;
      h.legs[0].rotation.x = sw;
      h.legs[1].rotation.x = -sw;
      h.arms[0].rotation.x = -sw * 0.7;
      const turn = ss(MARCH_B + 0.3, MARCH_B + 1.5, t);
      h.group.rotation.y = (1 - turn) * (Math.PI / 2);
      const drop = ss(44, 46, t);
      h.halo.visible = t > 44;
      h.halo.position.y = 7 - (7 - 2.15) * drop + Math.sin(ss(45.6, 46.3, t) * Math.PI) * 0.25;
      h.halo.rotation.z = t * 1.5;
      const pop = ss(46.3, 46.8, t);
      h.clip.scale.setScalar(Math.max(0.001, pop));
      const wave = t > 47.2 ? Math.sin((t - 47.2) * 10) * 0.4 : 0;
      h.arms[0].rotation.z = t > 47.2 ? -2.5 + wave : 0;
      h.arms[1].rotation.x = pop * -0.6;
    } else {
      h.halo.visible = false;
      h.clip.scale.setScalar(0.001);
    }
  }

  private recolorEarth(k: number) {
    const q = Math.round(k * 40) / 40;
    if (q === this.earthK) return;
    this.earthK = q;
    const colors = this.earth.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color(), molten = new THREE.Color(), cooled = new THREE.Color();
    const faces = colors.count / 3;
    for (let f = 0; f < faces; f++) {
      const n = this.earthNoise[f * 2], lat = this.earthNoise[f * 2 + 1];
      molten.set(n > 0.05 ? 0xff6a1f : n > -0.1 ? 0x7a2a12 : 0x2a1a14);
      cooled.set(lat > 0.85 ? 0xf4f7fb : n > 0.08 ? 0x5dbb4a : n > 0.02 ? 0xe8d49a : 0x1e6fb8);
      c.copy(molten).lerp(cooled, q);
      for (let v = 0; v < 3; v++) colors.setXYZ(f * 3 + v, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }

  private fire(a: number, b: number) {
    const at = (x: number, s: Sfx) => {
      if (a < x && b >= x) this.audio?.play(s);
    };
    for (let i = 0; i < POOPS; i++) at(poopRelease(i) + POOP_FALL, 'plop');
    at(12.8, 'wake');
    at(SPLAT_HIT, 'boom');
    at(CUT, 'whoosh');
    at(26.4, 'bloop');
    at(27.9, 'bloop');
    STAGES.slice(1).forEach((s0) => at(s0, 'magic'));
    at(46, 'legendary');
    if (a < 40 && b >= 40) this.audio?.setMood('hope');
  }

  update(dt: number) {
    if (this.done) return;
    const prev = this.t;
    this.t = Math.min(INTRO_LENGTH, this.t + dt);
    this.fire(prev, this.t);
    this.apply(this.t);
    if (this.t >= INTRO_LENGTH) this.done = true;
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(INTRO_LENGTH, t));
    this.apply(this.t);
  }

  skip() {
    this.t = INTRO_LENGTH;
    this.done = true;
  }

  caption(): Caption {
    const t = this.t;
    const c = CAPTIONS.find((x) => t >= x.a && t <= x.b);
    if (!c) return { title: '', sub: '', alpha: 0 };
    return { title: c.title, sub: c.sub, alpha: Math.min(ss(c.a, c.a + 0.4, t), 1 - ss(c.b - 0.4, c.b, t)) };
  }

  /** full-screen white flash: the splat, the jump cut, and the fade into the game */
  flash() {
    const t = this.t;
    const tri = (c: number, w: number, peak: number) => Math.max(0, 1 - Math.abs(t - c) / w) * peak;
    return Math.max(tri(SPLAT_HIT, 0.35, 0.5), tri(CUT, 0.45, 1), ss(INTRO_LENGTH - 0.9, INTRO_LENGTH, t));
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    for (const x of this.owned) x.dispose();
    this.glowTex.dispose();
  }
}
