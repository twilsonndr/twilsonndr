// The beach, the sea, the sky. Two knobs drive the drama:
//   motion: 1 = waves rolling, 0 = the ocean has gone dead still
//   tide:   0 = normal, 1 = the Moon is gone and the tides are haywire
//           (the west beach floods, the east side drains to bare seabed)
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ARENA } from './sim';
import { makeFish, makePalm, makeRock, makeSandcastle, makeShell, makeSign, makeUmbrella, type Critter } from './models';

export interface SkyMood {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemi: number;
  fog: THREE.Color;
  glow: THREE.Color;
}

const mood = (top: number, horizon: number, sun: number, sunI: number, hemi: number, fog: number, glow: number): SkyMood => ({
  top: new THREE.Color(top),
  horizon: new THREE.Color(horizon),
  sun: new THREE.Color(sun),
  sunI,
  hemi,
  fog: new THREE.Color(fog),
  glow: new THREE.Color(glow),
});

const MOODS: Record<string, SkyMood> = {
  day: mood(0x2f8ff0, 0xbfe8ff, 0xfff1d6, 2.6, 1.25, 0xc4e6f5, 0xfff4d0),
  afternoon: mood(0x3f6fd6, 0xffc28a, 0xffd2a0, 2.4, 1.1, 0xf0c8a4, 0xffb070),
  doom: mood(0x160f33, 0xa33d5c, 0xff9d8a, 1.7, 0.8, 0x5b2d4a, 0xff5a6e),
  dawn: mood(0x4aa8ff, 0xffd1e8, 0xfff0c0, 2.8, 1.3, 0xffe0ec, 0xfff0b0),
};

export function moodFor(chapter: number, won: boolean) {
  if (won) return MOODS.dawn;
  return [MOODS.day, MOODS.afternoon, MOODS.doom][chapter] ?? MOODS.day;
}

/** Height of the water at world x once the tides go wrong: up in the west, down in the east. */
export const TIDE_GLSL = `
  float tideAt(float x, float tide) {
    float flood = smoothstep(-10.0, -16.0, x) * 0.95;
    float drain = smoothstep(6.0, 18.0, x) * -2.3;
    return tide * (flood + drain);
  }`;

export function tideAt(x: number, tide: number) {
  const s = (a: number, b: number, v: number) => {
    const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  return tide * (s(-10, -16, x) * 0.95 + s(6, 18, x) * -2.3);
}

const SHARED = `
  #include <common>
  ${TIDE_GLSL}
`;

function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 128;
  const c = cv.getContext('2d')!;
  const puffs: [number, number, number][] = [
    [70, 80, 36],
    [110, 62, 46],
    [158, 70, 40],
    [196, 84, 30],
    [130, 90, 38],
  ];
  for (const [x, y, r] of puffs) {
    const g = c.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function crackTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const c = cv.getContext('2d')!;
  c.strokeStyle = 'rgba(90,60,30,0.75)';
  c.lineCap = 'round';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    let x = rnd() * 256;
    let y = rnd() * 256;
    c.lineWidth = 1 + rnd() * 2.5;
    c.beginPath();
    c.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rnd() - 0.5) * 60;
      y += (rnd() - 0.5) * 60;
      c.lineTo(x, y);
    }
    c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Bake a group of static meshes into one mesh per material: far fewer draw calls. */
