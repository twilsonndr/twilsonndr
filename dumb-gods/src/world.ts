// The tiny planet and everything that orbits it.
import * as THREE from 'three';
import { FACTIONS, type FactionId } from './content';
import { fbm, rng } from './engine/noise';
import { makeBuilding, makeLoop, type Building } from './models';

export const R = 34;

export function latLon(lat: number, lon: number) {
  const la = THREE.MathUtils.degToRad(lat);
  const lo = THREE.MathUtils.degToRad(lon);
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}

const SITES = FACTIONS.map((f) => ({ id: f.id, dir: latLon(f.lat, f.lon) }));

/** Terrain height above R for a unit direction. Deterministic so gameplay can query it. */
export function heightAt(d: THREE.Vector3) {
  const n = fbm(d.x * 1.5 + 3.1, d.y * 1.5 - 1.7, d.z * 1.5 + 0.4, 5, 7) * 1.9 + 0.12;
  let h = n > 0 ? Math.pow(n, 1.25) * 6 : n * 3.2;
  // mountains get a little extra crunch
  if (h > 2) h += fbm(d.x * 6, d.y * 6, d.z * 6, 2, 3) * 1.4;
  for (const s of SITES) {
    const a = Math.acos(THREE.MathUtils.clamp(d.dot(s.dir), -1, 1));
    if (a < 0.26) {
      const w = THREE.MathUtils.smoothstep(0.26, 0.12, a);
      h = h + (1.25 - h) * w;
    }
  }
  return h;
}

const col = (hex: number) => new THREE.Color(hex);
const C = {
  deep: col(0x2a5d6e), sand: col(0xe8d49a), grass: col(0x5dbb4a), dry: col(0xb59a4c), dead: col(0x8a6a44),
  rock: col(0x8a7f73), snow: col(0xf4f7fb), ash: col(0x5a5450),
};

export class World {
  readonly scene = new THREE.Scene();
  readonly root = new THREE.Group();
  sea = 0.1;
  private terrain: THREE.Mesh;
  private faceDir: Float32Array;
  private faceH: Float32Array;
  private ocean: THREE.Mesh;
  private atmo: THREE.Mesh;
  private clouds = new THREE.Group();
  private cities: THREE.InstancedMesh;
  private sats: THREE.Group[] = [];
  private rings: THREE.Mesh[] = [];
  private lastColorKey = '';
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly buildings = new Map<FactionId, { b: Building; pos: THREE.Vector3; up: THREE.Vector3 }>();
  readonly loop = makeLoop();
  readonly loopPos = new THREE.Vector3(0, R + 16, 0);
  private smog: THREE.Points;
  private smogData: { p: THREE.Vector3; v: THREE.Vector3; life: number }[] = [];
  private smogSources: THREE.Vector3[] = [];

