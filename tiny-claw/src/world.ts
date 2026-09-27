// The beach, the sea, the sky. The sea's motion is driven by `motion`: when the
// Admiral is winning, the ocean goes flat and still. When he loses, it comes back.
import * as THREE from 'three';
import { ARENA } from './sim';
import { makePalm, makeRock, makeSandcastle, makeShell, makeSign, makeUmbrella } from './models';

export interface SkyMood {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunI: number;
  hemi: number;
  fog: THREE.Color;
}

const MOODS: Record<string, SkyMood> = {
  day: { top: new THREE.Color(0x3aa0ff), horizon: new THREE.Color(0xbfe9ff), sun: new THREE.Color(0xfff1d6), sunI: 2.6, hemi: 1.3, fog: new THREE.Color(0xbfe4f5) },
  afternoon: { top: new THREE.Color(0x4a7fe0), horizon: new THREE.Color(0xffc38a), sun: new THREE.Color(0xffd2a0), sunI: 2.3, hemi: 1.1, fog: new THREE.Color(0xf2c8a2) },
  doom: { top: new THREE.Color(0x1c1238), horizon: new THREE.Color(0xa33d5c), sun: new THREE.Color(0xff9d8a), sunI: 1.6, hemi: 0.75, fog: new THREE.Color(0x5b2d4a) },
  dawn: { top: new THREE.Color(0x5bb6ff), horizon: new THREE.Color(0xffd1e8), sun: new THREE.Color(0xfff0c0), sunI: 2.8, hemi: 1.35, fog: new THREE.Color(0xffe0ec) },
};

export function moodFor(chapter: number, won: boolean) {
  if (won) return MOODS.dawn;
  return [MOODS.day, MOODS.afternoon, MOODS.doom][chapter] ?? MOODS.day;
}

export class World {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  skyMat: THREE.ShaderMaterial;
  seaMat: THREE.ShaderMaterial;
  mood: SkyMood = { ...MOODS.day, top: MOODS.day.top.clone(), horizon: MOODS.day.horizon.clone(), sun: MOODS.day.sun.clone(), fog: MOODS.day.fog.clone() };
  motion = 1;
  private seaTime = 0;

