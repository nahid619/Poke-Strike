// Headless tests for the sound system. Node has no Web Audio, so this uses a
// strict stand-in that throws on the mistakes a browser would reject (NaN
// values, ramps to zero, negative start times) and tracks every node, so we
// can check that 3D placement, wall muffling, and cleanup all work.
// Run with: npm test
import * as THREE from 'three';

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

const finite = (v, what) => {
  if (!Number.isFinite(v)) throw new RangeError(`${what} is not a finite number: ${v}`);
};

class Param {
  constructor(v = 0) { this._v = v; }
  get value() { return this._v; }
  set value(v) { finite(v, 'AudioParam value'); this._v = v; }
  setValueAtTime(v, t) { finite(v, 'value'); finite(t, 'time'); this._v = v; return this; }
  linearRampToValueAtTime(v, t) { finite(v, 'value'); finite(t, 'time'); this._v = v; return this; }
  exponentialRampToValueAtTime(v, t) {
    finite(v, 'value'); finite(t, 'time');
    if (v <= 0) throw new RangeError('exponential ramp to a value that is not positive');
    this._v = v;
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = new Set();
    this.disconnected = false;
    ctx.nodes.push(this);
  }
  connect(n) {
    if (!n) throw new TypeError('connect() needs a node');
    this.outputs.add(n);
    return n;
  }
  disconnect() { this.outputs.clear(); this.disconnected = true; }
}

class FakeSource extends FakeNode {
  start(t = 0, offset = 0) {
    finite(t, 'start time'); finite(offset, 'offset');
    if (t < 0) throw new RangeError('negative start time');
    this.started = t;
  }
  stop(t = 0) { finite(t, 'stop time'); if (t < (this.started ?? 0)) throw new RangeError('stop before start'); }
}

class FakeContext {
  constructor() {
    this.nodes = [];
    this.sampleRate = 48000;
    this.currentTime = 1;
    this.state = 'running';
    this.destination = new FakeNode(this, 'destination');
    this.listener = {};
    for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) this.listener[k] = new Param();
  }
  resume() {}
  createGain() { const n = new FakeNode(this, 'gain'); n.gain = new Param(1); return n; }
  createBiquadFilter() {
    const n = new FakeNode(this, 'filter');
    n.type = 'lowpass'; n.frequency = new Param(350); n.Q = new Param(1);
    return n;
  }
  createOscillator() { const n = new FakeSource(this, 'osc'); n.type = 'sine'; n.frequency = new Param(440); return n; }
  createBufferSource() { const n = new FakeSource(this, 'buffer'); n.buffer = null; n.playbackRate = new Param(1); return n; }
  createPanner() {
    const n = new FakeNode(this, 'panner');
    n.positionX = new Param(); n.positionY = new Param(); n.positionZ = new Param();
    return n;
  }
  createStereoPanner() { const n = new FakeNode(this, 'stereo'); n.pan = new Param(); return n; }
  createConvolver() { const n = new FakeNode(this, 'convolver'); n.buffer = null; return n; }
  createDynamicsCompressor() {
    const n = new FakeNode(this, 'limiter');
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param();
    return n;
  }
  createBuffer(channels, length, rate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate: rate, getChannelData: (c) => data[c] };
  }
}

globalThis.window = { AudioContext: FakeContext };
const { Sound, DEFAULT_ROOM } = await import('../src/core/audio.js');

const settings = { volume: 0.6, spatialAudio: 'hrtf' };
const sound = new Sound(settings);
sound.unlock();
const ctx = sound.ctx;
const kinds = (from) => ctx.nodes.slice(from).map((n) => n.kind);

// ---- the room echo
{
  const ir = ctx.nodes.find((n) => n.kind === 'convolver').buffer;
  let finiteAll = true;
  let peak = 0;
  for (let c = 0; c < ir.numberOfChannels; c++) {
    for (const v of ir.getChannelData(c)) {
      if (!Number.isFinite(v)) finiteAll = false;
      peak = Math.max(peak, Math.abs(v));
    }
  }
  check('the room echo is built and has sound in it', finiteAll && peak > 0.05 && ir.length === Math.floor(48000 * DEFAULT_ROOM.time));
  sound.setRoom({ time: 0.85, wet: 0.4 });
  const ir2 = ctx.nodes.find((n) => n.kind === 'convolver').buffer;
  check('each map can have its own echo', ir2.length === Math.floor(48000 * 0.85) && sound.reverbReturn.gain.value === 0.4);
}

// ---- your ears follow the camera
{
  const cam = new THREE.PerspectiveCamera();
  cam.rotation.order = 'YXZ';
  cam.position.set(3, 1.6, -2);
  cam.rotation.set(0, Math.PI / 2, 0); // facing -X
  cam.updateMatrixWorld();
  sound.setListener(cam);
  const l = ctx.listener;
  check('the listener is where the camera is', l.positionX.value === 3 && Math.abs(l.positionY.value - 1.6) < 1e-9 && l.positionZ.value === -2);
  check('the listener faces where the camera faces', Math.abs(l.forwardX.value + 1) < 1e-9 && Math.abs(l.forwardZ.value) < 1e-9 && Math.abs(l.upY.value - 1) < 1e-9);
  check('the listener yaw matches the camera yaw', Math.abs(sound.listener.yaw - Math.PI / 2) < 1e-9);
}

