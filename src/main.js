// Poké Strike: boot, modes, screen state, and the fixed-timestep game loop.
// Every screen (title, agent select, settings, pause, results) lives in
// src/ui/menu.js; this file runs the game underneath them.
import * as THREE from 'three';
import './ui/styles.css';

import { Input } from './core/input.js';
import { Sound } from './core/audio.js';
import { DebugOverlay } from './core/debug.js';
import { settings, QUALITY } from './core/settings.js';
import { load } from './core/storage.js';
import { MOVE } from './game/character.js';
import { HumanController } from './game/controllers.js';
import { Viewmodel } from './game/viewmodel.js';
import { Hud } from './ui/hud.js';
import { createMenus } from './ui/menu.js';
import { RangeMode } from './modes/range.js';
import { AimTrainer } from './modes/aimtrainer.js';
import { MatchMode } from './modes/match.js';
import { AGENTS, agentById } from './data/agents.js';
import { mapById } from './data/maps/index.js';

const TICK_RATE = 60;
const TICK = 1 / TICK_RATE;
const MAX_TICKS_PER_FRAME = 5; // avoid a death spiral on very slow frames

// ---------- Renderer and camera ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (err) {
  // No WebGL: explain instead of showing a blank page.
  const box = document.getElementById('loading');
  box.querySelector('p').textContent =
    'Your browser could not start 3D graphics (WebGL). Try Chrome, Edge, or Brave, make sure ' +
    'hardware acceleration is on in the browser settings, and update your graphics drivers.';
  box.classList.add('failed');
  throw err;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false; // we draw the world, then the gun on top
document.getElementById('app').appendChild(renderer.domElement);

/** Apply the graphics quality setting: shadows, shadow detail, and resolution. */
function applyQuality() {
  const q = QUALITY[settings.quality] ?? QUALITY.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const changed = renderer.shadowMap.enabled !== q.shadows;
  renderer.shadowMap.enabled = q.shadows;
  for (const s of [range, trainer, ...matches.values()]) {
    if (!s) continue;
    s.scene.traverse((o) => {
      if (o.isDirectionalLight && o.castShadow && o.shadow.mapSize.x !== q.shadowSize) {
        o.shadow.mapSize.set(q.shadowSize, q.shadowSize);
        o.shadow.map?.dispose();
        o.shadow.map = null;
      }
      // Turning shadows on or off needs the materials rebuilt.
      if (changed && o.material) o.material.needsUpdate = true;
    });
  }
}

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ'; // yaw, then pitch: standard FPS camera

// Settings store horizontal FOV (like Valorant); Three.js wants vertical.
// `kick` widens it briefly (dashes).
function applyFov(kick = 0) {
  const h = THREE.MathUtils.degToRad(settings.fov + kick);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / camera.aspect));
  camera.updateProjectionMatrix();
}
applyFov();

// ---------- Shared systems ----------
const input = new Input();
const human = new HumanController(input, settings);
const sound = new Sound(settings);
const hud = new Hud();
const viewmodel = new Viewmodel(window.innerWidth / window.innerHeight);
const debug = new DebugOverlay();
const shared = { renderer, sound, hud, viewmodel, controller: human, settings };

// ---------- Modes (built once, reused) ----------
let range = null;
let trainer = null;
const matches = new Map(); // map id -> MatchMode
let match = null;          // the match mode in use (last map picked)
let session = null;

function getRange() {
  if (!range) {
    range = new RangeMode(shared);
    range.setAgent(agentById(load('agent', AGENTS[0].id)));
  }
  return range;
}

function getTrainer() {
  return (trainer ??= new AimTrainer(shared));
}

