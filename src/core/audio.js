// All sounds are generated with the Web Audio API: no audio files.
// The AudioContext can only start after a user click, so call unlock() then.

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx, 1);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.setVolume(this.settings.volume);
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  // ---- building blocks ----

  /** A gain (and stereo pan) stage for one sound, so it can be quieter or off to one side. */
  _bus(volume = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = volume;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  _noise(t, { duration, gain, type = 'bandpass', freq = 2000, q = 0.8, sweepTo = null, rate = 1, out = null }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    filter.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(g).connect(out ?? this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }

  _tone(t, { duration, gain, freq, to = null, type = 'sine', out = null }) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(g).connect(out ?? this.master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  // ---- game sounds ----

  shot(weaponId, volume = 1, pan = 0) {
    if (!this.ctx || volume < 0.02) return;
    const t = this.ctx.currentTime;
    const out = this._bus(volume, pan);
    if (weaponId === 'sniper') return this._sniperShot(t, out, volume);
    const pistol = weaponId === 'pistol';
    const r = 0.92 + Math.random() * 0.16;
    // crack (distant shots lose their high end)
    const far = volume < 0.4;
    this._noise(t, { duration: pistol ? 0.11 : 0.15, gain: 0.7, freq: far ? 1100 : pistol ? 2600 : 1700, q: 0.7, rate: r, out });
    // body
    this._noise(t, { duration: pistol ? 0.16 : 0.22, gain: 0.5, type: 'lowpass', freq: far ? 2000 : 5000, sweepTo: 300, q: 0.5, rate: r, out });
    // thump
    this._tone(t, { duration: 0.12, gain: pistol ? 0.45 : 0.6, freq: pistol ? 190 : 150, to: 45, out });
    // short room tail
    this._noise(t + 0.02, { duration: 0.35, gain: 0.08, type: 'lowpass', freq: 900, q: 0.3, out });
  }

  _sniperShot(t, out, volume) {
    const far = volume < 0.4;
    const r = 0.95 + Math.random() * 0.1;
    // A big supersonic crack, a deep boom, and a long tail.
    this._noise(t, { duration: 0.2, gain: 0.95, freq: far ? 900 : 2200, q: 0.6, rate: r, out });
    this._noise(t, { duration: 0.45, gain: 0.7, type: 'lowpass', freq: far ? 1500 : 4200, sweepTo: 160, q: 0.5, rate: r, out });
    this._tone(t, { duration: 0.32, gain: 0.85, freq: 110, to: 32, out });
    this._noise(t + 0.03, { duration: 0.9, gain: 0.12, type: 'lowpass', freq: 700, q: 0.3, out });
    // Bolt: back, then forward.
    if (!far) {
      this._noise(t + 0.42, { duration: 0.05, gain: 0.3, freq: 2600, q: 3, out });
      this._noise(t + 0.62, { duration: 0.06, gain: 0.35, freq: 3400, q: 3, out });
    }
  }

  /** Zoom in or out (right click). */
  scope(zoomIn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, { duration: 0.06, gain: 0.18, freq: zoomIn ? 2200 : 1600, q: 2 });
    this._tone(t, { duration: 0.05, gain: 0.05, freq: zoomIn ? 900 : 700, type: 'triangle' });
  }

  spikeBeep(volume = 1, pan = 0) {
    if (!this.ctx || volume < 0.03) return;
    this._tone(this.ctx.currentTime, { duration: 0.07, gain: 0.22, freq: 1900, type: 'square', out: this._bus(volume, pan) });
  }

  spikePlanted() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 880, 660].forEach((f, i) => this._tone(t + i * 0.12, { duration: 0.18, gain: 0.18, freq: f, type: 'square' }));
  }

  spikeDefused() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [880, 1175, 1568].forEach((f, i) => this._tone(t + i * 0.1, { duration: 0.3, gain: 0.16, freq: f }));
  }

  spikeDetonated(volume = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._bus(volume);
    this._noise(t, { duration: 1.6, gain: 1, type: 'lowpass', freq: 1400, sweepTo: 80, q: 0.6, out });
    this._tone(t, { duration: 1.2, gain: 0.8, freq: 90, to: 28, out });
  }

  progressTick() {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime, { duration: 0.03, gain: 0.08, freq: 1200, type: 'triangle' });
  }

  hurt() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, { duration: 0.12, gain: 0.35, freq: 140, to: 70, type: 'triangle' });
    this._noise(t, { duration: 0.08, gain: 0.25, type: 'lowpass', freq: 700, q: 0.5 });
  }

  roundLive() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t, { duration: 0.18, gain: 0.2, freq: 880, type: 'triangle' });
    this._tone(t + 0.12, { duration: 0.3, gain: 0.2, freq: 1320, type: 'triangle' });
  }

  roundEnd(won) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = won ? [523, 659, 784, 1047] : [440, 392, 330];
    notes.forEach((f, i) => this._tone(t + i * 0.13, { duration: 0.35, gain: 0.16, freq: f, type: 'triangle' }));
  }

  dryFire() {
    if (!this.ctx) return;
    this._tone(this.ctx.currentTime, { duration: 0.03, gain: 0.25, freq: 1800, type: 'square' });
  }

  reloadStart() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, { duration: 0.05, gain: 0.35, freq: 3200, q: 2 });
    this._tone(t, { duration: 0.04, gain: 0.12, freq: 700, type: 'square' });
  }

  reloadEnd() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, { duration: 0.04, gain: 0.4, freq: 2400, q: 2 });
    this._noise(t + 0.09, { duration: 0.06, gain: 0.45, freq: 3600, q: 3 });
  }

  equip() {
    if (!this.ctx) return;
    this._noise(this.ctx.currentTime, { duration: 0.07, gain: 0.25, freq: 2800, q: 1.5 });
  }

  hit(part) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (part === 'head') {
      this._tone(t, { duration: 0.22, gain: 0.22, freq: 2500 });
      this._tone(t, { duration: 0.16, gain: 0.12, freq: 3750 });
    } else {
      this._tone(t, { duration: 0.05, gain: 0.22, freq: 1300, type: 'triangle' });
    }
  }

  /** Ability sounds, picked by the `sound` field in the agent data. */
  ability(kind, volume = 1, pan = 0) {
    if (!this.ctx || volume < 0.03) return;
    const t = this.ctx.currentTime;
    const out = this._bus(volume, pan);
    const _noise = (at, o) => this._noise(at, { ...o, out });
    const _tone = (at, o) => this._tone(at, { ...o, out });
    switch (kind) {
      case 'dash':
        _noise(t, { duration: 0.25, gain: 0.5, freq: 600, sweepTo: 3000, q: 1.2 });
        break;
      case 'zap':
        _tone(t, { duration: 0.3, gain: 0.18, freq: 1400, to: 220, type: 'sawtooth' });
        _noise(t, { duration: 0.2, gain: 0.35, freq: 4000, q: 0.6 });
        break;
      case 'flame':
        _noise(t, { duration: 0.5, gain: 0.6, type: 'lowpass', freq: 2500, sweepTo: 400, q: 0.5 });
        _tone(t, { duration: 0.3, gain: 0.3, freq: 120, to: 60 });
        break;
      case 'smoke':
        _noise(t, { duration: 0.8, gain: 0.35, type: 'lowpass', freq: 900, sweepTo: 200, q: 0.4 });
        break;
      case 'mark':
        _tone(t, { duration: 0.35, gain: 0.15, freq: 330, to: 660, type: 'triangle' });
        break;
      case 'teleport':
        _tone(t, { duration: 0.25, gain: 0.18, freq: 300, to: 1800 });
        _noise(t, { duration: 0.2, gain: 0.2, freq: 3000, q: 2 });
        break;
      case 'shield':
        _tone(t, { duration: 0.5, gain: 0.12, freq: 440, to: 880 });
        _tone(t + 0.05, { duration: 0.5, gain: 0.1, freq: 660, to: 1320 });
        break;
      case 'splash':
        _noise(t, { duration: 0.6, gain: 0.7, type: 'lowpass', freq: 1800, sweepTo: 250, q: 0.7 });
        _tone(t, { duration: 0.25, gain: 0.5, freq: 160, to: 50 });
        break;
      case 'reveal':
        _tone(t, { duration: 0.9, gain: 0.18, freq: 1200, to: 600 });
        _tone(t + 0.15, { duration: 0.7, gain: 0.1, freq: 1800, to: 900 });
        break;
      case 'sing':
        [523, 659, 784, 659].forEach((f, i) => _tone(t + i * 0.16, { duration: 0.3, gain: 0.16, freq: f }));
        break;
      case 'heal':
        [784, 988, 1175].forEach((f, i) => _tone(t + i * 0.09, { duration: 0.4, gain: 0.12, freq: f }));
        break;
      case 'throw':
        _noise(t, { duration: 0.18, gain: 0.35, freq: 900, sweepTo: 2400, q: 1 });
        break;
      case 'bounce':
        _tone(t, { duration: 0.06, gain: 0.2, freq: 520, to: 300, type: 'triangle' });
        break;
      case 'flash':
        _noise(t, { duration: 0.25, gain: 0.6, freq: 5000, q: 0.5 });
        _tone(t, { duration: 0.6, gain: 0.12, freq: 3200, to: 2400 });
        break;
      case 'trap':
        _tone(t, { duration: 0.2, gain: 0.14, freq: 500, to: 900, type: 'triangle' });
        _noise(t, { duration: 0.2, gain: 0.2, type: 'lowpass', freq: 1200, q: 0.6 });
        break;
      case 'alarm':
        [1100, 800, 1100].forEach((f, i) => _tone(t + i * 0.1, { duration: 0.09, gain: 0.16, freq: f, type: 'square' }));
        break;
      case 'ping':
        _tone(t, { duration: 0.7, gain: 0.16, freq: 1500, to: 1100 });
        break;
      case 'denied':
        _tone(t, { duration: 0.08, gain: 0.12, freq: 220, type: 'square' });
        break;
    }
  }

  kill() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(t + 0.04, { duration: 0.14, gain: 0.18, freq: 660, type: 'triangle' });
    this._tone(t + 0.11, { duration: 0.22, gain: 0.18, freq: 990, type: 'triangle' });
  }
}

function makeNoise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
