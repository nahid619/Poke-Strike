// All sounds are generated with the Web Audio API: no audio files.
// The AudioContext can only start after a user click, so call unlock() then.
//
// Sounds in the world are placed in 3D. Each one goes through:
//   - a filter that dulls it with distance, and much more through a wall
//   - a panner at its position: HRTF by default, so on headphones you can tell
//     front from behind and above from below (Settings can switch to simple
//     left/right stereo for speakers)
//   - a send to a shared room echo, stronger for distant sounds, so far away
//     fights sound far away
//
// A sound's position is a "where" object from Session.placeSound():
//   { x, y, z, volume, distance, occluded }
// or null for sounds at your own position (your gun, your steps, the HUD).

/** The echo used when a map doesn't set its own `acoustics` (see mapkit.js). */
export const DEFAULT_ROOM = { time: 1.2, wet: 0.3, damping: 0.6 };

// The layers of each gun's shot: a sharp snap, the crack, the body (a
// filtered roar that falls in pitch), a low thump, and the mechanism (action
// and spring clicks, heard only up close). Frequencies in Hz, times in seconds.
const GUN_SOUNDS = {
  rifle: { snap: 3400, crack: 1700, crackLen: 0.15, body: 5000, bodyLen: 0.22, thump: 150, thumpGain: 0.6, mech: 4600, tail: 0.35 },
  pistol: { snap: 4200, crack: 2600, crackLen: 0.11, body: 4200, bodyLen: 0.16, thump: 190, thumpGain: 0.45, mech: 5600, tail: 0.28 },
  sidearm: { snap: 4800, crack: 3000, crackLen: 0.08, body: 4400, bodyLen: 0.12, thump: 230, thumpGain: 0.3, mech: 6000, tail: 0.2, level: 0.8 },
  lightpistol: { snap: 6000, crack: 3600, crackLen: 0.05, body: 2600, bodyLen: 0.08, thump: 260, thumpGain: 0.15, mech: 6200, tail: 0.1, level: 0.5 },
  smg: { snap: 4600, crack: 2200, crackLen: 0.09, body: 4600, bodyLen: 0.14, thump: 210, thumpGain: 0.35, mech: 6000, tail: 0.22, level: 0.85 },
  shotgun: { snap: 2600, crack: 1100, crackLen: 0.2, body: 3200, bodyLen: 0.32, thump: 105, thumpGain: 0.95, mech: 3800, tail: 0.5, level: 1.1 },
  marksman: { snap: 3600, crack: 1900, crackLen: 0.17, body: 4800, bodyLen: 0.24, thump: 140, thumpGain: 0.65, mech: 4400, tail: 0.38 },
  carbine: { snap: 5600, crack: 3200, crackLen: 0.06, body: 2400, bodyLen: 0.12, thump: 170, thumpGain: 0.3, mech: 5200, tail: 0.15, level: 0.55 },
};
const MECHANISM_RANGE = 18; // meters: closer than this you hear the gun's action

