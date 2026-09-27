// The playable layer: you, your halo, the pests, the loot, and a tiny planet to walk around.
import * as THREE from 'three';
import { ENEMIES, FACTION, FACTIONS, QUESTS, RES, RES_IDS, type EnemyKind, type FactionId, type Res } from './content';
import { Audio } from './engine/audio';
import { Intro, type Caption } from './intro';
import { Input } from './engine/input';
import { Renderer } from './engine/renderer';
import { makeEnemy, makePickup, makePlayer, type EnemyModel } from './models';
import {
  advanceQuest, collect, createState, pestPressure, pestWeights, pickEvent, pickHeadline, questAvailable, questDone, rates, tick,
  type SimState,
} from './sim';
import { R, World, latLon } from './world';

export interface UIHooks {
  hud(): void;
  toast(text: string, kind?: 'good' | 'bad' | 'info' | 'loot'): void;
  news(text: string, urgent?: boolean): void;
  prompt(text: string | null): void;
  openTalk(id: FactionId): void;
  openEvent(): void;
  banner(title: string, text: string): void;
  ending(): void;
  questChanged(): void;
  modalOpen(): boolean;
  cinematic(c: Caption, flash: number): void;
}

interface Enemy {
  kind: EnemyKind;
  model: EnemyModel;
  pos: THREE.Vector3;
  hp: number;
  hitCd: number;
  flash: number;
  wander: THREE.Vector3;
}
interface Pickup {
  res: Res;
  group: THREE.Group;
  dir: THREE.Vector3;
  t: number;
  pull: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** Move a point along the sphere surface toward a tangent direction by `dist` world units. */
function slide(dir: THREE.Vector3, tangent: THREE.Vector3, dist: number, radius: number) {
  return dir.clone().addScaledVector(tangent, dist / radius).normalize();
}
function tangentToward(from: THREE.Vector3, to: THREE.Vector3) {
  const n = from.clone().normalize();
  const t = to.clone().sub(from);
  t.addScaledVector(n, -t.dot(n));
  return t.lengthSq() < 1e-8 ? t.set(0, 0, 0) : t.normalize();
}

export class Game {
  sim: SimState = createState();
  readonly world: World;
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1200);
  readonly renderer: Renderer;
  readonly input: Input;
  readonly audio = new Audio();
  ui!: UIHooks;

  // player frame on the sphere
  up = latLon(0, 0);
  camFwd = new THREE.Vector3();
  face = new THREE.Vector3();
  pos = new THREE.Vector3();
  player = makePlayer();
  sanity = 100;
  private sinceHit = 99;
  private zapCd = 0;
  private walkT = 0;

  enemies: Enemy[] = [];
  pickups: Pickup[] = [];
  private spawnT = 3;
  private pickT = 0;
  eventT = 50;
  private newsT = 4;
  private questT = 1;
  nearby: FactionId | null = null;
  paused = true;
  started = false;
  time = 0;
  private bolts: { line: THREE.Line; life: number }[] = [];
  private sparks: Sparks;
  private waypoint: THREE.Mesh;

