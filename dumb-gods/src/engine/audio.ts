export type Sfx =
  | 'swing' | 'hit' | 'crit' | 'hurt' | 'pickup' | 'magic' | 'rare' | 'legendary' | 'set'
  | 'death' | 'recycle' | 'protest' | 'boycott' | 'legislate' | 'zap' | 'shield' | 'ui'
  | 'stairs' | 'roar' | 'honk' | 'kill' | 'shoot' | 'heal' | 'recruit' | 'boom' | 'coin'
  | 'alarm' | 'wake' | 'plop' | 'whoosh' | 'bloop';

/** Tiny procedural synth. No audio files, no problem. */
export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private noise!: AudioBuffer;
  sfxOn = true;
  musicOn = true;
  private last: Partial<Record<Sfx, number>> = {};
  private musicTimer: number | null = null;
  private mood: 'calm' | 'tense' | 'hope' = 'calm';

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
    this.musicGain.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.3);
  }

  setMood(m: 'calm' | 'tense' | 'hope') {
    this.mood = m;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, delay = 0, dest?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private hiss(dur: number, vol: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx!;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  play(name: Sfx) {
    if (!this.ctx || !this.sfxOn) return;
    const now = performance.now();
    const gap = name === 'hit' || name === 'swing' || name === 'shoot' ? 45 : 70;
    if ((this.last[name] ?? 0) > now - gap) return;
    this.last[name] = now;
    const r = 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'swing': this.hiss(0.12, 0.25, 1800 * r, 0.8); break;
      case 'shoot': this.tone(700 * r, 0.1, 'square', 0.06, 0.5); break;
      case 'hit': this.hiss(0.08, 0.4, 900 * r, 1.2); this.tone(140 * r, 0.08, 'sine', 0.25, 0.6); break;
      case 'crit': this.hiss(0.12, 0.5, 1400, 1); this.tone(220, 0.15, 'square', 0.12, 0.4); break;
      case 'hurt': this.tone(260, 0.18, 'sawtooth', 0.12, 0.5); break;
      case 'kill': this.tone(400 * r, 0.12, 'triangle', 0.14, 0.5); this.hiss(0.2, 0.2, 500, 0.7); break;
      case 'pickup': this.tone(660, 0.08, 'triangle', 0.12); this.tone(990, 0.1, 'triangle', 0.1, 1, 0.06); break;
      case 'coin': this.tone(1320, 0.07, 'square', 0.05); this.tone(1760, 0.12, 'square', 0.05, 1, 0.05); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.1, 1, i * 0.05)); break;
      case 'magic': [440, 660].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.1, 1, i * 0.07)); break;
      case 'rare': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, 1, i * 0.06)); break;
      case 'legendary':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.05, 1, i * 0.07));
        this.tone(98, 1.2, 'sine', 0.3, 0.5);
        break;
      case 'set': [349, 440, 523, 698, 880].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.1, 1, i * 0.08)); break;
      case 'death': [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.15, 0.97, i * 0.22)); break;
      case 'recycle': [880, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.12, 1, i * 0.05)); break;
      case 'protest':
        for (let i = 0; i < 4; i++) {
          this.tone(180, 0.18, 'square', 0.12, 0.8, i * 0.2);
          this.hiss(0.15, 0.4, 300, 0.7, i * 0.2, 'lowpass');
        }
        break;
      case 'boycott': this.tone(600, 0.6, 'sawtooth', 0.08, 0.3); this.hiss(0.5, 0.2, 2000, 0.5); break;
      case 'legislate':
        this.tone(130, 0.3, 'square', 0.2, 0.5);
        this.hiss(0.2, 0.6, 200, 0.6, 0, 'lowpass');
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.6, 'triangle', 0.12, 1, 0.25 + i * 0.1));
        break;
      case 'zap': this.tone(1200, 0.25, 'sawtooth', 0.08, 0.2); this.hiss(0.2, 0.2, 3000, 0.5); break;
      case 'shield': this.tone(1600 * r, 0.12, 'sine', 0.08, 0.8); this.tone(2400 * r, 0.1, 'sine', 0.05, 0.9, 0.02); break;
      case 'ui': this.tone(880, 0.05, 'sine', 0.08); break;
      case 'stairs': [300, 250, 200, 150].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.12, 1, i * 0.08)); break;
      case 'roar': this.tone(70, 1.2, 'sawtooth', 0.25, 0.6); this.hiss(1.0, 0.5, 250, 0.5, 0, 'lowpass'); break;
      case 'honk': this.tone(233, 0.7, 'sawtooth', 0.14); this.tone(277, 0.7, 'sawtooth', 0.14); break;
      case 'recruit': [392, 494, 587, 784].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.12, 1, i * 0.09)); break;
      case 'plop':
        this.tone(320 * r, 0.22, 'sine', 0.3, 0.25);
        this.hiss(0.12, 0.25, 400, 0.8, 0.02, 'lowpass');
        break;
      case 'whoosh': this.hiss(0.9, 0.35, 900, 0.6, 0, 'lowpass'); this.tone(140, 0.8, 'sine', 0.12, 2.2); break;
      case 'bloop': this.tone(420 * r, 0.18, 'sine', 0.18, 2.1); this.tone(640 * r, 0.14, 'triangle', 0.08, 1.6, 0.08); break;
      case 'alarm': for (let i = 0; i < 3; i++) this.tone(880, 0.22, 'square', 0.08, 0.7, i * 0.3); break;
      case 'wake':
        [131, 196, 262, 392, 523].forEach((f, i) => this.tone(f, 1.4, 'sine', 0.12, 1, i * 0.18));
        this.hiss(1.4, 0.15, 4000, 0.4, 0.2);
        break;
      case 'boom': this.hiss(0.6, 0.8, 120, 0.6, 0, 'lowpass'); this.tone(60, 0.5, 'sine', 0.4, 0.4); break;
    }
  }

  private startMusic() {
    const c = this.ctx!;
    const scales = {
      calm: [220, 247, 277, 330, 370, 440, 494],
      tense: [196, 208, 247, 262, 311, 392, 415],
      hope: [262, 294, 330, 392, 440, 523, 587],
    };
    const pads: Record<string, number[]> = { calm: [110, 165, 220], tense: [98, 147, 185], hope: [131, 196, 262] };
    let step = 0;
    const tick = () => {
      if (!this.ctx) return;
      const sc = scales[this.mood];
      if (step % 16 === 0) {
        for (const f of pads[this.mood]) {
          const t = c.currentTime;
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.18, t + 1.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 5.2);
          o.connect(g).connect(this.musicGain);
          o.start(t);
          o.stop(t + 5.4);
        }
      }
      if (Math.random() < (this.mood === 'tense' ? 0.55 : 0.4)) {
        const f = sc[Math.floor(Math.random() * sc.length)] * (Math.random() < 0.3 ? 2 : 1);
        this.tone(f, 0.9, 'triangle', 0.12, 1, 0, this.musicGain);
      }
      step++;
      this.musicTimer = window.setTimeout(tick, this.mood === 'tense' ? 260 : 340);
    };
    if (this.musicTimer === null) tick();
  }
}
