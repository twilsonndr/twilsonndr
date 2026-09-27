// Turns the sim's state into a 3D scene every frame. It never changes the sim.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { DOUBTERS, type SpeakerId } from './content';
import { ARENA, type Sim, type SimEvent, TUNING } from './sim';
import {
  animateCrab,
  type BossRig,
  type Critter,
  type CrabRig,
  makeBoss,
  makeBrute,
  makeCritter,
  makeDoubter,
  makeGull,
  makeKelp,
  makeMoon,
  makeScrew,
  makeSidney,
  makeSixPack,
  makeTideWall,
  moonTexture,
  stretch,
  updateEyes,
} from './models';
import { World, moodFor } from './world';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  grav: number;
}

class Particles {
  mesh: THREE.InstancedMesh;
  private ps: Particle[] = [];
  private dummy = new THREE.Object3D();
  private colors: THREE.Color[] = [];
  constructor(scene: THREE.Scene, private cap = 400) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  burst(x: number, y: number, z: number, n: number, color: THREE.ColorRepresentation, speed = 3, size = 0.1, grav = 9, life = 0.7) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n && this.ps.length < this.cap; i++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random();
      this.ps.push({
        x,
        y,
        z,
        vx: Math.cos(a) * speed * (0.4 + u),
        vy: speed * (0.6 + Math.random()),
        vz: Math.sin(a) * speed * (0.4 + u),
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        grav,
      });
      this.colors.push(c.clone().offsetHSL((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.1));
    }
  }
  update(dt: number) {
    let n = 0;
    for (let i = 0; i < this.ps.length; i++) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      this.ps[n] = p;
      this.colors[n] = this.colors[i];
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.max) * 2));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.mesh.setColorAt(n, this.colors[n]);
      n++;
    }
    this.ps.length = n;
    this.colors.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