// ---- every sound plays without errors, both 3D and stereo
const where = (o = {}) => ({ x: 0, y: 1, z: -5, volume: 0.6, distance: 5, occluded: false, ...o });
let errors = 0;
const tryAll = () => {
  const play = (name, fn) => {
    try { fn(); } catch (e) { errors++; failures.push(`${name} threw: ${e.message}`); }
  };
  for (const id of ['rifle', 'pistol', 'sniper', 'sidearm', 'lightpistol', 'smg', 'shotgun', 'marksman', 'carbine', 'unknown']) {
    play(`own ${id} shot`, () => sound.shot(id));
    play(`near ${id} shot`, () => sound.shot(id, where()));
    play(`far ${id} shot`, () => sound.shot(id, where({ distance: 60, volume: 0.1 })));
    play(`walled ${id} shot`, () => sound.shot(id, where({ occluded: true })));
  }
  for (const surface of ['concrete', 'wood', 'metal', 'mud']) {
    for (const side of ['enemy', 'ally', 'own']) {
      for (const kind of ['step', 'land']) {
        play(`${side} ${kind} on ${surface}`, () => sound.footstep(side === 'own' ? null : where(), { surface, kind, side, weight: 0.7 }));
      }
    }
  }
  for (const n of [1, 2, 3, 4, 5, 6]) play(`kill ${n}`, () => sound.kill(n));
  for (const kind of ['dash', 'zap', 'flame', 'smoke', 'mark', 'teleport', 'shield', 'splash', 'reveal', 'sing', 'heal', 'throw', 'bounce', 'flash', 'trap', 'alarm', 'ping', 'denied']) {
    play(`ability ${kind}`, () => { sound.ability(kind); sound.ability(kind, where()); });
  }
  play('spike', () => {
    sound.spikeBeep(where()); sound.spikeBeep(); sound.spikePlanted(); sound.spikeDefused();
    sound.spikeDetonated(where()); sound.spikeDetonated();
  });
  play('other sounds', () => {
    sound.scope(true); sound.scope(false); sound.progressTick(); sound.hurt(); sound.roundLive();
    sound.roundEnd(true); sound.roundEnd(false); sound.dryFire(); sound.reloadStart(); sound.reloadEnd();
    sound.equip(); sound.hit('head'); sound.hit('body');
  });
};
let mark = ctx.nodes.length;
tryAll();
check('every sound plays in 3D without errors', errors === 0, `${errors} errors`);
const hrtfPanners = ctx.nodes.slice(mark).filter((n) => n.kind === 'panner');
// 30 placed shots, 16 placed footsteps, 18 placed abilities, 2 placed spike sounds.
check('3D sounds use HRTF panners', hrtfPanners.length === 66 && hrtfPanners.every((p) => p.panningModel === 'HRTF' && p.rolloffFactor === 0));
check('3D mode makes no stereo panners', !kinds(mark).includes('stereo'));

settings.spatialAudio = 'stereo';
mark = ctx.nodes.length;
errors = 0;
tryAll();
check('every sound plays in stereo without errors', errors === 0, `${errors} errors`);
check('stereo mode uses left/right panning only', kinds(mark).includes('stereo') && !kinds(mark).includes('panner'));
settings.spatialAudio = 'hrtf';

// ---- distance and walls
{
  const filterOf = (w) => { const f = sound._out(w, {}); sound._done(f, 0); return f; }; // the first node is the filter
  const near = filterOf(where({ distance: 2 }));
  const far = filterOf(where({ distance: 40 }));
  const walled = filterOf(where({ distance: 2, occluded: true }));
  check('distant sounds lose their high end', far.frequency.value < near.frequency.value / 3);
  check('a wall muffles a sound', walled.frequency.value <= 750);
  const sendOf = (input) => input._nodes.find((n) => n.kind === 'gain' && n !== input._nodes[1]).gain.value;
  check('distant sounds have more echo', sendOf(far) > sendOf(near) * 1.5);
  check('a quiet enough sound is skipped', (() => {
    const before = ctx.nodes.length;
    sound.footstep(where({ volume: 0.001 }));
    return ctx.nodes.length === before;
  })());
  // Allies' steps are deliberately duller than enemies'.
  mark = ctx.nodes.length;
  sound.footstep(where(), { side: 'ally' });
  const allyCut = ctx.nodes[mark].frequency.value;
  mark = ctx.nodes.length;
  sound.footstep(where(), { side: 'enemy' });
  const enemyCut = ctx.nodes[mark].frequency.value;
  check("teammates' footsteps sound duller than enemies'", allyCut <= 2400 && enemyCut > 8000, `${allyCut} vs ${enemyCut}`);
}

// ---- nodes are freed after sounds finish
await new Promise((r) => setTimeout(r, 2800));
{
  const placed = ctx.nodes.filter((n) => n.kind === 'panner' || n.kind === 'stereo');
  const freed = placed.filter((n) => n.disconnected).length;
  check('finished sounds free their nodes', freed === placed.length, `${freed} of ${placed.length}`);
}

console.log(`audio: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