/** The match mode for a map (built the first time), or the current one. */
function getMatch(mapId = null) {
  const id = mapId ?? match?.map.id ?? 'crossroads';
  if (!matches.has(id)) {
    const m = new MatchMode(shared, mapById(id));
    m.events.on('feed', (f) => hud.feed(f, m.player));
    m.events.on('takeover', () => sound.equip());
    m.events.on('callout', ({ from, enemy, lane }) => {
      if (from.team !== 'ally') return;
      const site = Object.entries(m.map.sites).find(([, s]) => Math.hypot(enemy.pos.x - s.x, enemy.pos.z - s.z) < 6);
      const where = site ? `on site ${site[0]}` : lane === 'M' ? 'in mid' : `in ${lane} lane`;
      hud.callout(from.name, `Enemy ${where}`);
    });
    m.events.on('roundLive', () => sound.roundLive());
    // Plant and defuse
    const near = (pos) => {
      const d = Math.hypot(pos.x - m.listener.x, pos.z - m.listener.z);
      const angle = Math.atan2(-(pos.x - m.listener.x), -(pos.z - m.listener.z)) - m.listener.yaw;
      return [Math.min(1, 1 / (1 + d / 10)), -Math.sin(angle) * Math.min(1, d / 3)];
    };
    const sideClass = () => (m.controlled.team === m.attackers ? 'attack' : 'defend');
    m.events.on('spikeBeep', ({ pos }) => sound.spikeBeep(...near(pos)));
    m.events.on('spikePlanted', ({ site }) => { sound.spikePlanted(); hud.announce(`Spike planted on site ${site}`, sideClass()); });
    m.events.on('spikeDefused', () => { sound.spikeDefused(); hud.announce('Spike defused', sideClass()); });
    m.events.on('spikeDetonated', ({ pos }) => sound.spikeDetonated(near(pos)[0] * 0.7 + 0.3));
    m.events.on('spikeDropped', () => { if (m.controlled.team === m.attackers) hud.announce('Spike dropped', 'attack'); });
    m.events.on('spikePickup', ({ who }) => { if (who.team === m.controlled.team) hud.announce(who === m.controlled ? 'You picked up the spike' : `${who.name} has the spike`, sideClass()); });
    m.events.on('barrierDown', () => { if (m.controlled.team === m.attackers) hud.announce('Barrier down. Go plant.', 'attack'); });
    m.events.on('sidesSwapped', () => hud.announce(m.controlled.team === m.attackers ? 'Second half: you are attacking' : 'Second half: you are defending', sideClass()));
    m.events.on('roundStart', () => {
      if (!m.spikeMode) return;
      const mine = m.controlled.team === m.attackers;
      const carrier = m.spike.carrier === m.controlled ? 'You have the spike' : '';
      hud.announce(mine ? `Attacking${carrier ? `. ${carrier}` : ''}` : 'Defending', sideClass());
    });
    m.events.on('roundEnd', ({ winner }) => sound.roundEnd(winner === 'ally'));
    matches.set(id, m);
  }
  match = matches.get(id);
  return match;
}

function useSession(next) {
  if (session === next) return;
  session = next;
  applyQuality(); // newly built scenes pick up the current quality
  session.resetInterpolation();
  debug.attach(session.scene, session.world, session.nav ?? null);
  document.body.dataset.mode = session === trainer ? 'trainer' : session.isMatch ? 'match' : 'range';
}

// ---------- Screen state and mouse capture ----------
const overlay = document.getElementById('overlay');
const lockError = document.getElementById('lock-error');
let state = 'menu';
let accumulator = 0;

function setState(next) {
  state = next;
  document.body.dataset.state = next;
  overlay.hidden = next === 'playing';
  for (const el of document.querySelectorAll('[data-card]')) el.hidden = el.dataset.card !== next;
  if (next === 'playing') lockError.hidden = true;
}

function showLockError() {
  lockError.textContent =
    'The browser didn\u2019t capture the mouse. Wait a second after pressing Esc, then click again.';
  lockError.hidden = false;
}

async function play() {
  sound.unlock(); // audio can only start from a click
  lockError.hidden = true;
  try {
    await input.lock(renderer.domElement, { raw: settings.rawInput });
  } catch {
    showLockError();
  }
}

input.onLockChange = (locked) => {
  if (locked) {
    accumulator = 0;
    session.resetInterpolation();
    setState('playing');
  } else if (state === 'playing') {
    setState('paused');
  }
};
input.onLockError = showLockError;