  constructor(canvas: HTMLCanvasElement, zone: HTMLElement) {
    const lowPower = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.world = new World(lowPower);
    this.renderer = new Renderer(canvas, this.world.scene, this.camera);
    this.renderer.setGrade({ vignette: 0.45, sat: 1.12, haze: 0.05, warmth: 0.1, smog: 0.05 });
    this.input = new Input(zone);
    this.world.scene.add(this.player.group);
    this.sparks = new Sparks(this.world.scene);
    this.waypoint = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.7, 0),
      new THREE.MeshStandardMaterial({ color: 0xffd54a, emissive: 0xffc21a, emissiveIntensity: 2 }),
    );
    this.world.scene.add(this.waypoint);
    this.reset();
    const resize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.fov = this.camera.aspect < 0.8 ? 72 : 58;
      this.camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();
  }

  reset() {
    this.sim = createState();
    this.endingShown = false;
    this.pendingEvent = null;
    for (const e of this.enemies) this.world.scene.remove(e.model.group);
    for (const p of this.pickups) this.world.scene.remove(p.group);
    this.enemies = [];
    this.pickups = [];
    this.sanity = 100;
    this.eventT = 50;
    this.spawnT = 6;
    this.respawnAtGarage();
    // seed some starter loot near the garage so the first minute has something to do
    for (let i = 0; i < 10; i++) {
      const d = slide(latLon(2, 0), new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), 6 + Math.random() * 14, R);
      this.addPickup(RES_IDS[i % RES_IDS.length], d);
    }
    this.snapCamera();
  }

  respawnAtGarage() {
    this.up = latLon(-3, 0).normalize();
    this.camFwd.set(0, 1, 0).addScaledVector(this.up, -this.up.y).normalize();
    this.face.copy(this.camFwd);
    this.pos.copy(this.up).multiplyScalar(this.world.surface(this.up));
  }

  snapCamera() {
    this.placeCamera(1);
  }

  // ---------- main update ----------

  /** Play the opening cinematic, then call onDone. */
  playIntro(onDone: () => void) {
    this.intro = new Intro(this.audio);
    this.introDone = onDone;
    this.renderer.setGrade({ vignette: 0.4, sat: 1.1, haze: 0, warmth: 0.05, smog: 0, glow: 0 });
  }

  private updateIntro(dt: number) {
    const intro = this.intro!;
    this.input.update(dt);
    this.input.flush();
    intro.update(dt);
    this.ui.cinematic(intro.caption(), intro.flash());
    this.renderer.setScene(intro.scene, intro.camera);
    this.renderer.render(dt, this.time);
    if (intro.done) {
      this.renderer.setScene(this.world.scene, this.camera);
      intro.dispose();
      this.intro = null;
      const cb = this.introDone;
      this.introDone = null;
      cb?.();
    }
  }

  update(dt: number) {
    this.time += dt;
    if (this.intro) return this.updateIntro(dt);
    const s = this.sim;
    const live = this.started && !this.paused && !s.over && !this.ui.modalOpen();
    this.input.update(dt);

    if (live) {
      this.updatePlayer(dt);
      this.updateEnemies(dt);
      this.updatePickups(dt);
      const msgs = tick(s, dt);
      for (const m of msgs) {
        if (m.kind === 'wake') {
          this.audio.play('wake');
          this.ui.banner(m.text.startsWith('THE LOOP') ? 'THE LOOP IS AWAKE' : 'SOMETHING NEW APPEARED', m.text);
        } else if (m.kind === 'alert') {
          this.audio.play('alarm');
          this.audio.play('boom');
          this.renderer.hurt = 1.2;
          this.ui.banner('BUTTON PRESSED', m.text);
        } else this.ui.news(m.text);
      }
      const counts = { scroll: 0, lobbyist: 0, misinfo: 0, agent: 0 } as Record<EnemyKind, number>;
      for (const e of this.enemies) counts[e.kind]++;
      pestPressure(s, counts, dt);

      this.eventT -= dt;
      if (this.eventT <= 0) {
        this.eventT = 55 + Math.random() * 20;
        this.pendingEvent = pickEvent(s, Math.random);
        if (this.pendingEvent) {
          this.audio.play('magic');
          this.ui.openEvent();
        }
      }
      this.newsT -= dt;
      if (this.newsT <= 0) {
        this.newsT = 11;
        this.ui.news(pickHeadline(s, Math.random));
      }
      this.questT -= dt;
      if (this.questT <= 0) {
        this.questT = 0.5;
        if (questAvailable(s) && questDone(s)) {
          const done = QUESTS[s.quest];
          const reward = advanceQuest(s);
          if (reward) {
            this.audio.play('rare');
            const got = Object.entries(reward).map(([r, n]) => `${RES[r as Res].icon}×${n}`).join(' ');
            this.ui.toast(`Quest done: ${done.goal}. Gary tips you ${got}`, 'good');
            this.ui.questChanged();
          }
        }
      }
      const danger = s.g.planet < 25 || s.g.peace < 25 || s.g.align < s.g.tech - 25 || (s.f.button.dials.tension ?? 0) > 80;
      this.audio.setMood(danger ? 'tense' : s.g.align > s.g.tech + 10 ? 'hope' : 'calm');
    } else if (!this.started) {
      // title screen: slow orbit
      const q = new THREE.Quaternion().setFromAxisAngle(UP, dt * 0.08);
      this.up.applyQuaternion(q);
      this.camFwd.applyQuaternion(q);
      this.pos.copy(this.up).multiplyScalar(this.world.surface(this.up));
    }

    if (this.started && s.over && !this.endingShown && !this.ui.modalOpen()) {
      this.endingShown = true;
      this.audio.setMood(s.over === 'ascend' ? 'hope' : 'tense');
      this.ui.ending();
    }

    // world visuals keep animating even while menus are open
    this.world.update(this.time, dt, s, this.up, this.camera.position, this.pos);
    this.placeCamera(dt);
    this.animatePlayer(dt);
    this.updateBolts(dt);
    this.sparks.update(dt);
    this.updateWaypoint();
    this.nearby = live ? this.findNearby() : this.nearby;
    if (live) {
      this.ui.prompt(this.nearby ? promptFor(this.nearby) : null);
      if (this.input.consume('interact') && this.nearby) {
        this.audio.play('ui');
        this.input.releaseAll();
        this.ui.openTalk(this.nearby);
      }
    } else this.input.flush();

    const h = s.g.planet / 100;
    this.renderer.setGrade({
      smog: THREE.MathUtils.clamp(0.75 - h, 0, 0.6) + (s.f.dino.dials.power ?? 0) / 600,
      warmth: THREE.MathUtils.clamp(0.8 - h, 0, 0.7),
      haze: THREE.MathUtils.clamp(0.6 - h, 0, 0.6),
      sat: 0.85 + h * 0.35,
      glow: s.g.align > s.g.tech ? 1 : 0,
    });
    this.renderer.render(dt, this.time);
  }

  pendingEvent: ReturnType<typeof pickEvent> = null;
  intro: Intro | null = null;
  private introDone: (() => void) | null = null;
  private endingShown = false;

  // ---------- player ----------

  private updatePlayer(dt: number) {
    const yaw = this.input.takeYaw();
    if (yaw) this.camFwd.applyAxisAngle(this.up, yaw).normalize();
    const right = tmp.crossVectors(this.camFwd, this.up).normalize();
    const mv = tmp2.copy(this.camFwd).multiplyScalar(this.input.moveY).addScaledVector(right, this.input.moveX);
    const mag = Math.min(1, mv.length());
    this.sinceHit += dt;
    if (this.sinceHit > 4) this.sanity = Math.min(100, this.sanity + 5 * dt);

    if (mag > 0.01) {
      mv.normalize();
      const speed = (8.5 + this.sim.up.sandals * 1.6) * mag;
      const oldUp = this.up.clone();
      let next = slide(this.up, mv, speed * dt, R);
      next = this.pushOut(next, 1.1);
      const q = new THREE.Quaternion().setFromUnitVectors(oldUp, next);
      this.up.copy(next);
      this.camFwd.applyQuaternion(q);
      this.camFwd.addScaledVector(this.up, -this.camFwd.dot(this.up)).normalize();
      mv.applyQuaternion(q);
      this.face.lerp(mv, 1 - Math.exp(-12 * dt));
      this.walkT += dt * speed * 1.4;
    } else this.walkT = 0;
    this.face.addScaledVector(this.up, -this.face.dot(this.up)).normalize();
    const surf = this.world.surface(this.up);
    this.pos.copy(this.up).multiplyScalar(surf);

    // zap
    this.zapCd -= dt;
    if (this.input.isHeld('attack') && this.zapCd <= 0) this.zap();
  }

  /** Keep a direction outside building footprints. */
  private pushOut(d: THREE.Vector3, pad: number) {
    for (const [id, e] of this.world.buildings) {
      if (this.sim.f[id].hidden) continue;
      const min = (e.b.radius + pad) / R;
      const a = Math.acos(THREE.MathUtils.clamp(d.dot(e.up), -1, 1));
      if (a < min) {
        const away = tangentToward(e.up, d);
        if (away.lengthSq() === 0) away.set(1, 0, 0);
        d = slide(e.up, away, min * R, R);
      }
    }
    return d;
  }

  private animatePlayer(dt: number) {
    const p = this.player;
    const x = new THREE.Vector3().crossVectors(this.up, this.face).normalize();
    const m = new THREE.Matrix4().makeBasis(x, this.up, this.face);
    p.group.quaternion.setFromRotationMatrix(m);
    p.group.position.copy(this.pos);
    const sw = Math.sin(this.walkT) * 0.7;
    p.legs[0].rotation.x = sw;
    p.legs[1].rotation.x = -sw;
    p.arms[0].rotation.x = -sw * 0.7;
    p.arms[1].rotation.x = this.zapCd > 0.1 ? -1.6 : sw * 0.5 - 0.3;
    p.halo.rotation.z += dt * 2;
    p.halo.position.y = 2.15 + Math.sin(this.time * 3) * 0.05;
    p.body.position.y = 0.95 + Math.abs(Math.sin(this.walkT)) * 0.06;
  }

  private placeCamera(dt: number) {
    const dist = this.started ? 14.5 : 58;
    const height = this.started ? 9 : 30;
    const desired = this.pos.clone().addScaledVector(this.up, height).addScaledVector(this.camFwd, -dist);
    // keep the camera above ground
    const cd = desired.clone().normalize();
    const minR = this.world.surface(cd) + 2;
    if (desired.length() < minR) desired.copy(cd.multiplyScalar(minR));
    const k = dt >= 1 ? 1 : 1 - Math.exp(-6 * dt);
    this.camera.position.lerp(desired, k);
    this.camera.up.lerp(this.up, k).normalize();
    const look = this.pos.clone().addScaledVector(this.up, this.started ? 1.8 : -6).addScaledVector(this.camFwd, this.started ? 3 : 0);
    this.camera.lookAt(look);
  }

  private findNearby(): FactionId | null {
    let best: FactionId | null = null;
    let bd = Infinity;
    for (const [id, e] of this.world.buildings) {
      if (this.sim.f[id].hidden) continue;
      const d = e.pos.distanceTo(this.pos) - e.b.radius;
      if (d < 4.2 && d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  // ---------- zapping ----------

  private zap() {
    let target: Enemy | null = null;
    let bd = 16 + this.sim.up.halo * 2;
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(this.pos);
      if (d < bd) {
        bd = d;
        target = e;
      }
    }
    this.zapCd = 0.3;
    if (!target) {
      this.zapCd = 0.5;
      return;
    }
    const from = this.pos.clone().addScaledVector(this.up, 2.15);
    const to = target.pos.clone().addScaledVector(target.pos.clone().normalize(), 1);
    this.bolt(from, to);
    this.audio.play('zap');
    target.hp -= 1 + this.sim.up.halo * 0.6;
    target.flash = 0.15;
    target.pos.copy(slide(target.pos.clone().normalize(), tangentToward(this.pos, target.pos), 1.2, R).multiplyScalar(target.pos.length()));
    this.sparks.burst(to, 0xffd54a, 10);
    if (target.hp <= 0) this.killEnemy(target);
    else this.audio.play('hit');
  }

  private killEnemy(e: Enemy) {
    this.audio.play('kill');
    this.sparks.burst(e.pos.clone().addScaledVector(e.pos.clone().normalize(), 1), ENEMIES[e.kind].color, 26);
    this.world.scene.remove(e.model.group);
    this.enemies.splice(this.enemies.indexOf(e), 1);
    this.sim.stats.zapped++;
    const def = ENEMIES[e.kind];
    const n = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const d = slide(e.pos.clone().normalize(), new THREE.Vector3().randomDirection(), 1 + Math.random() * 1.5, R);
      this.addPickup(def.drops[i % def.drops.length], d);
    }
  }

  private bolt(a: THREE.Vector3, b: THREE.Vector3) {
    const pts: THREE.Vector3[] = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const p = a.clone().lerp(b, i / N);
      if (i > 0 && i < N) p.add(new THREE.Vector3().randomDirection().multiplyScalar(0.45));
      pts.push(p);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xfff2a0, transparent: true, blending: THREE.AdditiveBlending }),
    );
    this.world.scene.add(line);
    this.bolts.push({ line, life: 0.14 });
  }

  private updateBolts(dt: number) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.14);
      if (b.life <= 0) {
        this.world.scene.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        this.bolts.splice(i, 1);
      }
    }
  }

  // ---------- pests ----------

  private updateEnemies(dt: number) {
    const s = this.sim;
    const cap = 5 + Math.floor(s.g.tech / 14) + Math.floor((s.f.clippy.dials.power ?? 0) / 25);
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.enemies.length < cap) {
      this.spawnT = 3.2 + Math.random() * 2.5;
      this.spawnEnemy();
    }
    const garage = this.world.buildings.get('garage')!.up;
    for (const e of [...this.enemies]) {
      const def = ENEMIES[e.kind];
      e.hitCd -= dt;
      e.flash -= dt;
      const d = e.pos.distanceTo(this.pos);
      const dir = e.pos.clone().normalize();
      let t: THREE.Vector3;
      if (d < 30) t = tangentToward(e.pos, this.pos);
      else {
        if (Math.random() < dt * 0.3) e.wander.randomDirection();
        t = e.wander.clone().addScaledVector(dir, -e.wander.dot(dir)).normalize();
      }
      let next = slide(dir, t, def.speed * dt * (d < 30 ? 1 : 0.5), R);
      // the nest is a safe zone: pests are scared of a bird this large
      const ga = Math.acos(THREE.MathUtils.clamp(next.dot(garage), -1, 1));
      if (ga < 10 / R) next = slide(garage, tangentToward(garage, next), 10, R);
      e.pos.copy(next).multiplyScalar(this.world.surface(next));
      const g = e.model.group;
      g.position.copy(e.pos);
      const face = tangentToward(e.pos, this.pos);
      if (face.lengthSq() > 0) {
        const up = next;
        const x = new THREE.Vector3().crossVectors(up, face).normalize();
        g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, face));
      }
      e.model.anim(this.time + e.wander.x * 10);
      g.scale.setScalar(e.flash > 0 ? 1.25 : 1);

      if (d < 1.6 && e.hitCd <= 0) {
        e.hitCd = 1.1;
        this.hurt(def.dmg);
        if (e.kind === 'lobbyist') this.steal(['votes', 'cash'], 'A lobbyist pockets');
        if (e.kind === 'scroll') this.steal(['hope'], 'The doomscroll drone drains');
        if (e.kind === 'misinfo') this.steal(['facts'], 'The misinfo blob smears');
        e.pos.copy(slide(next, tangentToward(this.pos, e.pos), 3, R).multiplyScalar(e.pos.length()));
      }
      // wandered to the far side of the world: recycle it
      if (d > 58) {
        this.world.scene.remove(g);
        this.enemies.splice(this.enemies.indexOf(e), 1);
      }
    }
  }

  private steal(from: Res[], verb: string) {
    const have = from.filter((r) => this.sim.res[r] > 0);
    if (!have.length) return;
    const r = have[Math.floor(Math.random() * have.length)];
    this.sim.res[r]--;
    this.ui.toast(`${verb} 1 ${RES[r].name}`, 'bad');
  }

  private spawnEnemy() {
    const w = pestWeights(this.sim);
    const kinds = Object.keys(w) as EnemyKind[];
    const total = kinds.reduce((a, k) => a + w[k], 0);
    let roll = Math.random() * total;
    let kind: EnemyKind = 'scroll';
    for (const k of kinds) {
      roll -= w[k];
      if (roll <= 0) {
        kind = k;
        break;
      }
    }
    const t = new THREE.Vector3().randomDirection();
    t.addScaledVector(this.up, -t.dot(this.up)).normalize();
    const dir = slide(this.up, t, 22 + Math.random() * 14, R);
    const model = makeEnemy(kind);
    const pos = dir.clone().multiplyScalar(this.world.surface(dir));
    model.group.position.copy(pos);
    this.world.scene.add(model.group);
    this.enemies.push({ kind, model, pos, hp: ENEMIES[kind].hp, hitCd: 0, flash: 0, wander: new THREE.Vector3().randomDirection() });
  }

  hurt(n: number) {
    this.sanity -= n;
    this.sinceHit = 0;
    this.renderer.hurt = Math.min(1, this.renderer.hurt + 0.5);
    this.audio.play('hurt');
    if (this.sanity <= 0) this.breakdown();
  }

  private breakdown() {
    this.audio.play('death');
    const lost: string[] = [];
    for (const r of RES_IDS) {
      const n = Math.floor(this.sim.res[r] * 0.3);
      if (n > 0) {
        this.sim.res[r] -= n;
        lost.push(`${RES[r].icon}${n}`);
      }
    }
    // a mental health day costs the world a few months
    for (let i = 0; i < 15; i++) tick(this.sim, 1);
    this.sanity = 100;
    for (const e of this.enemies) this.world.scene.remove(e.model.group);
    this.enemies = [];
    this.respawnAtGarage();
    this.snapCamera();
    this.ui.banner('YOU HAD A LITTLE BREAKDOWN', `Totally normal given everything. Gary carried you back to the nest and regurgitated you some soup. It was bird soup. You ate it anyway. The world kept going without you for a few months.${lost.length ? ` You dropped ${lost.join(' ')} on the way.` : ''}`);
  }

  // ---------- loot ----------

  private addPickup(res: Res, dir: THREE.Vector3) {
    const group = makePickup(res, RES[res].color);
    this.world.scene.add(group);
    this.pickups.push({ res, group, dir: dir.clone().normalize(), t: Math.random() * 10, pull: false });
  }

  private updatePickups(dt: number) {
    this.pickT -= dt;
    if (this.pickT <= 0 && this.pickups.length < 26) {
      this.pickT = 1;
      this.spawnPickup();
    }
    const grab = 1.9 + this.sim.up.pockets * 1.1;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      const surf = this.world.surface(p.dir);
      const pos = tmp.copy(p.dir).multiplyScalar(surf + 1.1 + Math.sin(p.t * 2.5) * 0.25);
      const d = pos.distanceTo(this.pos);
      if (d < grab * 2.2) p.pull = true;
      if (p.pull) p.dir.lerp(this.up, Math.min(1, dt * 7)).normalize();
      p.group.position.copy(pos);
      const x = new THREE.Vector3().crossVectors(p.dir, this.camFwd).normalize();
      p.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, p.dir, this.camFwd));
      p.group.rotateY(p.t * 2);
      if (d < grab) {
        collect(this.sim, p.res);
        this.audio.play(p.res === 'cash' ? 'coin' : 'pickup');
        this.sparks.burst(pos, RES[p.res].color, 8);
        this.ui.toast(`+1 ${RES[p.res].icon} ${RES[p.res].name}`, 'loot');
        this.world.scene.remove(p.group);
        this.pickups.splice(i, 1);
      } else if (p.dir.angleTo(this.up) > 2.4) {
        // far side of the world: recycle so fresh loot shows up near you
        this.world.scene.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  private spawnPickup() {
    const weights: Record<Res, FactionId[]> = {
      compute: ['labs', 'clippy'], facts: ['warden', 'hats', 'labs'], memes: ['mega', 'folks'], hope: ['folks', 'hats', 'garage'],
      sun: ['folks', 'garage'], votes: ['folks', 'button'], cash: ['mega', 'dino'],
    };
    const res = RES_IDS[Math.floor(Math.random() * RES_IDS.length)];
    let base: THREE.Vector3;
    if (Math.random() < 0.5) {
      const fid = weights[res][Math.floor(Math.random() * weights[res].length)];
      base = this.world.buildings.get(fid)!.up;
    } else base = this.up;
    const t = new THREE.Vector3().randomDirection();
    t.addScaledVector(base, -t.dot(base)).normalize();
    const dist = base === this.up ? 10 + Math.random() * 26 : 6 + Math.random() * 10;
    this.addPickup(res, slide(base, t, dist, R));
  }

  // ---------- waypoint for the current quest ----------

  questTarget(): FactionId | null {
    const q = QUESTS[this.sim.quest];
    if (!q) return this.sim.loopAwake ? 'loop' : null;
    switch (q.id) {
      case 'safety': return 'labs';
      case 'tension': return 'button';
      case 'planet': return 'dino';
      case 'align': return 'labs';
      case 'loop': return this.sim.loopAwake ? 'loop' : null;
      case 'use': return 'folks';
    }
    return null;
  }

  private updateWaypoint() {
    const id = this.started ? this.questTarget() : null;
    this.waypoint.visible = !!id && !this.sim.f[id].hidden;
    if (!id || !this.waypoint.visible) return;
    const e = this.world.buildings.get(id)!;
    this.waypoint.position.copy(e.pos).addScaledVector(e.up, e.b.labelY + 1.6 + Math.sin(this.time * 3) * 0.3);
    this.waypoint.quaternion.setFromUnitVectors(UP, e.up);
    this.waypoint.rotateY(this.time * 2);
  }
}

