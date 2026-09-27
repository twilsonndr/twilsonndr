// Every sound is synthesized. There's a little steel-drum calypso loop too.
export class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  muted = false;
  musicOn = true;
  private noiseBuf: AudioBuffer | null = null;
  private nextBeat = 0;
  private beat = 0;
  private tension = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('tinyclaw.muted') === '1';
    } catch {
      /* storage blocked: default to sound on */
    }
  }

  /** Browsers only allow audio after a gesture, so this runs on the first click/key. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.gain.value = 0.7;
    this.sfx.connect(this.master);
    this.music = this.ctx.createGain();
    this.music.gain.value = 0.32;
    this.music.connect(this.master);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextBeat = this.ctx.currentTime + 0.1;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem('tinyclaw.muted', this.muted ? '1' : '0');
    } catch {
      /* fine */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  setTension(t: number) {
    this.tension = t;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, dest?: AudioNode) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filter: BiquadFilterType, f0: number, f1?: number, when = 0) {
    const c = this.ctx;
    if (!c || !this.noiseBuf) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = 1.2;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  snip() {
    this.noise(0.05, 0.5, 'highpass', 4000);
    this.tone(1800, 0.06, 'square', 0.12, 0, 2600);
    this.tone(2400, 0.05, 'square', 0.08, 0.05, 3200);
  }
  miss() {
    this.tone(1400, 0.05, 'square', 0.05, 0, 1900);
  }
  mega() {
    this.snip();
    this.tone(220, 0.4, 'sawtooth', 0.2, 0, 880);
    this.tone(660, 0.5, 'triangle', 0.18, 0.05, 1320);
    this.noise(0.4, 0.4, 'bandpass', 800, 5000);
  }
  bonk() {
    this.tone(160, 0.15, 'triangle', 0.35, 0, 90);
    this.tone(90, 0.12, 'square', 0.1);
  }
  hit() {
    this.snip();
    this.tone(520, 0.18, 'sawtooth', 0.12, 0.03, 1200);
  }
  dash() {
    this.noise(0.18, 0.35, 'bandpass', 600, 3000);
  }
  hurt() {
    this.tone(600, 0.35, 'sawtooth', 0.2, 0, 150);
    this.tone(300, 0.3, 'square', 0.08, 0.05, 90);
  }
  slam(big = false) {
    this.tone(big ? 70 : 110, big ? 0.6 : 0.35, 'sine', 0.8, 0, 35);
    this.noise(big ? 0.5 : 0.3, big ? 0.7 : 0.45, 'lowpass', 1400, 120);
  }
  windup() {
    this.tone(200, 0.6, 'triangle', 0.1, 0, 520);
  }
  gull() {
    // "MINE!"
    this.tone(1200, 0.12, 'sawtooth', 0.12, 0, 1700);
    this.tone(1500, 0.22, 'sawtooth', 0.12, 0.12, 900);
  }
  wave() {
    this.noise(1.4, 0.35, 'lowpass', 300, 2200);
  }
  splash() {
    this.noise(0.5, 0.5, 'bandpass', 2400, 400);
  }
  free() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.2, i * 0.07));
  }
  kelp() {
    [392, 523, 659].forEach((f, i) => this.tone(f, 0.15, 'sine', 0.25, i * 0.06));
  }
  screw() {
    [1568, 2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.16, i * 0.05));
    this.tone(90, 0.5, 'sine', 0.5, 0, 50);
  }
  wiggle() {
    [440, 554, 659, 880, 1109].forEach((f, i) => this.tone(f, 0.12, 'square', 0.07, i * 0.04));
  }
  combo(n: number) {
    this.tone(300 + n * 60, 0.06, 'triangle', 0.08);
  }
  blip() {
    this.tone(880, 0.04, 'square', 0.04);
  }
  fanfare() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.22, i * 0.13));
    notes.forEach((f, i) => this.tone(f / 2, 0.3, 'sine', 0.2, i * 0.13));
  }
  sad() {
    [392, 370, 349, 262].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, i * 0.3, f * 0.97));
  }

  // ---------- music: a tiny calypso loop ----------

  private steel(freq: number, t: number, vol: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o2.type = 'sine';
    o.frequency.value = freq;
    o2.frequency.value = freq * 2.76; // the clangy overtone that makes it sound like a pan
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.music);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.55);
    o2.stop(t + 0.55);
  }

  private bass(freq: number, t: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.music);
    o.start(t);
    o.stop(t + 0.3);
  }

  private shaker(t: number, v: number) {
    const c = this.ctx!;
    if (!this.noiseBuf) return;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 6000;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    s.connect(f).connect(g).connect(this.music);
    s.start(t, Math.random());
    s.stop(t + 0.06);
  }

  /** Call every frame; schedules a little ahead. */
  tick(playing: boolean) {
    const c = this.ctx;
    if (!c || !this.musicOn) return;
    const bpm = 112 + this.tension * 24;
    const step = 60 / bpm / 2; // eighth notes
    // C  F  G  C, or minor when things are dire
    const major = [
      [262, 330, 392],
      [349, 440, 523],
      [392, 494, 587],
      [262, 330, 392],
    ];
    const minor = [
      [220, 262, 330],
      [175, 220, 262],
      [196, 247, 294],
      [165, 208, 247],
    ];
    const prog = this.tension > 0.6 ? minor : major;
    const melody = [0, 2, 1, 2, 0, 1, 2, 1, 2, 0, 2, 1, -1, 2, 1, 0];
    while (this.nextBeat < c.currentTime + 0.2) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % 4;
      const chord = prog[bar];
      const i = this.beat % 16;
      if (playing) {
        if (this.beat % 8 === 0 || this.beat % 8 === 3 || this.beat % 8 === 6) this.bass(chord[0] / 2, t);
        const m = melody[i];
        if (m >= 0 && (i % 2 === 0 || i === 3 || i === 11)) this.steel(chord[m] * (i > 8 ? 2 : 1), t, 0.16);
        this.shaker(t, this.beat % 2 ? 0.05 : 0.1);
      } else if (this.beat % 4 === 0) {
        this.steel(chord[(this.beat / 4) % 3], t, 0.08);
      }
      this.beat++;
      this.nextBeat += step;
    }
  }
}