function mergeStatic(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (Array.isArray(m.material) || (m.material as THREE.Material).transparent) {
      keep.push(m);
      return;
    }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      keep.push(m);
      return;
    }
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    g.clearGroups();
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}|${m.castShadow}`;
    if (!buckets.has(key)) buckets.set(key, { mat, cast: m.castShadow, geos: [] });
    buckets.get(key)!.geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  for (const k of keep) {
    k.updateMatrixWorld(true);
    const c = k.clone();
    new THREE.Matrix4().multiplyMatrices(inv, k.matrixWorld).decompose(c.position, c.quaternion, c.scale);
    out.add(c);
  }
  return out;
}

export class World {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  skyMat: THREE.ShaderMaterial;
  seaMat: THREE.ShaderMaterial;
  mood: SkyMood = {
    ...MOODS.day,
    top: MOODS.day.top.clone(),
    horizon: MOODS.day.horizon.clone(),
    sun: MOODS.day.sun.clone(),
    fog: MOODS.day.fog.clone(),
    glow: MOODS.day.glow.clone(),
  };
  motion = 1;
  /** 0 = normal tides, 1 = haywire. Set by the renderer (and the cutscene). */
  tide = 0;
  private seaTime = 0;
  private clouds: THREE.Sprite[] = [];
  private cracks: THREE.Mesh;
  private stranded: Critter[] = [];

  constructor(private scene: THREE.Scene, shadowSize: number) {
    scene.add(this.group);

    // sky dome with a soft sun glow
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: this.mood.top },
        horizon: { value: this.mood.horizon },
        glow: { value: this.mood.glow },
        sunDir: { value: new THREE.Vector3(0.55, 0.28, -0.79).normalize() },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; varying vec3 vP;
        void main(){
          float h = clamp(vP.y*1.6+0.05,0.0,1.0);
          vec3 col = mix(horizon, top, pow(h,0.75));
          float s = max(dot(vP, sunDir), 0.0);
          col += glow * (pow(s, 600.0) * 1.5 + pow(s, 24.0) * 0.35);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), this.skyMat));

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe8c890, this.mood.hemi);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.mood.sun, this.mood.sunI);
    this.sun.position.set(-10, 22, 14);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -19;
    sc.right = 19;
    sc.top = 16;
    sc.bottom = -16;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.setShadowSize(shadowSize);
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.buildSand();
    this.seaMat = this.buildSea();
    this.buildFlood();
    this.cracks = this.buildDrySeabed();
    this.buildClouds();
    this.buildDecor();
  }

  setShadowSize(n: number) {
    if (n <= 0) {
      this.sun.castShadow = false;
      return;
    }
    this.sun.castShadow = true;
    if (this.sun.shadow.mapSize.x !== n) {
      this.sun.shadow.mapSize.set(n, n);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  private buildSand() {
    // runs well out under the sea so a drained tide reveals seabed, not a cliff edge
    const geo = new THREE.PlaneGeometry(90, 60, 90, 60);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const dry = new THREE.Color(0xf6d89c);
    const wet = new THREE.Color(0xc29a5e);
    const deep = new THREE.Color(0x9c7a4c);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) + 3;
      pos.setZ(i, z);
      const inArena = Math.abs(x) < ARENA.hw + 2 && z > ARENA.zMin - 2 && z < ARENA.zMax + 2;
      let y = inArena ? 0 : Math.sin(x * 0.35) * Math.cos(z * 0.4) * 0.35 + Math.max(0, Math.abs(x) - ARENA.hw - 3) * 0.12;
      if (z < ARENA.zMin - 1.5) y -= (ARENA.zMin - 1.5 - z) * 0.25;
      pos.setY(i, y);
      const wetness = THREE.MathUtils.clamp((ARENA.zMin + 1 - z) / 3, 0, 1);
      c.copy(dry).lerp(wet, wetness).lerp(deep, THREE.MathUtils.clamp(-y / 2, 0, 1));
      const n = Math.sin(x * 3.1 + z * 1.7) * Math.sin(x * 1.3 - z * 2.9) * 0.035 + Math.sin(x * 0.9 + z * 0.4) * 0.02;
      c.offsetHSL(0, 0, n);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const sand = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    sand.receiveShadow = true;
    this.group.add(sand);
  }

  private waterMaterial(extra: Record<string, THREE.IUniform> = {}) {
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        motion: { value: 1 },
        tide: { value: 0 },
        deep: { value: new THREE.Color(0x0668b0) },
        shallow: { value: new THREE.Color(0x1fc9c4) },
        sky: { value: new THREE.Color(0xbfe9ff) },
        shore: { value: ARENA.zMin - 2.2 },
        edgeX: { value: 999 },
        ...extra,
      },
      vertexShader: `
        ${SHARED}
        uniform float time; uniform float motion; uniform float shore; uniform float tide;
        varying float vH; varying float vShore; varying vec3 vW;
        void main(){
          vec4 wp0 = modelMatrix*vec4(position,1.0);
          vec3 p = wp0.xyz;
          float w = sin(p.x*0.35 + time*1.3)*0.35 + sin(p.x*0.8 - p.z*0.5 + time*2.1)*0.18 + sin(p.z*0.9 + time*1.7)*0.22;
          p.y += w*motion + tideAt(p.x, tide);
          p.z += sin(time*0.9)*0.9*motion*smoothstep(-20.0, shore, p.z);
          vH = w*motion;
          vShore = smoothstep(shore-1.5, shore, p.z);
          vW = p;
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
        }`,
      fragmentShader: `
        ${SHARED}
        uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; uniform float motion; uniform float time; uniform float edgeX;
        varying float vH; varying float vShore; varying vec3 vW;
        void main(){
          float d = clamp(-vW.z/60.0, 0.0, 1.0);
          vec3 col = mix(shallow, deep, smoothstep(0.0, 0.55, d));
          vec3 V = normalize(cameraPosition - vW);
          float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
          col = mix(col, sky, 0.06 + fres*0.3);
          float crest = smoothstep(0.35, 0.6, vH)*motion;
          float glint = step(0.996, fract(sin(dot(floor(vW.xz*2.0), vec2(12.9898,78.233)) + floor(time*2.0))*43758.5453)) * smoothstep(0.5, 0.1, d) * 0.7;
          col = mix(col, vec3(1.0), clamp(crest*0.55 + vShore*0.7 + glint, 0.0, 1.0));
          float a = 0.9 * smoothstep(edgeX + 2.5, edgeX, vW.x);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      fog: false,
    });
  }

  private buildSea() {
    const mat = this.waterMaterial();
    const geo = new THREE.PlaneGeometry(200, 90, 100, 45);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.25, -45 + ARENA.zMin - 2.2);
    const sea = new THREE.Mesh(geo, mat);
    sea.renderOrder = 1;
    this.group.add(sea);
    return mat;
  }

  private floodMat: THREE.ShaderMaterial | null = null;
  private flood: THREE.Mesh | null = null;
  private buildFlood() {
    // the west beach, underwater when the tides go wrong; sits below the sand until then
    this.floodMat = this.waterMaterial({ shore: { value: 99 }, edgeX: { value: -12.2 } });
    const geo = new THREE.PlaneGeometry(34, 30, 34, 15);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-29, -0.35, 1);
    const flood = new THREE.Mesh(geo, this.floodMat);
    flood.renderOrder = 1;
    flood.visible = false;
    this.flood = flood;
    this.group.add(flood);
  }

  private buildDrySeabed() {
    // cracked mud and stranded fish on the east side, revealed as the water drains
    const geo = new THREE.PlaneGeometry(16, 9);
    geo.rotateX(-Math.PI / 2);
    const cracks = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    cracks.position.set(17, -1.3, -14.5);
    cracks.rotation.x = -0.24;
    this.group.add(cracks);
    for (const [x, z] of [
      [11, -12],
      [15, -14],
      [19, -11.5],
    ]) {
      const f = makeFish();
      f.root.position.set(x, 0, z);
      f.root.rotation.z = Math.PI / 2;
      f.root.visible = false;
      this.group.add(f.root);
      this.stranded.push(f);
    }
    return cracks;
  }

  private buildClouds() {
    const tex = cloudTexture();
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
      const w = 22 + (i % 3) * 10;
      s.scale.set(w, w / 2, 1);
      s.position.set(-90 + i * 26 + (i % 2) * 8, 22 + (i % 4) * 6, -110 - (i % 3) * 18);
      this.group.add(s);
      this.clouds.push(s);
    }
  }

  private buildDecor() {
    const decor = new THREE.Group();
    const place = (o: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      o.scale.setScalar(s);
      decor.add(o);
      return o;
    };
    place(makePalm(6), -17, -3, 0.4, 1.1);
    place(makePalm(5), -19, 4, 2, 1);
    place(makePalm(6.5), 17.5, -4, 2.6, 1.1);
    place(makePalm(5), 19, 5, -0.5, 0.95);
    place(makePalm(7), -24, -8, 1, 1.2);
    place(makePalm(7), 24, -9, 3, 1.2);
    place(makeUmbrella(), 16.5, 8.5, -0.4);
    place(makeSandcastle(), -16.5, 9, 0.3);
    place(makeSign('NO BIG CLAWS', 'by order of the Tidepool Council'), -6, 10.5, 0.1, 1.2);
    place(makeSign('TIDEPOOL TOWN', 'pop. 7 (and falling)'), 7, 10.5, -0.12, 1.1);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const x = (rnd() * 2 - 1) * 22;
      const z = -6 + rnd() * 18;
      if (Math.abs(x) < ARENA.hw + 1) continue;
      place(makeRock(0.3 + rnd() * 0.7), x, z);
    }
    const shellColors = [0xffc0cb, 0xfff0d9, 0xffb07a, 0xe6d3ff];
    for (let i = 0; i < 40; i++) {
      const s = makeShell(shellColors[i % shellColors.length]);
      s.castShadow = false;
      s.position.x = (rnd() * 2 - 1) * (ARENA.hw + 4);
      s.position.z = ARENA.zMin + rnd() * (ARENA.zMax - ARENA.zMin + 4);
      decor.add(s);
    }
    for (const [x, z, r] of [
      [15.5, 1.5, 1.1],
      [-15, 1, 1.4],
    ]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshToonMaterial({ color: 0x46d1e0, transparent: true, opacity: 0.8 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.03, z);
      decor.add(pool);
    }
    this.group.add(mergeStatic(decor));
  }

  setMood(target: SkyMood, dt: number) {
    const k = 1 - Math.exp(-dt * 1.2);
    this.mood.top.lerp(target.top, k);
    this.mood.horizon.lerp(target.horizon, k);
    this.mood.sun.lerp(target.sun, k);
    this.mood.fog.lerp(target.fog, k);
    this.mood.glow.lerp(target.glow, k);
    this.mood.sunI += (target.sunI - this.mood.sunI) * k;
    this.mood.hemi += (target.hemi - this.mood.hemi) * k;
    this.sun.color.copy(this.mood.sun);
    this.sun.intensity = this.mood.sunI;
    this.hemi.intensity = this.mood.hemi;
    (this.seaMat.uniforms.sky.value as THREE.Color).copy(this.mood.horizon);
    if (this.floodMat) (this.floodMat.uniforms.sky.value as THREE.Color).copy(this.mood.horizon);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.mood.fog);
  }

  update(dt: number, stillness: number, focusX: number) {
    const target = 1 - stillness;
    this.motion += (target - this.motion) * (1 - Math.exp(-dt * 0.8));
    // a still ocean still breathes a little, or it looks like a bug
    this.seaTime += dt * (0.25 + this.motion * 0.9);
    for (const m of [this.seaMat, this.floodMat!]) {
      m.uniforms.time.value = this.seaTime;
      m.uniforms.motion.value = 0.08 + this.motion;
      m.uniforms.tide.value = this.tide;
    }
    if (this.flood) this.flood.visible = this.tide > 0.02;
    const crackMat = this.cracks.material as THREE.MeshLambertMaterial;
    crackMat.opacity = THREE.MathUtils.clamp((this.tide - 0.3) / 0.6, 0, 1) * 0.8;
    const t = performance.now() / 1000;
    this.stranded.forEach((f, i) => {
      f.root.visible = this.tide > 0.55;
      f.root.position.y = Math.max(-2.3, -(ARENA.zMin - 1.5 - f.root.position.z) * 0.25) + 0.25 + Math.abs(Math.sin(t * 7 + i * 2)) * 0.35;
      f.root.rotation.y = Math.sin(t * 5 + i) * 0.6;
    });
    for (const c of this.clouds) {
      c.position.x += dt * 0.6;
      if (c.position.x > 110) c.position.x = -110;
    }
    this.sun.position.set(focusX - 10, 22, 14);
    this.sun.target.position.set(focusX, 0, 0);
  }
}