  constructor(private scene: THREE.Scene, lowQuality: boolean) {
    scene.add(this.group);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: this.mood.top }, horizon: { value: this.mood.horizon } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vP;
        void main(){ float h = clamp(vP.y*1.6+0.05,0.0,1.0); gl_FragColor = vec4(mix(horizon, top, pow(h,0.8)),1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 24, 16), this.skyMat);
    this.group.add(sky);

    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0xe8c890, this.mood.hemi);
    this.group.add(this.hemi);
    this.sun = new THREE.DirectionalLight(this.mood.sun, this.mood.sunI);
    this.sun.position.set(-10, 22, 14);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(lowQuality ? 1024 : 2048, lowQuality ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -20;
    sc.right = 20;
    sc.top = 20;
    sc.bottom = -20;
    sc.near = 1;
    sc.far = 70;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.03;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.buildSand();
    this.seaMat = this.buildSea();
    this.buildDecor();
  }

  private buildSand() {
    const geo = new THREE.PlaneGeometry(90, 50, 90, 50);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const dry = new THREE.Color(0xf3d59a);
    const wet = new THREE.Color(0xc9a468);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) + 8;
      pos.setZ(i, z);
      const inArena = Math.abs(x) < ARENA.hw + 2 && z > ARENA.zMin - 2 && z < ARENA.zMax + 2;
      let y = inArena ? 0 : Math.sin(x * 0.35) * Math.cos(z * 0.4) * 0.35 + Math.max(0, Math.abs(x) - ARENA.hw - 3) * 0.12;
      // slope down into the sea
      if (z < ARENA.zMin - 1.5) y -= (ARENA.zMin - 1.5 - z) * 0.25;
      pos.setY(i, y);
      const wetness = THREE.MathUtils.clamp((ARENA.zMin + 1 - z) / 3, 0, 1);
      c.copy(dry).lerp(wet, wetness);
      const n = (Math.sin(x * 3.1 + z * 1.7) * Math.sin(x * 1.3 - z * 2.9)) * 0.04;
      c.offsetHSL(0, 0, n);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const sand = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    sand.receiveShadow = true;
    this.group.add(sand);
  }

  private buildSea() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        time: { value: 0 },
        motion: { value: 1 },
        deep: { value: new THREE.Color(0x0b6fa8) },
        shallow: { value: new THREE.Color(0x3fe0d0) },
        sky: { value: new THREE.Color(0xbfe9ff) },
        shore: { value: ARENA.zMin - 2.2 },
      },
      vertexShader: `
        uniform float time; uniform float motion; uniform float shore;
        varying float vH; varying float vShore; varying vec3 vW;
        void main(){
          vec3 p = position;
          float w = sin(p.x*0.35 + time*1.3)*0.35 + sin(p.x*0.8 - p.z*0.5 + time*2.1)*0.18 + sin(p.z*0.9 + time*1.7)*0.22;
          float surge = sin(time*0.9)*0.9;
          p.y += w*motion;
          p.z += surge*motion*smoothstep(-20.0, shore, p.z);
          vH = w*motion;
          vShore = smoothstep(shore-1.5, shore, p.z);
          vec4 wp = modelMatrix*vec4(p,1.0);
          vW = wp.xyz;
          gl_Position = projectionMatrix*viewMatrix*wp;
        }`,
      fragmentShader: `
        uniform vec3 deep; uniform vec3 shallow; uniform vec3 sky; uniform float motion;
        varying float vH; varying float vShore; varying vec3 vW;
        void main(){
          float d = clamp(-vW.z/60.0, 0.0, 1.0);
          vec3 col = mix(shallow, deep, smoothstep(0.0, 0.6, d));
          col = mix(col, sky, 0.25*d);
          float crest = smoothstep(0.35, 0.6, vH)*motion;
          col = mix(col, vec3(1.0), crest*0.6 + vShore*0.7);
          gl_FragColor = vec4(col, 0.93);
        }`,
    });
    const geo = new THREE.PlaneGeometry(200, 90, 120, 60);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, -0.25, -45 + ARENA.zMin - 2.2);
    const sea = new THREE.Mesh(geo, mat);
    this.group.add(sea);
    return mat;
  }

  private buildDecor() {
    const place = (o: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => {
      o.position.set(x, 0, z);
      o.rotation.y = ry;
      o.scale.setScalar(s);
      this.group.add(o);
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
    for (let i = 0; i < 26; i++) {
      const x = (Math.random() * 2 - 1) * 22;
      const z = -6 + Math.random() * 18;
      if (Math.abs(x) < ARENA.hw + 1 && z < ARENA.zMax + 1) continue;
      place(makeRock(0.3 + Math.random() * 0.7), x, z);
    }
    const shellColors = [0xffc0cb, 0xfff0d9, 0xffb07a, 0xe6d3ff];
    for (let i = 0; i < 40; i++) {
      const s = makeShell(shellColors[i % shellColors.length]);
      s.position.x = (Math.random() * 2 - 1) * (ARENA.hw + 4);
      s.position.z = ARENA.zMin + Math.random() * (ARENA.zMax - ARENA.zMin + 4);
      this.group.add(s);
    }
    // tide pools
    for (const [x, z, r] of [
      [-15, 1, 1.4],
      [15.5, 1.5, 1.1],
    ]) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 24), new THREE.MeshToonMaterial({ color: 0x46d1e0, transparent: true, opacity: 0.8 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.03, z);
      this.group.add(pool);
    }
  }

  setMood(target: SkyMood, dt: number) {
    const k = 1 - Math.exp(-dt * 1.2);
    this.mood.top.lerp(target.top, k);
    this.mood.horizon.lerp(target.horizon, k);
    this.mood.sun.lerp(target.sun, k);
    this.mood.fog.lerp(target.fog, k);
    this.mood.sunI += (target.sunI - this.mood.sunI) * k;
    this.mood.hemi += (target.hemi - this.mood.hemi) * k;
    this.sun.color.copy(this.mood.sun);
    this.sun.intensity = this.mood.sunI;
    this.hemi.intensity = this.mood.hemi;
    (this.seaMat.uniforms.sky.value as THREE.Color).copy(this.mood.horizon);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(this.mood.fog);
  }

  update(dt: number, stillness: number, focusX: number) {
    const target = 1 - stillness;
    this.motion += (target - this.motion) * (1 - Math.exp(-dt * 0.8));
    // a still ocean still breathes a little, or it looks like a bug
    this.seaTime += dt * (0.25 + this.motion * 0.9);
    this.seaMat.uniforms.time.value = this.seaTime;
    this.seaMat.uniforms.motion.value = 0.08 + this.motion;
    this.sun.position.set(focusX - 10, 22, 14);
    this.sun.target.position.set(focusX, 0, 0);
  }
}
