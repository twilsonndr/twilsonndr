import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uWarmth: { value: 0.3 },
    uSmog: { value: 0.2 },
    uSmogColor: { value: new THREE.Color(0.55, 0.5, 0.42) },
    uVignette: { value: 0.55 },
    uSat: { value: 1.1 },
    uHaze: { value: 0.3 },
    uHurt: { value: 0 },
    uGlow: { value: 0 },
    uGrain: { value: 0.032 },
    uAberr: { value: 0.0022 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uWarmth, uSmog, uVignette, uSat, uHaze, uHurt, uGlow, uGrain, uAberr;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime * 7.0) * 43758.5453); }
    uniform vec3 uSmogColor;
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      float h = uHaze * 0.0022;
      uv.x += sin(uv.y * 38.0 + uTime * 3.1) * h * (1.2 - uv.y);
      uv.y += cos(uv.x * 31.0 + uTime * 2.3) * h * 0.4;
      vec2 dc = uv - 0.5;
      float ab = uAberr * dot(dc, dc) * 4.0;
      vec4 c = texture2D(tDiffuse, uv);
      vec3 col = vec3(texture2D(tDiffuse, uv + dc * ab).r, c.g, texture2D(tDiffuse, uv - dc * ab).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col *= mix(vec3(1.0), vec3(1.14, 0.97, 0.80), uWarmth);
      col = mix(col, uSmogColor * (0.55 + l * 0.8), clamp(uSmog * (0.18 + 0.42 * vUv.y), 0.0, 0.85));
      col += vec3(0.25, 0.9, 0.45) * uGlow * 0.03;
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(1.15, 1.0));
      float v = smoothstep(0.95, 0.25, r);
      col *= mix(1.0, v, uVignette);
      col = mix(col, vec3(0.9, 0.08, 0.05), uHurt * smoothstep(0.25, 0.75, r) * 0.7);
      col += (hash(gl_FragCoord.xy) - 0.5) * uGrain * (1.0 - l * 0.5);
      gl_FragColor = vec4(col, c.a);
    }
  `,
};

export interface GradeParams {
  warmth: number;
  smog: number;
  smogColor: THREE.Color;
  vignette: number;
  sat: number;
  haze: number;
  glow: number;
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  readonly renderPass: RenderPass;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  readonly lowPower: boolean;
  hurt = 0;
  private target: GradeParams;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera) {
    const ua = navigator.userAgent;
    this.lowPower = /Android|iPhone|iPad|Mobile/i.test(ua) || (navigator.hardwareConcurrency ?? 8) <= 4;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: !this.lowPower, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio, this.lowPower ? 1.3 : 1.75));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(this.gl);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    const size = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
    this.bloom = new UnrealBloomPass(size, 0.55, 0.55, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.target = {
      warmth: 0.3, smog: 0.2, smogColor: new THREE.Color(0.55, 0.5, 0.42), vignette: 0.55, sat: 1.1, haze: 0.3, glow: 0,
    };
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setScene(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setGrade(p: Partial<GradeParams>) {
    Object.assign(this.target, p);
    if (p.smogColor) this.target.smogColor = p.smogColor.clone();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  render(dt: number, time: number) {
    const u = this.grade.uniforms;
    const k = 1 - Math.exp(-2.5 * dt);
    u.uTime.value = time;
    u.uWarmth.value += (this.target.warmth - u.uWarmth.value) * k;
    u.uSmog.value += (this.target.smog - u.uSmog.value) * k;
    u.uVignette.value += (this.target.vignette - u.uVignette.value) * k;
    u.uSat.value += (this.target.sat - u.uSat.value) * k;
    u.uHaze.value += (this.target.haze - u.uHaze.value) * k;
    u.uGlow.value += (this.target.glow - u.uGlow.value) * k;
    (u.uSmogColor.value as THREE.Color).lerp(this.target.smogColor, k);
    this.hurt = Math.max(0, this.hurt - dt * 2.2);
    u.uHurt.value = this.hurt;
    this.composer.render(dt);
  }
}