window.addEventListener('keydown', (e) => {
  if (e.code === 'F3') {
    e.preventDefault();
    debug.toggle();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  applyFov();
  viewmodel.setAspect(camera.aspect);
  renderer.setSize(window.innerWidth, window.innerHeight);
});
applyQuality();

// ---------- Menus ----------
const app = {
  settings, sound, hud, input,
  get session() { return session; },
  get state() { return state; },
  getRange, getTrainer, getMatch, useSession, setState, play, applyFov, applyQuality,
};
const menu = createMenus(app);
menu.goToMenu();

// ---------- Trainer HUD ----------
const tTime = document.getElementById('t-time');
const tScore = document.getElementById('t-score');
const tCountdown = document.getElementById('t-countdown');
let lastTrainerText = '';

function updateTrainerHud() {
  if (session !== trainer || !trainer.stats) return;
  const counting = trainer.phase === 'countdown';
  const text = `${trainer.timeLeft.toFixed(1)}|${trainer.stats.score}|${counting ? Math.ceil(trainer.countdown) : ''}`;
  if (text === lastTrainerText) return;
  lastTrainerText = text;
  tTime.textContent = trainer.timeLeft.toFixed(1);
  tScore.textContent = trainer.stats.score;
  tCountdown.textContent = counting ? Math.ceil(trainer.countdown) : '';
}

// ---------- Frame rate counter ----------
const fpsEl = document.getElementById('fps');
let fpsFrames = 0;
let fpsTime = 0;
function updateFps(dt) {
  fpsEl.hidden = !settings.showFps;
  if (!settings.showFps) return;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} fps`;
    fpsFrames = 0;
    fpsTime = 0;
  }
}

// ---------- Game loop ----------
// Game logic runs at a fixed 60 ticks per second. Rendering runs as fast as
// the screen allows and interpolates between ticks, so 60 Hz and 144 Hz
// screens play identically. Mouse look is applied every frame.
let last = performance.now();
let look = { x: 0, y: 0 };
let fovKick = 0;
let orbit = 0;

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  const me = session.controlled;

  let ticks = 0;
  if (state === 'playing') {
    look = me.alive ? human.updateLook(me) : (input.consumeMouse(), { x: 0, y: 0 });
    if (!me.alive && session.isMatch && input.consumePressed('Mouse0')) session.cycleSpectate();
    accumulator += dt;
    while (accumulator >= TICK && ticks < MAX_TICKS_PER_FRAME) {
      session.tick(TICK);
      accumulator -= TICK;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) accumulator = 0;
    if (session === trainer && trainer.finished) menu.showDrillResults();
    if (session.isMatch && session.finished) menu.showMatchEnd();
  } else {
    look = { x: 0, y: 0 };
  }

  const running = state === 'playing';
  const alpha = running ? accumulator / TICK : 1;
  // A click that hasn't reached a tick yet keeps the frame it was made on, so
  // the shot is checked against what you actually clicked at.
  session.syncMeshes(alpha, input.hasPendingPress('Mouse0'));

  // The camera follows you, or a teammate you are spectating. Hide that body.
  const player = session.viewTarget();
  for (const c of session.ctx.characters) if (c.isCharacter) c.mesh.visible = c !== player;
  document.body.classList.toggle('view-dead', !player.alive);

  // Title screen: a slow aerial orbit over the empty match map.
  const backdrop = session.isMatch && session.phase === 'idle' && state !== 'playing' && state !== 'paused';
  const pose = backdrop ? null : session.cameraPose?.(alpha);
  if (backdrop) {
    orbit += dt * 0.06;
    const r = session.mapRadius;
    camera.position.set(Math.sin(orbit) * r, r * 0.6, Math.cos(orbit) * r);
    camera.lookAt(0, 0, 0);
  } else if (pose) {
    // During a takeover the camera glides from your body to the teammate's.
    camera.position.copy(pose.pos);
    camera.rotation.set(pose.pitch, pose.yaw, 0);
  } else {
    // Eyes + view direction (including recoil).
    player.eyePosition(alpha, camera.position);
    camera.rotation.set(player.viewPitch, player.viewYaw, 0);
  }
  camera.updateMatrixWorld();
  document.body.classList.toggle('took-over', !!session.isMatch && session.controlled !== session.player);
  session.listener.x = camera.position.x;
  session.listener.y = camera.position.y;
  session.listener.z = camera.position.z;
  session.listener.yaw = player.viewYaw;

  // Dashes widen the FOV for a moment.
  const kickTarget = player.dash ? 8 : 0;
  if (Math.abs(kickTarget - fovKick) > 0.01 || fovKick !== 0) {
    fovKick += (kickTarget - fovKick) * Math.min(1, dt * 18);
    if (Math.abs(fovKick) < 0.01) fovKick = 0;
    applyFov(fovKick);
  }

  const L = player.loadout;
  viewmodel.update(running ? dt : 0, {
    weaponId: L.current.def.id,
    equip: L.equipProgress,
    reload: L.reloadProgress,
    speed: Math.min(1, Math.hypot(player.vel.x, player.vel.z) / MOVE.runSpeed),
    onGround: player.onGround,
    lookX: look.x,
    lookY: look.y,
  });
  session.updateVisuals(running ? dt : 0, camera);

  // HUD. The crosshair opens up by the current spread (degrees -> pixels).
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const spreadPx = settings.crosshairDynamic
    ? (Math.tan(THREE.MathUtils.degToRad(L.lastSpread)) / Math.tan(vfov / 2)) * (window.innerHeight / 2)
    : 0;
  hud.update(player, Math.min(spreadPx, 80));
  hud.statusEffects({
    smoke: session.world.inSmoke(camera.position),
    sleep: player.asleep,
    stun: player.stunned,
    slow: player.status.slow > 0,
    heal: player.healing,
    shield: player.bonusShield > 0,
    revealed: player.revealed,
  });
  updateTrainerHud();
  if (session.isMatch && session.phase !== 'idle') {
    hud.updateMatch(session);
    hud.scoreboard(state === 'playing' && input.isDown('Tab'), session);
  } else {
    hud.scoreboard(false);
  }
  debug.update(dt, ticks, { player, state, rawInput: input.rawInput });
  if (session.bots) debug.updateBots(session.bots);
  updateFps(dt);

  renderer.clear();
  renderer.render(session.scene, camera);
  if ((state === 'playing' || state === 'paused') && player.alive) viewmodel.render(renderer);
  requestAnimationFrame(frame);
}

if (import.meta.env.DEV) {
  // Handy in the browser console while developing.
  window.__ps = {
    get session() { return session; },
    input, camera, renderer, setState, getTrainer, getRange, getMatch, debug, useSession, agentById, menu,
    step(seconds) { for (let i = 0; i < Math.round(seconds / TICK); i++) session.tick(TICK); },
  };
}

requestAnimationFrame((now) => {
  frame(now);
  // The first frame is drawn: show the game and fade out the loading screen.
  document.body.classList.add('ready');
  const loading = document.getElementById('loading');
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 400);
});