  constructor(lowPower = false) {
    this.scene.background = new THREE.Color(0x07051a);
    this.scene.add(this.root);

    // ---- terrain ----
    const geo = new THREE.IcosahedronGeometry(1, 30);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const h = heightAt(v);
      heights[i] = h;
      v.multiplyScalar(R + h);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const faces = pos.count / 3;
    this.faceDir = new Float32Array(faces * 3);
    this.faceH = new Float32Array(faces);
    for (let f = 0; f < faces; f++) {
      v.set(0, 0, 0);
      for (let k = 0; k < 3; k++) v.add(new THREE.Vector3().fromBufferAttribute(pos, f * 3 + k));
      v.normalize();
      this.faceDir.set([v.x, v.y, v.z], f * 3);
      this.faceH[f] = (heights[f * 3] + heights[f * 3 + 1] + heights[f * 3 + 2]) / 3;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3), 3));
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
    this.terrain.receiveShadow = true;
    this.terrain.castShadow = true;
    this.root.add(this.terrain);

    // ---- ocean ----
    this.ocean = new THREE.Mesh(
      new THREE.IcosahedronGeometry(R, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e88c7, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.86, flatShading: true }),
    );
    this.ocean.receiveShadow = true;
    this.root.add(this.ocean);

    // ---- atmosphere ----
    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.28, 48, 32),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0x5ab8ff) }, uPow: { value: 3.2 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uPow;
          varying vec3 vN; varying vec3 vV;
          void main() {
            float f = pow(1.0 - abs(dot(vN, vV)), uPow);
            gl_FragColor = vec4(uColor * f * 1.6, f);
          }`,
        side: THREE.BackSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.root.add(this.atmo);

    // ---- stars ----
    const r = rng(42);
    const starPos = new Float32Array(3000 * 3);
    const starCol = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize().multiplyScalar(400 + r() * 200);
      starPos.set([v.x, v.y, v.z], i * 3);
      const c = new THREE.Color().setHSL(0.55 + r() * 0.2, 0.5, 0.7 + r() * 0.3);
      starCol.set([c.r, c.g, c.b], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
    this.scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, vertexColors: true, sizeAttenuation: false })));

    // ---- lights ----
    this.hemi = new THREE.HemisphereLight(0xbfdcff, 0x3a2a4a, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(lowPower ? 1024 : 2048, lowPower ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);

    // ---- clouds ----
    for (let i = 0; i < 18; i++) {
      const puff = new THREE.Group();
      const n = 3 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + r() * 1.2, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, transparent: true, opacity: 0.92 }));
        m.position.set((k - n / 2) * 1.4, r() * 0.6, r() * 0.8);
        m.castShadow = true;
        puff.add(m);
      }
      v.set(r() * 2 - 1, r() * 1.6 - 0.8, r() * 2 - 1).normalize();
      puff.position.copy(v).multiplyScalar(R + 13 + r() * 4);
      puff.lookAt(0, 0, 0);
      this.clouds.add(puff);
    }
    this.root.add(this.clouds);

    // ---- cities & data centers: they light up as tech rises ----
    const CITY = 360;
    this.cities = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.4, 1, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      CITY,
    );
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let placed = 0;
    let guard = 0;
    while (placed < CITY && guard++ < 20000) {
      v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      const h = heightAt(v);
      if (h < 0.35 || h > 3 || Math.abs(v.y) > 0.85) continue;
      if (SITES.some((st) => st.dir.dot(v) > Math.cos(0.2))) continue;
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      const tall = 0.4 + r() * r() * 2.4;
      s.set(0.5 + r() * 0.5, tall, 0.5 + r() * 0.5);
      m4.compose(v.clone().multiplyScalar(R + h + tall * 0.5 - 0.1), q, s);
      this.cities.setMatrixAt(placed, m4);
      this.cities.setColorAt(placed, new THREE.Color().setHSL(r() < 0.6 ? 0.11 : 0.53, 0.85, 0.42 + r() * 0.12));
      placed++;
    }
    this.cities.count = 0;
    this.cities.castShadow = true;
    this.root.add(this.cities);

    // ---- satellites ----
    for (let i = 0; i < 36; i++) {
      const orbit = new THREE.Group();
      const sat = new THREE.Group();
      sat.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 })));
      const panel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.7), new THREE.MeshStandardMaterial({ color: 0x1a3a8a, emissive: 0x2255ff, emissiveIntensity: 0.4 }));
      sat.add(panel);
      sat.position.set(R + 22 + r() * 10, 0, 0);
      orbit.add(sat);
      orbit.rotation.set(r() * Math.PI, r() * Math.PI, r() * Math.PI);
      orbit.userData.speed = 0.05 + r() * 0.12;
      orbit.visible = false;
      this.sats.push(orbit);
      this.root.add(orbit);
    }

    // ---- data rings (the singularity, visibly) ----
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(R + 24 + i * 6, 0.18, 6, 160),
        new THREE.MeshStandardMaterial({ color: 0x9ae8ff, emissive: 0x49e6ff, emissiveIntensity: 1.6, transparent: true, opacity: 0 }),
      );
      ring.rotation.x = Math.PI / 2 + (i ? -0.4 : 0.25);
      this.rings.push(ring);
      this.root.add(ring);
    }

    // ---- faction buildings ----
    for (const f of FACTIONS) {
      const b = makeBuilding(f.id);
      const up = latLon(f.lat, f.lon);
      const h = heightAt(up);
      const p = up.clone().multiplyScalar(R + Math.max(h, 0.2) - 0.05);
      b.group.position.copy(p);
      b.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
      // face roughly "south" so players approaching from the garage see the front
      const toward = latLon(0, 0).sub(up.clone().multiplyScalar(up.dot(latLon(0, 0)))).normalize();
      const localFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(b.group.quaternion);
      const ang = Math.atan2(new THREE.Vector3().crossVectors(localFwd, toward).dot(up), localFwd.dot(toward));
      b.group.rotateY(Number.isFinite(ang) ? ang : 0);
      b.group.visible = !f.hidden;
      this.root.add(b.group);
      this.buildings.set(f.id, { b, pos: p, up });
      for (const sm of b.smoke ?? []) this.smogSources.push(b.group.localToWorld(sm.clone()));
    }
    this.root.updateMatrixWorld(true);
    this.smogSources = [];
    for (const f of FACTIONS) {
      const e = this.buildings.get(f.id)!;
      for (const sm of e.b.smoke ?? []) this.smogSources.push(e.b.group.localToWorld(sm.clone()));
    }

    this.loop.group.position.copy(this.loopPos);
    this.loop.group.visible = false;
    this.root.add(this.loop.group);

    // ---- smog particles from the smokestacks ----
    const SM = 140;
    const smGeo = new THREE.BufferGeometry();
    smGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SM * 3), 3));
    this.smog = new THREE.Points(smGeo, new THREE.PointsMaterial({ color: 0x4a4038, size: 2.6, transparent: true, opacity: 0.55, depthWrite: false }));
    for (let i = 0; i < SM; i++) this.smogData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 });
    this.root.add(this.smog);

    this.sea = 0.1 + Math.max(0, 0.72 - 0.62) * 1.9;
    this.recolor(0.62, 0);
  }

  /** Paint the terrain from planet health (0..1). Ice caps shrink and grass browns as it drops. */
  recolor(health: number, nukes: number) {
    const key = `${Math.round(health * 50)}|${Math.round(this.sea * 20)}|${nukes}`;
    if (key === this.lastColorKey) return;
    this.lastColorKey = key;
    const colors = this.terrain.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    const grass = C.grass.clone().lerp(C.dry, THREE.MathUtils.clamp((0.75 - health) * 1.6, 0, 1));
    if (health < 0.3) grass.lerp(C.dead, (0.3 - health) / 0.3);
    if (nukes) grass.lerp(C.ash, Math.min(0.5, nukes * 0.25));
    const iceLat = 0.8 + (1 - health) * 0.17;
    const faces = this.faceH.length;
    for (let f = 0; f < faces; f++) {
      const h = this.faceH[f];
      const y = Math.abs(this.faceDir[f * 3 + 1]);
      if (h < this.sea - 0.4) c.copy(C.deep);
      else if (h < this.sea + 0.3) c.copy(C.sand);
      else if (h > 4.4) c.copy(C.snow);
      else if (h > 2.9) c.copy(C.rock);
      else c.copy(grass);
      if (y > iceLat && h > this.sea - 0.6) c.copy(C.snow);
      // subtle per-face variation so it reads as low-poly, not flat
      const j = (Math.sin(f * 12.9898) * 43758.5453) % 1;
      c.offsetHSL(0, 0, j * 0.03);
      for (let k = 0; k < 3; k++) colors.setXYZ(f * 3 + k, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
  }

  /** Walkable radius at a direction: you can walk on water, a gift from Gary (he thought you were ducks). */
  surface(d: THREE.Vector3) {
    return R + Math.max(heightAt(d), this.sea);
  }

  update(t: number, dt: number, sim: { g: { tech: number; align: number; planet: number; peace: number }; f: Record<FactionId, { dials: Record<string, number>; hidden: boolean }>; loopAwake: boolean; nukes: number }, camUp: THREE.Vector3, camPos: THREE.Vector3, focus: THREE.Vector3) {
    const { tech, planet } = sim.g;
    const health = planet / 100;

    // sea rises as the planet sickens
    const targetSea = 0.1 + Math.max(0, 0.72 - health) * 1.9;
    this.sea += (targetSea - this.sea) * Math.min(1, dt * 0.5);
    this.ocean.scale.setScalar((R + this.sea) / R);
    const om = this.ocean.material as THREE.MeshStandardMaterial;
    om.color.set(0x1e88c7).lerp(new THREE.Color(0x5a6a3a), THREE.MathUtils.clamp(1 - health * 1.4, 0, 0.8));
    this.recolor(health, sim.nukes);

    const am = this.atmo.material as THREE.ShaderMaterial;
    (am.uniforms.uColor.value as THREE.Color).set(0x5ab8ff).lerp(new THREE.Color(0xff8a3a), THREE.MathUtils.clamp(1 - health * 1.3, 0, 1));

    this.clouds.rotation.y += dt * 0.01;
    const cloudCol = new THREE.Color(0xffffff).lerp(new THREE.Color(0x6a5d50), THREE.MathUtils.clamp(1 - health * 1.2, 0, 0.8));
    this.clouds.children.forEach((p) => p.children.forEach((m) => ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).color.copy(cloudCol)));

    this.cities.count = Math.floor(THREE.MathUtils.clamp((tech - 5) / 85, 0, 1) * 360);
    const nSat = Math.floor((tech / 100) * this.sats.length);
    this.sats.forEach((o, i) => {
      o.visible = i < nSat;
      o.rotation.z += dt * o.userData.speed;
    });
    this.rings.forEach((r, i) => {
      const on = THREE.MathUtils.clamp((tech - (45 + i * 20)) / 15, 0, 1);
      (r.material as THREE.MeshStandardMaterial).opacity = on * 0.85;
      r.visible = on > 0.01;
      r.rotation.z += dt * (0.05 + i * 0.03);
    });

    // sun follows the camera loosely so wherever you stand it's daytime (mostly)
    const sunDir = camPos.clone().normalize().multiplyScalar(0.55).add(camUp.clone().multiplyScalar(0.8)).normalize();
    this.sun.position.copy(focus).add(sunDir.multiplyScalar(60));
    this.sun.target.position.copy(focus);
    this.sun.intensity = 1.6 + health * 1.2;
    this.sun.color.set(0xfff1d6).lerp(new THREE.Color(0xffa060), THREE.MathUtils.clamp(1 - health * 1.5, 0, 0.7));

    for (const [id, e] of this.buildings) {
      e.b.group.visible = !sim.f[id].hidden;
      if (e.b.group.visible) e.b.anim(t, sim.f[id].dials, sim.g);
    }
    this.loop.group.visible = sim.loopAwake;
    if (sim.loopAwake) this.loop.update(t, 0.6 + tech / 50, sim.f.loop.dials.bond ?? 0);

    // smog
    const oil = (sim.f.dino.dials.power ?? 50) / 100;
    const sp = this.smog.geometry.attributes.position as THREE.BufferAttribute;
    this.smogData.forEach((p, i) => {
      p.life -= dt;
      if (p.life <= 0 && this.smogSources.length && Math.random() < oil * 0.5) {
        const src = this.smogSources[i % this.smogSources.length];
        p.p.copy(src);
        p.v.copy(src).normalize().multiplyScalar(1.4 + Math.random()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8));
        p.life = 4 + Math.random() * 3;
      }
      if (p.life > 0) p.p.addScaledVector(p.v, dt);
      else p.p.set(0, 0, 0);
      sp.setXYZ(i, p.p.x, p.p.y, p.p.z);
    });
    sp.needsUpdate = true;
    (this.smog.material as THREE.PointsMaterial).opacity = 0.2 + oil * 0.5;
  }
}