function decal(r: number, color: number, inner = 0.85) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * inner, r, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  g.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = 0.005;
  g.add(fill);
  g.position.y = 0.04;
  return { root: g, fill, ring };
}

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer | null = null;
  world: World;
  particles: Particles;
  sidney: CrabRig;
  private shadowBlob: THREE.Mesh;
  private doubters = new Map<SpeakerId, Critter>();
  private talking = new Map<string, number>();
  private rings = new Map<number, { pack: ReturnType<typeof makeSixPack>; critter: Critter }>();
  private followers: Critter[] = [];
  private minions = new Map<number, { rig: CrabRig; tele: ReturnType<typeof decal>; flash: number; lastX: number; lastZ: number }>();
  private blasts = new Map<number, { tele: ReturnType<typeof decal>; gull?: ReturnType<typeof makeGull>; bubble?: THREE.Mesh }>();
  private waves = new Map<number, THREE.Group>();
  private kelps = new Map<number, ReturnType<typeof makeKelp>>();
  private boss: BossRig;
  private bossTele: ReturnType<typeof decal>;
  private screwMark: ReturnType<typeof decal>;
  private flyingScrews: { o: THREE.Object3D; v: THREE.Vector3; life: number }[] = [];
  private moon: THREE.Mesh;
  private moonMat: THREE.MeshBasicMaterial;
  private moonMood = 'happy';
  private moonTex = { happy: moonTexture('happy'), worried: moonTexture('worried'), relieved: moonTexture('relieved') };
  private camPos = new THREE.Vector3(0, 13, 20);
  private camLook = new THREE.Vector3(0, 0, 0);
  private shake = 0;
  private flashT = 0;
  private bossDeadT = 0;
  private lastPX = 0;
  private lastPZ = 0;
  private pinchVis = 0;
  private time = 0;
  lowQuality: boolean;

  constructor(canvas: HTMLCanvasElement) {
    const q = new URLSearchParams(location.search);
    this.lowQuality = q.has('hq') ? false : q.has('lq') || matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lowQuality, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.lowQuality ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 400);
    this.scene.fog = new THREE.Fog(0xbfe4f5, 45, 140);
    this.world = new World(this.scene, this.lowQuality);
    this.particles = new Particles(this.scene);

    if (!this.lowQuality) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.5, 0.88));
      this.composer.addPass(new OutputPass());
    }

    this.sidney = makeSidney();
    this.scene.add(this.sidney.root);
    this.shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    this.shadowBlob.rotation.x = -Math.PI / 2;
    this.shadowBlob.position.y = 0.02;
    this.scene.add(this.shadowBlob);

    for (const d of DOUBTERS) {
      const c = makeDoubter(d.kind);
      c.root.position.set(d.x, 0, d.z);
      c.root.rotation.y = Math.atan2(-d.x * 0.5, 10 - d.z);
      c.root.scale.setScalar(1.6);
      this.scene.add(c.root);
      this.doubters.set(d.id, c);
    }

    this.boss = makeBoss();
    this.boss.root.visible = false;
    this.scene.add(this.boss.root);
    this.bossTele = decal(2.3, 0xff2d55);
    this.bossTele.root.visible = false;
    this.scene.add(this.bossTele.root);
    this.screwMark = decal(0.9, 0xffd166, 0.7);
    this.screwMark.root.visible = false;
    this.scene.add(this.screwMark.root);

    const m = makeMoon();
    this.moon = m.moon;
    this.moonMat = m.mat;
    this.moon.position.set(-18, 34, -110);
    this.moon.scale.setScalar(2.2);
    this.scene.add(this.moon);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  say(who: string, secs = 2.5) {
    this.talking.set(who, secs);
  }

  /** Where a world point lands on screen, in CSS pixels. */
  project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, on: v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2 };
  }

  doubterHead(id: string) {
    const d = DOUBTERS.find((x) => x.id === id);
    return d ? { x: d.x, y: 2.2, z: d.z } : null;
  }

  /** React to sim events with juice: particles, shake, flashes. */
  onEvent(e: SimEvent) {
    const x = e.x ?? 0;
    const z = e.z ?? 0;
    switch (e.t) {
      case 'snip':
        this.particles.burst(x, 0.4, z, 10, 0xe8f4ff, 3, 0.07);
        this.shake = Math.max(this.shake, 0.12);
        break;
      case 'free':
        this.particles.burst(x, 0.5, z, 30, 0xffe066, 5, 0.09, 6, 1);
        this.particles.burst(x, 0.5, z, 20, 0x7dff9a, 4, 0.08, 6, 1);
        break;
      case 'hit':
        this.particles.burst(x, 0.8, z, 16, 0xffd166, 4, 0.1);
        this.shake = Math.max(this.shake, 0.3);
        {
          const mm = [...this.minions.entries()].find(([id]) => id === e.id);
          if (mm) mm[1].flash = 0.25;
        }
        break;
      case 'blocked':
        this.particles.burst(x, 1, z, 6, 0xffffff, 2, 0.08);
        this.shake = Math.max(this.shake, 0.15);
        break;
      case 'minionDown':
        this.particles.burst(x, 0.8, z, 30, 0xb48cff, 6, 0.12);
        this.shake = Math.max(this.shake, 0.4);
        break;
      case 'mega':
        this.particles.burst(x, 0.5, z, 60, 0xffe066, 8, 0.12, 5, 0.9);
        this.shake = Math.max(this.shake, 0.6);
        this.flashT = 0.15;
        break;
      case 'slam':
        this.particles.burst(x, 0.2, z, 24, 0xe9c77b, 5, 0.12);
        this.shake = Math.max(this.shake, 0.45);
        break;
      case 'bigSlam':
        this.particles.burst(x, 0.2, z, 50, 0xe9c77b, 8, 0.16);
        this.shake = Math.max(this.shake, 0.9);
        break;
      case 'impact':
        if (e.text === 'bubble') this.particles.burst(x, 0.3, z, 16, 0x9be7ff, 4, 0.1);
        else this.particles.burst(x, 0.3, z, 14, 0xffffff, 4, 0.1);
        this.shake = Math.max(this.shake, 0.25);
        break;
      case 'hurt':
        this.particles.burst(this.sidney.root.position.x, 0.6, this.sidney.root.position.z, 18, 0xff6a3d, 5, 0.1);
        this.shake = Math.max(this.shake, 0.7);
        this.flashT = 0.12;
        break;
      case 'dash':
        this.particles.burst(x, 0.15, z, 12, 0xf3d59a, 3, 0.1, 6, 0.5);
        break;
      case 'kelp':
        this.particles.burst(x, 0.6, z, 20, 0x7dff9a, 4, 0.1);
        break;
      case 'screw': {
        this.particles.burst(x, 0.6, z, 50, 0xffd166, 8, 0.12, 5, 1.2);
        this.shake = Math.max(this.shake, 1);
        this.flashT = 0.2;
        const s = makeScrew(0.3);
        s.position.set(x, 0.6, z);
        this.scene.add(s);
        this.flyingScrews.push({ o: s, v: new THREE.Vector3((Math.random() - 0.5) * 6, 14, -10), life: 3 });
        break;
      }
      case 'wiggle':
        this.particles.burst(x, 0.8, z, 24, 0xffe066, 4, 0.08, 3, 0.8);
        break;
      case 'bossDown':
        this.bossDeadT = 0.001;
        this.shake = 1.2;
        break;
      case 'chapter':
        this.bossDeadT = 0;
        break;
    }
  }

  private syncRings(sim: Sim) {
    const alive = new Set<number>();
    for (const r of sim.rings) {
      if (r.freed) continue;
      alive.add(r.id);
      let o = this.rings.get(r.id);
      if (!o) {
        const pack = makeSixPack();
        const critter = makeCritter(r.critter);
        pack.root.position.set(r.x, 0, r.z);
        critter.root.position.set(r.x, 0, r.z);
        critter.root.scale.setScalar(1.25);
        pack.root.scale.setScalar(1.3);
        this.scene.add(pack.root, critter.root);
        o = { pack, critter };
        this.rings.set(r.id, o);
      }
      o.pack.rings.forEach((m, i) => (m.visible = i < r.hp * 2));
      // stuck critters wriggle
      o.critter.root.rotation.z = Math.sin(this.time * 9 + r.id) * 0.12;
      o.critter.talk(0.6, this.time + r.id);
      updateEyes(o.critter.eyes, 1 / 60, Math.sin(this.time * 7 + r.id) * 3, 0, 0.06);
    }
    for (const [id, o] of this.rings) {
      if (alive.has(id)) continue;
      this.scene.remove(o.pack.root, o.critter.root);
      this.rings.delete(id);
    }
  }

  private syncFollowers(sim: Sim, dt: number) {
    while (this.followers.length < sim.followers.length) {
      const c = makeCritter(sim.followers[this.followers.length]);
      c.root.scale.setScalar(0.95);
      const p = sim.p;
      c.root.position.set(p.x, 0, p.z + 1);
      this.scene.add(c.root);
      this.followers.push(c);
    }
    while (this.followers.length > sim.followers.length) this.scene.remove(this.followers.pop()!.root);
    this.followers.forEach((c, i) => {
      const idx = (i + 1) * 7;
      const tp = idx < sim.trail.length ? sim.trail[idx] : { x: sim.p.x - sim.p.side * (i + 1) * 1.1, z: sim.p.z + 0.9 };
      const k = 1 - Math.exp(-8 * dt);
      const ox = c.root.position.x;
      c.root.position.x += (tp.x - c.root.position.x) * k;
      c.root.position.z += (tp.z + 0.4 - c.root.position.z) * k;
      const sp = Math.abs(c.root.position.x - ox) / Math.max(dt, 1e-3);
      c.root.position.y = Math.abs(Math.sin(this.time * 9 + i)) * 0.25 * Math.min(1, sp / 2 + 0.25);
      c.root.rotation.y = Math.sin(this.time * 4 + i) * 0.4;
      updateEyes(c.eyes, dt, (c.root.position.x - ox) / Math.max(dt, 1e-3), 0, 0.06);
    });
  }

  private syncMinions(sim: Sim, dt: number) {
    const alive = new Set<number>();
    for (const m of sim.minions) {
      alive.add(m.id);
      let o = this.minions.get(m.id);
      if (!o) {
        const rig = makeBrute();
        const tele = decal(1.5, 0xff2d55);
        this.scene.add(rig.root, tele.root);
        o = { rig, tele, flash: 0, lastX: m.x, lastZ: m.z };
        this.minions.set(m.id, o);
      }
      const vx = (m.x - o.lastX) / Math.max(dt, 1e-4);
      const vz = (m.z - o.lastZ) / Math.max(dt, 1e-4);
      o.lastX = m.x;
      o.lastZ = m.z;
      o.rig.root.position.set(m.x, m.state === 'flee' ? Math.min(3, (m.t ?? 0) * 3) : 0, m.z);
      o.rig.root.rotation.y = m.a;
      let pinch = 0.2;
      let arm = 0;
      if (m.state === 'windup') {
        arm = -1.1 * (1 - m.t / 0.8);
        pinch = 0;
        o.tele.root.visible = true;
        o.tele.root.position.set(m.sx, 0.04, m.sz);
        o.tele.fill.scale.setScalar(Math.max(0.05, 1 - m.t / 0.8));
      } else {
        o.tele.root.visible = false;
      }
      if (m.state === 'stuck') arm = 0.5;
      animateCrab(o.rig, dt, Math.hypot(vx, vz), vx, vz, pinch, this.time + m.id);
      o.rig.armR.rotation.x = arm;
      if (m.state === 'stuck') o.rig.body.rotation.x = 0.25 + Math.sin(this.time * 20) * 0.03;
      else o.rig.body.rotation.x *= 0.8;
      o.flash -= dt;
      o.rig.root.scale.setScalar(o.rig.size * (o.flash > 0 ? 1.12 : 1));
    }
    for (const [id, o] of this.minions) {
      if (alive.has(id)) continue;
      this.scene.remove(o.rig.root, o.tele.root);
      this.minions.delete(id);
    }
  }

  private syncBlasts(sim: Sim) {
    const alive = new Set<number>();
    for (const b of sim.blasts) {
      alive.add(b.id);
      let o = this.blasts.get(b.id);
      if (!o) {
        const tele = decal(b.r, b.kind === 'gull' ? 0xff8a00 : 0x2fb6e8);
        tele.root.position.set(b.x, 0.04, b.z);
        this.scene.add(tele.root);
        o = { tele };
        if (b.kind === 'gull') {
          o.gull = makeGull();
          o.gull.root.scale.setScalar(1.1);
          this.scene.add(o.gull.root);
        } else {
          o.bubble = new THREE.Mesh(
            new THREE.SphereGeometry(0.55, 16, 12),
            new THREE.MeshToonMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.6, emissive: 0x2fb6e8, emissiveIntensity: 0.3 }),
          );
          this.scene.add(o.bubble);
        }
        this.blasts.set(b.id, o);
      }
      const prog = 1 - Math.max(0, b.t) / b.total;
      o.tele.root.visible = !b.done;
      o.tele.fill.scale.setScalar(Math.max(0.05, prog));
      if (o.gull) {
        const g = o.gull;
        if (!b.done) {
          const k = prog * prog;
          g.root.position.set(b.x - (1 - k) * 6, 0.6 + (1 - k) * 12, b.z - (1 - k) * 8);
          g.root.rotation.set(0.6 * k, 0.6, 0);
        } else {
          const u = -b.t;
          g.root.position.set(b.x + u * 14, 0.6 + u * 16, b.z - u * 6);
          g.root.rotation.set(-0.5, 1.2, 0);
        }
        const flap = Math.sin(this.time * 22) * 0.6;
        g.wings[0].rotation.z = -flap;
        g.wings[1].rotation.z = flap;
        updateEyes(g.eyes, 1 / 60, 0, -10, 0.08);
      }
      if (o.bubble) {
        o.bubble.position.set(b.x, 0.5 + Math.max(0, b.t) * 9, b.z);
        o.bubble.visible = !b.done;
      }
    }
    for (const [id, o] of this.blasts) {
      if (alive.has(id)) continue;
      this.scene.remove(o.tele.root);
      if (o.gull) this.scene.remove(o.gull.root);
      if (o.bubble) this.scene.remove(o.bubble);
      this.blasts.delete(id);
    }
  }

  private syncWaves(sim: Sim) {
    const alive = new Set<number>();
    for (const w of sim.waves) {
      alive.add(w.id);
      let g = this.waves.get(w.id);
      if (!g) {
        g = new THREE.Group();
        const lo = -ARENA.hw - 4;
        const hi = ARENA.hw + 4;
        const cuts = [...w.gaps].sort((a, b) => a.x - b.x);
        let x0 = lo;
        const segs: [number, number][] = [];
        for (const c of cuts) {
          segs.push([x0, c.x - c.w / 2]);
          x0 = c.x + c.w / 2;
        }
        segs.push([x0, hi]);
        for (const [a, b] of segs) {
          if (b - a < 0.3) continue;
          const wall = makeTideWall(b - a);
          wall.position.x = (a + b) / 2;
          g.add(wall);
        }
        this.scene.add(g);
        this.waves.set(w.id, g);
      }
      g.position.z = w.z;
      g.position.y = Math.sin(this.time * 6 + w.id) * 0.06 - (w.z < ARENA.zMin - 1 ? (ARENA.zMin - 1 - w.z) * 0.5 : 0);
      if (Math.random() < 0.5) this.particles.burst((Math.random() * 2 - 1) * ARENA.hw, 1.4, w.z, 1, 0xffffff, 1.5, 0.08, 6, 0.4);
    }
    for (const [id, g] of this.waves) {
      if (alive.has(id)) continue;
      this.scene.remove(g);
      this.waves.delete(id);
    }
  }

  private syncKelp(sim: Sim) {
    const alive = new Set<number>();
    for (const k of sim.kelps) {
      alive.add(k.id);
      let o = this.kelps.get(k.id);
      if (!o) {
        o = makeKelp();
        o.root.position.set(k.x, 0, k.z);
        this.scene.add(o.root);
        this.kelps.set(k.id, o);
      }
      o.blades.forEach((b, i) => (b.rotation.z = Math.sin(this.time * 3 + i) * 0.2));
      o.root.rotation.y += 0.02;
    }
    for (const [id, o] of this.kelps) {
      if (alive.has(id)) continue;
      this.scene.remove(o.root);
      this.kelps.delete(id);
    }
  }

  private syncBoss(sim: Sim, dt: number) {
    const b = sim.boss;
    const rig = this.boss;
    const showBoss = !!b && (sim.chapter === 2 || this.bossDeadT > 0);
    rig.root.visible = showBoss || (sim.chapter === 2 && sim.state === 'won');
    this.bossTele.root.visible = false;
    this.screwMark.root.visible = false;
    rig.looseScrew.visible = false;

    // the Moon: up in the sky, then pulled down into the claw, then home again
    let moonTarget = new THREE.Vector3(-18, 34, -110);
    let moonScale = 2.2;
    let mood = 'happy';
    if (sim.chapter === 1) {
      moonTarget = new THREE.Vector3(-14, 26, -80);
      mood = 'worried';
    }
    if (sim.chapter === 2 && sim.state !== 'won' && this.bossDeadT === 0) {
      moonTarget = new THREE.Vector3(-9, 7.6, -17);
      moonScale = 1;
      mood = 'worried';
    }
    if (sim.state === 'won' || this.bossDeadT > 0.8) {
      moonTarget = new THREE.Vector3(-18, 34, -110);
      moonScale = 2.2;
      mood = 'relieved';
    }
    const mk = 1 - Math.exp(-dt * (this.bossDeadT > 0 ? 0.6 : 1.5));
    this.moon.position.lerp(moonTarget, mk);
    this.moon.scale.setScalar(this.moon.scale.x + (moonScale - this.moon.scale.x) * mk);
    this.moon.rotation.y = Math.sin(this.time * 0.5) * 0.08;
    if (mood !== this.moonMood) {
      this.moonMood = mood;
      this.moonMat.map = this.moonTex[mood as keyof typeof this.moonTex];
      this.moonMat.needsUpdate = true;
    }
    if (!rig.root.visible || !b) return;

    const body = rig.crab;
    const dead = b.state === 'dead' || this.bossDeadT > 0;
    if (this.bossDeadT > 0) this.bossDeadT += dt;
    const sink = dead ? Math.min(8, this.bossDeadT * this.bossDeadT * 2) : 0;
    body.root.position.set(0, -1.2 - sink, -13);
    body.root.rotation.z = dead ? Math.min(0.5, this.bossDeadT * 0.3) : Math.sin(this.time * 1.3) * 0.03;
    animateCrab(body, dt, b.anger > 0 ? 6 : 0.5, Math.sin(this.time) * 2, 0, 0, this.time);
    body.body.rotation.x = b.anger > 0 ? Math.sin(this.time * 30) * 0.04 : 0;

    // slamming claw: tips point at the ground when it comes down
    const claw = rig.slamClaw;
    // hovering claws sit a little behind their target so they don't hide Sidney
    const cpos = new THREE.Vector3(b.cx, 0.9 + b.cy, b.cz - Math.min(1.6, b.cy * 0.35));
    if (dead) {
      cpos.y = Math.max(-2, 0.9 - this.bossDeadT * 2);
      claw.root.rotation.set(1.2, 0.3, Math.min(1.4, this.bossDeadT));
      claw.hinge.rotation.x = -0.9;
    } else {
      const down = b.state === 'stuck' || b.state === 'lock' || b.state === 'track';
      claw.root.rotation.set(down ? 1.25 : 0.4, 0, 0);
      claw.hinge.rotation.x = b.state === 'stuck' ? -0.1 : -0.5 - Math.sin(this.time * 6) * 0.15;
      if (b.state === 'stuck') cpos.y = 0.7 + Math.sin(this.time * 25) * 0.04;
    }
    claw.root.position.copy(cpos);
    const shoulder = rig.shoulderR.clone();
    shoulder.y -= sink;
    stretch(rig.slamArm, shoulder, cpos.clone().add(new THREE.Vector3(0, 0.8, -1.2)));
    rig.screws.forEach((s, i) => (s.visible = i < b.screws));

    // moon claw, holding the moon
    const mc = rig.moonClaw;
    const mp = this.moon.position.clone().add(new THREE.Vector3(0.5, -2.2 * this.moon.scale.x, 0.8));
    if (dead) mp.set(-6, Math.max(-3, 6 - this.bossDeadT * 4), -12);
    mc.root.position.copy(mp);
    mc.root.rotation.set(-1.1, 0.4, 0);
    mc.hinge.rotation.x = dead ? -0.9 : -0.25;
    const ls = rig.shoulderL.clone();
    ls.y -= sink;
    stretch(rig.moonArm, ls, mp.clone().add(new THREE.Vector3(0, -1, 0)));

    if (b.state === 'track' || b.state === 'lock') {
      this.bossTele.root.visible = true;
      this.bossTele.root.position.set(b.cx, 0.04, b.cz);
      const prog = b.state === 'track' ? 0.3 : 0.3 + 0.7 * (1 - b.t / 0.5);
      this.bossTele.fill.scale.setScalar(Math.max(0.05, prog));
    }
    if (b.state === 'stuck') {
      rig.looseScrew.visible = true;
      rig.looseScrew.position.set(b.screwX, 0.8 + Math.sin(this.time * 6) * 0.15, b.screwZ);
      rig.looseScrew.rotation.set(0, this.time * 4, 0);
      this.screwMark.root.visible = true;
      this.screwMark.root.position.set(b.screwX, 0.04, b.screwZ);
      this.screwMark.fill.scale.setScalar(0.6 + Math.sin(this.time * 8) * 0.3);
      if (Math.random() < 0.3) this.particles.burst(b.screwX, 1, b.screwZ, 1, 0xffd166, 1.5, 0.06, 1, 0.6);
    }
  }

  render(sim: Sim, dt: number) {
    this.time += dt;
    const p = sim.p;
    const won = sim.state === 'won';
    this.world.setMood(moodFor(sim.chapter, won || this.bossDeadT > 1), dt);
    this.world.update(dt, won || this.bossDeadT > 1 ? 0 : sim.stillness(), p.x * 0.5);

    // Sidney
    const s = this.sidney;
    s.root.position.set(p.x, 0, p.z);
    const vx = (p.x - this.lastPX) / Math.max(dt, 1e-4);
    const vz = (p.z - this.lastPZ) / Math.max(dt, 1e-4);
    this.lastPX = p.x;
    this.lastPZ = p.z;
    this.pinchVis = p.pinchT > 0 ? 1 : Math.max(0, this.pinchVis - dt * 6);
    animateCrab(s, dt, Math.hypot(vx, vz), vx, vz, this.pinchVis, this.time);
    s.root.rotation.y = THREE.MathUtils.clamp(-vx * 0.02, -0.25, 0.25);
    s.root.rotation.z = p.dashT > 0 ? -p.dashDir * 0.35 : 0;
    const blink = p.iframes > 0 && p.dashT <= 0 && sim.state === 'play' && Math.floor(this.time * 20) % 2 === 0;
    s.root.visible = !blink;
    const glow = s.glow.material as THREE.MeshBasicMaterial;
    glow.opacity = p.wiggle ? 0.45 + Math.sin(this.time * 12) * 0.2 : Math.min(0.3, p.combo / TUNING.wiggleNeed) * 0.6;
    s.glow.scale.setScalar((1 / 0.2) * (p.wiggle ? 1.4 + Math.sin(this.time * 12) * 0.2 : 1));
    this.shadowBlob.position.set(p.x, 0.02, p.z);
    if (Math.abs(vx) > 5 && Math.random() < 0.4) this.particles.burst(p.x - Math.sign(vx) * 0.4, 0.1, p.z, 1, 0xf3d59a, 1.2, 0.07, 6, 0.4);
    if (won) {
      s.root.position.y = Math.abs(Math.sin(this.time * 6)) * 0.5;
      s.root.rotation.y = Math.sin(this.time * 3) * 0.3;
    }

    // townsfolk
    for (const d of sim.doubters) {
      const c = this.doubters.get(d.id)!;
      const talk = this.talking.get(d.id) ?? 0;
      if (talk > 0) this.talking.set(d.id, talk - dt);
      c.talk(talk > 0 ? 1 : 0, this.time);
      const base = DOUBTERS.find((x) => x.id === d.id)!;
      c.root.position.y = d.believes ? Math.abs(Math.sin(this.time * 5 + base.x)) * 0.35 : 0;
      updateEyes(c.eyes, dt, (p.x - base.x) * 0.3, 0, 0.1);
    }

    this.syncRings(sim);
    this.syncFollowers(sim, dt);
    this.syncMinions(sim, dt);
    this.syncBlasts(sim);
    this.syncWaves(sim);
    this.syncKelp(sim);
    this.syncBoss(sim, dt);

    for (const f of this.flyingScrews) {
      f.life -= dt;
      f.v.y -= 9 * dt;
      f.o.position.addScaledVector(f.v, dt);
      f.o.rotation.x += dt * 20;
      f.o.rotation.y += dt * 13;
      if (f.life <= 0) this.scene.remove(f.o);
    }
    this.flyingScrews = this.flyingScrews.filter((f) => f.life > 0);
    this.particles.update(dt);

    // camera: frames the whole beach on wide screens, follows harder on tall ones
    const aspect = this.camera.aspect;
    const tall = THREE.MathUtils.clamp((1.5 - aspect) / 1.05, 0, 1);
    const follow = 0.3 + tall * 0.65;
    const dist = 1 + tall * 0.65;
    // the boss fight pulls back and tilts up so you can see the Admiral and the Moon
    const boss = sim.chapter === 2 && sim.boss ? 1 : 0;
    const wantPos = new THREE.Vector3(p.x * follow, (12.5 + boss * 3) * dist, (16 + boss * 3) * dist + p.z * 0.35);
    const wantLook = new THREE.Vector3(p.x * follow, boss * 2, p.z * 0.4 - 2.2 - boss * 2.3);
    const k = 1 - Math.exp(-dt * 4);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sh = this.shake * this.shake * 0.6;
    this.camera.position.set(this.camPos.x + (Math.random() - 0.5) * sh, this.camPos.y + (Math.random() - 0.5) * sh, this.camPos.z);
    this.camera.lookAt(this.camLook);

    this.flashT = Math.max(0, this.flashT - dt);
    this.renderer.toneMappingExposure = 1.05 + this.flashT * 3;

    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