export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.room = { ...DEFAULT_ROOM };
    this._roomBuilt = null;
    // Where your ears are and which way they face (set from the camera every frame).
    this.listener = { x: 0, y: 0, z: 0, yaw: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain();
      // A limiter so a big fight never distorts. It only touches loud peaks.
      const limiter = c.createDynamicsCompressor?.();
      if (limiter) {
        limiter.threshold.value = -6;
        limiter.knee.value = 2;
        limiter.ratio.value = 20;
        limiter.attack.value = 0.001;
        limiter.release.value = 0.15;
        this.master.connect(limiter).connect(c.destination);
      } else {
        this.master.connect(c.destination);
      }
      this.noise = makeNoise(c, 1);
      if (c.createConvolver) {
        this.reverb = c.createConvolver();
        this.reverbReturn = c.createGain();
        this.reverb.connect(this.reverbReturn).connect(this.master);
      }
      this._applyRoom();
      this._applyListener();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()?.catch?.(() => {});
    this.setVolume(this.settings.volume);
  }

  setVolume(v) {
    if (this.master) this.master.gain.value = v;
  }

  /** Use a map's echo: { time, wet, damping } (missing values use DEFAULT_ROOM). */
  setRoom(acoustics) {
    this.room = { ...DEFAULT_ROOM, ...(acoustics ?? {}) };
    this._applyRoom();
  }

  _applyRoom() {
    if (!this.reverb) return;
    const key = `${this.room.time}|${this.room.damping}`;
    if (this._roomBuilt !== key) {
      this.reverb.buffer = makeImpulse(this.ctx, this.room);
      this._roomBuilt = key;
    }
    this.reverbReturn.gain.value = this.room.wet;
  }

  /** Put your ears where the camera is, facing where it faces. Call every frame. */
  setListener(camera) {
    const e = camera.matrixWorld.elements;
    const L = this.listener;
    L.x = e[12]; L.y = e[13]; L.z = e[14];
    L.fx = -e[8]; L.fy = -e[9]; L.fz = -e[10]; // the camera looks down its -Z axis
    L.ux = e[4]; L.uy = e[5]; L.uz = e[6];
    L.yaw = Math.atan2(-L.fx, -L.fz);
    this._applyListener();
  }

  _applyListener() {
    const l = this.ctx?.listener;
    if (!l) return;
    const L = this.listener;
    if (l.positionX) {
      l.positionX.value = L.x; l.positionY.value = L.y; l.positionZ.value = L.z;
      l.forwardX.value = L.fx; l.forwardY.value = L.fy; l.forwardZ.value = L.fz;
      l.upX.value = L.ux; l.upY.value = L.uy; l.upZ.value = L.uz;
    } else {
      l.setPosition?.(L.x, L.y, L.z);
      l.setOrientation?.(L.fx, L.fy, L.fz, L.ux, L.uy, L.uz);
    }
  }

  // ---- building blocks ----

  /**
   * The input for one sound. All of a sound's layers go into it. For a sound
   * in the world (`where`), it adds distance and wall muffling, 3D or stereo
   * placement, and more echo the farther away it is. `wet` is the echo amount
   * up close; `cutoff` dulls the sound on purpose (Hz). Call _done() after.
   */
  _out(where, { wet = 0.3, cutoff = 20000 } = {}) {
    const c = this.ctx;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.4;
    const gain = c.createGain();
    filter.connect(gain);
    const nodes = [filter, gain];
    let tail = gain;
    let send = wet;
    if (where) {
      const d = where.distance ?? 0;
      let f = Math.min(cutoff, 20000 / (1 + d / 12));
      if (where.occluded) f = Math.min(f, 750);
      filter.frequency.value = f;
      gain.gain.value = where.volume;
      send = wet * (1 + 1.6 * Math.min(1, d / 30)) * (where.occluded ? 1.4 : 1);
      const panner = this._panner(where);
      if (panner) {
        gain.connect(panner);
        nodes.push(panner);
        tail = panner;
      }
    } else {
      filter.frequency.value = cutoff;
    }
    tail.connect(this.master);
    if (this.reverb && send > 0) {
      // The echo is sent before panning, so it surrounds you like a real room.
      const s = c.createGain();
      s.gain.value = send;
      gain.connect(s).connect(this.reverb);
      nodes.push(s);
    }
    filter._nodes = nodes;
    return filter;
  }

  /** Placement for a sound in the world: HRTF 3D, or left/right stereo. */
  _panner(where) {
    const c = this.ctx;
    if (this.settings.spatialAudio !== 'stereo' && c.createPanner) {
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 1;
      p.rolloffFactor = 0; // distance is already in `volume`, so the mix stays as tuned
      if (p.positionX) {
        p.positionX.value = where.x; p.positionY.value = where.y; p.positionZ.value = where.z;
      } else {
        p.setPosition?.(where.x, where.y, where.z);
      }
      return p;
    }
    if (!c.createStereoPanner) return null;
    const L = this.listener;
    const dx = where.x - L.x;
    const dz = where.z - L.z;
    const angle = Math.atan2(-dx, -dz) - L.yaw;
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, -Math.sin(angle) * Math.min(1, Math.hypot(dx, dz) / 3)));
    return p;
  }

  /** Free a sound's nodes once it has finished (`seconds` after it started). */
  _done(input, seconds) {
    const nodes = input._nodes;
    setTimeout(() => { for (const n of nodes) n.disconnect(); }, (seconds + 0.6) * 1000);
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

  /** A gunshot: yours (where = null) or someone else's. */
  shot(weaponId, where = null) {
    if (!this.ctx || (where && where.volume < 0.02)) return;
    const t = this.ctx.currentTime;
    const own = !where;
    const out = this._out(where, { wet: own ? 0.22 : 0.3 });
    const opts = { own, near: (where?.distance ?? 0) < MECHANISM_RANGE, r: 0.92 + Math.random() * 0.16 };
    const length = weaponId === 'sniper'
      ? this._sniperShot(t, out, opts)
      : this._gunShot(t, out, GUN_SOUNDS[weaponId] ?? GUN_SOUNDS.rifle, opts);
    this._done(out, length);
  }

  _gunShot(t, out, g, { own, near, r }) {
    const lv = g.level ?? 1; // silenced guns are quieter
    const o = (x) => ({ ...x, gain: x.gain * lv, out });
    this._noise(t, o({ duration: 0.012, gain: 0.55, type: 'highpass', freq: g.snap, q: 0.7, rate: r })); // snap
    this._noise(t, o({ duration: g.crackLen, gain: 0.7, freq: g.crack, q: 0.7, rate: r }));              // crack
    this._noise(t, o({ duration: g.bodyLen, gain: 0.5, type: 'lowpass', freq: g.body, sweepTo: 300, q: 0.5, rate: r }));
    this._tone(t, o({ duration: 0.12, gain: g.thumpGain, freq: g.thump, to: 45 }));                    // thump
    if (own) this._tone(t, o({ duration: 0.09, gain: 0.35, freq: 70, to: 38 }));                        // the kick in your hands
    if (near) {
      this._noise(t + 0.004, o({ duration: 0.02, gain: 0.22, freq: g.mech, q: 3, rate: r }));          // action
      this._noise(t + 0.045, o({ duration: 0.025, gain: 0.12, freq: g.mech * 0.8, q: 4, rate: r }));   // spring returning
    }
    this._noise(t + 0.02, o({ duration: g.tail, gain: 0.08, type: 'lowpass', freq: 900, q: 0.3 }));   // short room tail
    if (own && Math.random() < 0.6) {
      // A spent case bouncing on the floor.
      const at = t + 0.28 + Math.random() * 0.18;
      const f = 3800 + Math.random() * 1600;
      this._tone(at, o({ duration: 0.05, gain: 0.03, freq: f, type: 'triangle' }));
      this._tone(at + 0.07, o({ duration: 0.04, gain: 0.018, freq: f * 1.12, type: 'triangle' }));
      return 0.6;
    }
    return Math.max(g.tail + 0.02, g.bodyLen);
  }

  _sniperShot(t, out, { own, near, r }) {
    const o = (x) => ({ ...x, out });
    // A big supersonic crack, a deep boom, and a long tail.
    this._noise(t, o({ duration: 0.015, gain: 0.7, type: 'highpass', freq: 3000, q: 0.7, rate: r }));
    this._noise(t, o({ duration: 0.2, gain: 0.95, freq: 2200, q: 0.6, rate: r }));
    this._noise(t, o({ duration: 0.45, gain: 0.7, type: 'lowpass', freq: 4200, sweepTo: 160, q: 0.5, rate: r }));
    this._tone(t, o({ duration: 0.32, gain: 0.85, freq: 110, to: 32 }));
    if (own) this._tone(t, o({ duration: 0.2, gain: 0.45, freq: 60, to: 30 }));
    this._noise(t + 0.03, o({ duration: 0.9, gain: 0.12, type: 'lowpass', freq: 700, q: 0.3 }));
    // Bolt: back, then forward.
    if (near) {
      this._noise(t + 0.42, o({ duration: 0.05, gain: 0.3, freq: 2600, q: 3 }));
      this._noise(t + 0.62, o({ duration: 0.06, gain: 0.35, freq: 3400, q: 3 }));
    }
    return 0.95;
  }

  /**
   * A footstep or a landing. `side` is whose it is: 'enemy' steps are full
   * and crisp, 'ally' steps are quieter and duller (so enemies stand out),
   * and your 'own' are quiet. `surface` is 'concrete', 'wood', or 'metal'.
   */
  footstep(where, { surface = 'concrete', kind = 'step', side = 'enemy', weight = 1 } = {}) {
    if (!this.ctx || (where && where.volume < 0.02)) return;
    const t = this.ctx.currentTime;
    const level = side === 'enemy' ? 1 : side === 'ally' ? 0.45 : 0.3;
    const cutoff = side === 'enemy' ? 20000 : side === 'ally' ? 2400 : 5000;
    const out = this._out(where, { wet: side === 'own' ? 0.06 : 0.22, cutoff });
    const o = (x) => ({ ...x, out });
    const r = 0.93 + Math.random() * 0.14;
    const g = level * (kind === 'land' ? 0.8 + 0.6 * weight : 1);
    if (kind === 'land') {
      this._tone(t, o({ duration: 0.16, gain: 0.55 * g, freq: 85 * r, to: 40 }));
      this._noise(t, o({ duration: 0.12, gain: 0.45 * g, type: 'lowpass', freq: 1000, q: 0.5, rate: r }));
      this._stepLayers(t + 0.025, o, surface, g * 0.8, r * 0.97); // the second foot
    }
    this._stepLayers(t, o, surface, g, r);
    this._done(out, 0.3);
  }

  _stepLayers(t, o, surface, g, r) {
    switch (surface) {
      case 'wood': // a hollow knock
        this._tone(t, o({ duration: 0.09, gain: 0.38 * g, freq: 210 * r, to: 150, type: 'triangle' }));
        this._noise(t, o({ duration: 0.08, gain: 0.32 * g, freq: 700 * r, q: 3, rate: r }));
        this._tone(t + 0.04, o({ duration: 0.06, gain: 0.18 * g, freq: 320 * r, to: 240, type: 'triangle' }));
        break;
      case 'metal': // a thump with a ringing clank
        this._tone(t, o({ duration: 0.06, gain: 0.3 * g, freq: 110 * r, to: 60 }));
        this._tone(t, o({ duration: 0.18, gain: 0.1 * g, freq: 1150 * r, type: 'triangle' }));
        this._tone(t, o({ duration: 0.13, gain: 0.07 * g, freq: 1790 * r }));
        this._tone(t, o({ duration: 0.22, gain: 0.05 * g, freq: 2630 * r }));
        this._noise(t, o({ duration: 0.05, gain: 0.3 * g, freq: 3200 * r, q: 2, rate: r }));
        break;
      default: // concrete: heel, scuff, grit, then the toe
        this._tone(t, o({ duration: 0.07, gain: 0.32 * g, freq: 95 * r, to: 55 }));
        this._noise(t, o({ duration: 0.06, gain: 0.38 * g, freq: 1100 * r, q: 1.1, rate: r }));
        this._noise(t + 0.005, o({ duration: 0.035, gain: 0.16 * g, type: 'highpass', freq: 4200, q: 0.7, rate: r }));
        this._noise(t + 0.045, o({ duration: 0.04, gain: 0.2 * g, freq: 1600 * r, q: 1.4, rate: r }));
    }
  }

  /** Zoom in or out (right click). */
  scope(zoomIn) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._noise(t, { duration: 0.06, gain: 0.18, freq: zoomIn ? 2200 : 1600, q: 2 });
    this._tone(t, { duration: 0.05, gain: 0.05, freq: zoomIn ? 900 : 700, type: 'triangle' });
  }

  spikeBeep(where = null) {
    if (!this.ctx || (where && where.volume < 0.03)) return;
    const out = this._out(where, { wet: 0.15 });
    this._tone(this.ctx.currentTime, { duration: 0.07, gain: 0.22, freq: 1900, type: 'square', out });
    this._done(out, 0.1);
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

  spikeDetonated(where = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this._out(where, { wet: 0.5 });
    this._noise(t, { duration: 1.6, gain: 1, type: 'lowpass', freq: 1400, sweepTo: 80, q: 0.6, out });
    this._tone(t, { duration: 1.2, gain: 0.8, freq: 90, to: 28, out });
    this._done(out, 1.7);
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
  ability(kind, where = null) {
    if (!this.ctx || (where && where.volume < 0.03)) return;
    const t = this.ctx.currentTime;
    const out = this._out(where, { wet: 0.25 });
    this._done(out, 1.1);
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

  /**
   * Your kill sound. Each kill in a round climbs higher and adds a note, like
   * Valorant's kill banner, and the fifth (an Ace) plays a fanfare.
   */
  kill(count = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.04;
    if (count >= 5) return this._ace(t);
    const n = Math.max(1, Math.floor(count));
    const root = 660 * 2 ** (((n - 1) * 3) / 12); // up a minor third per kill
    const steps = [0, 7, 12, 16, 19];             // root, fifth, octave, tenth, twelfth
    const notes = n + 1;
    for (let i = 0; i < notes; i++) {
      const f = root * 2 ** (steps[i] / 12);
      const last = i === notes - 1;
      const at = t + i * 0.065;
      this._tone(at, { duration: last ? 0.3 : 0.13, gain: 0.17, freq: f, type: 'triangle' });
      this._tone(at, { duration: last ? 0.25 : 0.1, gain: 0.05, freq: f * 2 });
    }
  }

  _ace(t) {
    const root = 523.25; // C5
    [0, 4, 7, 12, 16, 19, 24].forEach((st, i) =>
      this._tone(t + i * 0.05, { duration: 0.18, gain: 0.14, freq: root * 2 ** (st / 12), type: 'triangle' }));
    const at = t + 0.36;
    for (const st of [0, 4, 7, 12]) this._tone(at, { duration: 1.3, gain: 0.07, freq: root * 2 * 2 ** (st / 12), type: 'triangle' });
    this._tone(at, { duration: 0.5, gain: 0.3, freq: 110, to: 55 });
    this._noise(at, { duration: 0.8, gain: 0.08, type: 'highpass', freq: 6000, q: 0.5 });
  }
}

/**
 * A made-up room echo: a few early reflections off nearby walls, then a noise
 * tail that fades out and gets darker as it fades.
 */
function makeImpulse(ctx, { time, damping }) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * Math.max(0.1, time)));
  const buffer = ctx.createBuffer(2, len, rate);
  const pre = Math.floor(rate * 0.012); // short pre-delay
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      const smooth = 0.1 + 0.85 * damping * k; // darker as it fades
      lp += (Math.random() * 2 - 1 - lp) * (1 - smooth);
      data[i] = lp * (1 - k) ** 3;
    }
    for (let i = 0; i < pre && i < len; i++) data[i] *= i / pre;
    // Early reflections, slightly different on each ear for width.
    [[0.013, 0.5], [0.019, 0.35], [0.027, 0.28], [0.041, 0.2]].forEach(([at, g], j) => {
      const i = Math.floor(rate * (at + (ch ? 0.002 * (j + 1) : 0)));
      if (i < len) data[i] += g * (j % 2 ? -1 : 1);
    });
  }
  return buffer;
}

function makeNoise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