export function promptFor(id: FactionId) {
  const f = FACTION[id];
  if (id === 'garage') return 'Visit Gary';
  if (id === 'loop') return 'Talk to The Loop';
  return `Talk to ${f.leader}`;
}

export const FACTION_ORDER = FACTIONS.map((f) => f.id);

/** Cheap additive spark bursts. */
class Sparks {
  private pts: THREE.Points;
  private vel: THREE.Vector3[] = [];
  private life: Float32Array;
  private N = 300;
  private next = 0;
  constructor(scene: THREE.Scene) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.pts.frustumCulled = false;
    this.life = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) this.vel.push(new THREE.Vector3());
    scene.add(this.pts);
  }
  burst(at: THREE.Vector3, color: number, n: number) {
    const pos = this.pts.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.pts.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next++ % this.N;
      pos.setXYZ(i, at.x, at.y, at.z);
      col.setXYZ(i, c.r, c.g, c.b);
      this.vel[i].randomDirection().multiplyScalar(3 + Math.random() * 5).addScaledVector(at.clone().normalize(), 3);
      this.life[i] = 0.5 + Math.random() * 0.4;
    }
  }
  update(dt: number) {
    const pos = this.pts.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.pts.geometry.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const x = pos.getX(i) + this.vel[i].x * dt, y = pos.getY(i) + this.vel[i].y * dt, z = pos.getZ(i) + this.vel[i].z * dt;
      pos.setXYZ(i, x, y, z);
      this.vel[i].multiplyScalar(1 - dt * 2.5);
      if (this.life[i] <= 0) {
        pos.setXYZ(i, 0, 0, 0);
        col.setXYZ(i, 0, 0, 0);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }
}

export { rates };
