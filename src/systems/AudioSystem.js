export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._ambient = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._startAmbient();
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _startAmbient() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.035;
    master.connect(ctx.destination);
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    o1.type = 'sine';
    o2.type = 'sine';
    o1.frequency.value = 82;
    o2.frequency.value = 83.2;
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    g1.gain.value = 0.5;
    g2.gain.value = 0.5;
    o1.connect(g1).connect(master);
    o2.connect(g2).connect(master);
    o1.start();
    o2.start();
    this._ambient = { o1, o2, master };
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    if (name === 'whoosh') this._noise(t, 0.22, 0.18, 'bandpass', 900, 1.2, 3600);
    else if (name === 'hit') this._tone(t, 160, 0.16, 'sine', 0.32, 70);
    else if (name === 'splat') this._noise(t, 0.3, 0.25, 'lowpass', 700, 0.8, 180);
    else if (name === 'stapler') {
      this._tone(t, 2100, 0.045, 'square', 0.2);
      this._tone(t + 0.05, 1500, 0.06, 'square', 0.18);
    } else if (name === 'paper') this._noise(t, 0.16, 0.08, 'highpass', 2200, 0.7, 5000);
    else if (name === 'bleat') this._bleat(t);
    else if (name === 'ghost') this._tone(t, 110, 0.7, 'sawtooth', 0.1, 60);
    else if (name === 'gate') {
      this._tone(t, 520, 0.12, 'square', 0.14);
      this._tone(t + 0.12, 780, 0.16, 'square', 0.14);
    } else if (name === 'phone') {
      this._tone(t, 780, 0.16, 'square', 0.12);
      this._tone(t + 0.22, 980, 0.16, 'square', 0.12);
      this._tone(t + 0.44, 780, 0.16, 'square', 0.12);
    } else if (name === 'flash') {
      this._noise(t, 0.18, 0.22, 'highpass', 2400, 0.8, 6000);
      this._tone(t, 1200, 0.12, 'sine', 0.12, 300);
    } else if (name === 'win') {
      [523, 659, 784, 1046].forEach((f, i) => this._tone(t + i * 0.11, f, 0.18, 'triangle', 0.18));
    } else if (name === 'lose') {
      [330, 262, 196, 131].forEach((f, i) => this._tone(t + i * 0.16, f, 0.22, 'sawtooth', 0.12));
    } else if (name === 'click') this._tone(t, 880, 0.05, 'sine', 0.12);
    else if (name === 'slap') this._noise(t, 0.1, 0.3, 'lowpass', 500, 1, 200);
  }

  _tone(t, freq, dur, type, gain, slideTo = null) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(t, dur, gain, type, freq, q, slideTo) {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.Q.value = q;
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _bleat(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, t);
    osc.frequency.linearRampToValueAtTime(180, t + 0.18);
    osc.frequency.linearRampToValueAtTime(520, t + 0.34);
    osc.frequency.linearRampToValueAtTime(240, t + 0.55);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }
}
