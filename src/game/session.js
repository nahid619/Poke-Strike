// A Session is one playable space: its scene, map, collision world, player,
// and effects, plus the wiring that turns game events into sound, visuals,
// and HUD feedback. Modes (test range, aim trainer, and later the 5v5 match)
// extend this class.
import * as THREE from 'three';
import { World } from '../core/physics.js';
import { Events } from '../core/events.js';
import { Character } from './character.js';
import { Loadout } from './weapons.js';
import { Effects } from './effects.js';
import { AbilityKit } from './abilities.js';
import { AbilityFx } from './abilityfx.js';
import { Zones } from './zones.js';
import { buildLevel } from './level.js';
import { Footsteps } from './footsteps.js';
import { KillStreak, STREAK } from './streak.js';
import { loadoutWith, PRIMARIES } from '../data/weapons.js';
import { purchase } from './economy.js';
import { load, save } from '../core/storage.js';

/** How far away you can hear running footsteps (meters). Bots hear about as far. */
export const FOOTSTEP_RANGE = 30;

/** The primary weapon you last picked in the buy menu. */
export const savedPrimary = () => {
  const id = load('primary', 'rifle');
  return PRIMARIES.includes(id) ? id : 'rifle';
};

export class Session {
  constructor({ map, renderer, sound, hud, viewmodel, controller, loadout = loadoutWith(savedPrimary()) }) {
    this.map = map;
    this.human = controller; // the keyboard-and-mouse controller
    this.sound = sound;
    this.hud = hud;
    this.viewmodel = viewmodel;

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(map.sky);
    scene.fog = new THREE.Fog(map.sky, map.fogNear ?? 50, map.fogFar ?? 140);
    addLights(scene, map.light ?? {});

    this.world = new World();
    buildLevel(map, { scene, world: this.world, renderer });

    this.events = new Events();
    this.effects = new Effects(scene);
    this.zones = new Zones(this.world, this.events);
    this.abilityFx = new AbilityFx(scene, this.events);
    this.footsteps = new Footsteps(this.world, this.events);
    this.streak = new KillStreak();
    this.ctx = { world: this.world, characters: [], events: this.events, zones: this.zones, time: 0 };

    this.player = new Character({ name: 'You', team: 'ally' });
    this.player.mesh.visible = false; // first person: don't draw your own body
    this.player.loadout = new Loadout(loadout);
    this.player.setController(controller);
    this.add(this.player);
    this.respawnPlayer();

    this.pendingShots = [];
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; // where the camera is, for sound
    this._wireFeedback();
  }

  /** The character you are controlling right now (your own body unless you took one over). */
  get controlled() {
    return this.player;
  }

  /** Who the camera follows. Modes with spectating or takeover override this. */
  viewTarget() {
    return this.controlled;
  }

  add(character) {
    this.ctx.characters.push(character);
    this.scene.add(character.mesh);
    return character;
  }

  remove(character) {
    const i = this.ctx.characters.indexOf(character);
    if (i >= 0) this.ctx.characters.splice(i, 1);
    character.mesh.removeFromParent();
  }

  /** Play as an agent (or null for no abilities). */
  setAgent(agent) {
    this.player.abilities?.reset();
    this.player.agent = agent;
    this.player.abilities = agent ? new AbilityKit(agent) : null;
    this.zones.clear();
  }

  respawnPlayer() {
    const s = this.map.spawn;
    this.player.revive(s.x, 0, s.z, s.yaw);
  }

  /** One fixed game step. */
  tick(dt) {
    const list = this.ctx.characters;
    for (let i = 0; i < list.length; i++) list[i].tick(dt, this.ctx);
    this.world.separateCharacters(list.filter((c) => c.isCharacter && c.alive));
    this.footsteps.tick(dt, list);
    this.zones.tick(dt, this.ctx);
    this.ctx.time += dt;
    this.onTick(dt);
  }

  /** Mode-specific logic, after everyone has moved. */
  onTick() {}

  // ---- buy menu ----

  /** Can you change guns right now? The test range: always. Modes override this. */
  canBuy() {
    return this.controlled === this.player && this.player.alive && !!this.player.loadout && this.player.loadout.weapons.length > 1;
  }

  /** The buy menu in the test range: everything is free. Primaries are remembered for next time. */
  buy(id) {
    if (!this.canBuy()) return null;
    const result = purchase(this.player, id, { free: true, ctx: this.ctx });
    if (result.ok && PRIMARIES.includes(id)) save('primary', id);
    return result;
  }

  /** Pick your primary weapon (slot 1). Remembered for next time. */
  buyPrimary(id) {
    if (!this.canBuy() || !PRIMARIES.includes(id)) return false;
    save('primary', id);
    const L = this.player.loadout;
    const changed = L.setPrimary(id, this.player, this.ctx);
    if (L.index !== 0) L.switchTo(0, this.player, this.ctx);
    return changed;
  }

  /** `holdSeen`: a click is waiting for the next tick (see Character.syncMesh). */
  syncMeshes(alpha, holdSeen = false, dt = 0) {
    this.alpha = alpha;
    for (const c of this.ctx.characters) c.syncMesh(alpha, holdSeen, dt);
  }

  /** Per rendered frame, after the camera has moved. */
  updateVisuals(dt, camera) {
    this._drawShots(camera);
    this.effects.update(dt);
    this.abilityFx.update(dt, this.ctx.time, this.alpha ?? 1);
    this.spikeFx?.update(dt, this);
  }

  resetInterpolation() {
    for (const c of this.ctx.characters) c.prevPos.copy(c.pos);
  }

  /**
   * Where a sound at `pos` is, as heard from the camera: for Sound's methods.
   *   near:  distance (m) at which it is half as loud
   *   range: beyond this it can't be heard at all (it fades out before)
   *   lift:  height above `pos` to check walls from (feet are often behind low cover)
   * A wall between you and the sound muffles it and makes it quieter.
   */
  placeSound(pos, near = 8, { range = Infinity, lift = 0 } = {}) {
    const L = this.listener;
    const y = pos.y ?? 0;
    const d = Math.hypot(pos.x - L.x, y - L.y, pos.z - L.z);
    const fade = range === Infinity ? 1 : Math.max(0, Math.min(1, (range - d) / (range * 0.25)));
    if (fade <= 0) return { x: pos.x, y, z: pos.z, volume: 0, distance: d, occluded: false };
    const occluded = !this.world.lineOfSight(L, { x: pos.x, y: y + lift, z: pos.z }, false);
    const volume = (fade / (1 + d / near)) * (occluded ? 0.55 : 1);
    return { x: pos.x, y: y + lift * 0.5, z: pos.z, volume: Math.min(1, volume), distance: d, occluded };
  }

  // Shots are queued and drawn after the camera moves this frame, so tracers
  // start exactly at the gun.
  _drawShots(camera) {
    const muzzle = (this._muzzle ??= new THREE.Vector3());
    const end = (this._end ??= new THREE.Vector3());
    for (const shot of this.pendingShots) {
      const h = shot.hit;
      end.set(h.point.x, h.point.y, h.point.z);
      if (shot.owner === this.viewTarget()) {
        this.viewmodel.onFire();
        this.viewmodel.muzzleWorld(camera, muzzle);
      } else {
        muzzle.set(shot.origin.x, shot.origin.y - 0.15, shot.origin.z);
      }
      this.effects.tracer(muzzle, end);
      // Shotgun pellets: a tracer for some, and impacts for all.
      (shot.pellets ?? []).forEach((p, i) => {
        if (i % 3 === 0) this.effects.tracer(muzzle, end.set(p.point.x, p.point.y, p.point.z));
        if (p.wall && i % 2 === 0) this.effects.bulletHole(p.point, p.normal);
        else if (p.character && p.character !== this.viewTarget()) this.effects.puff(p.point, 0xff6a6a, 0.035);
      });
      end.set(h.point.x, h.point.y, h.point.z);
      if (h.character) {
        // No puff on the body the camera is in (it would fill the screen).
        if (h.character !== this.viewTarget()) this.effects.puff(h.point, h.part === 'head' ? 0xffd34d : 0xff6a6a, 0.05);
      } else if (h.wall) {
        this.effects.bulletHole(h.point, h.normal);
        this.effects.puff(h.point, 0xd8d0c0, 0.04);
      }
    }
    this.pendingShots.length = 0;
  }

  _wireFeedback() {
    const { events, sound, hud } = this;
    const mine = (e) => e.owner === this.controlled;
    events.on('shot', (shot) => {
      this.pendingShots.push(shot);
      shot.owner.visualFire?.(); // the gun kicks on their body
      // Your shots play at your ears; everyone else's where they are.
      if (shot.owner === this.viewTarget()) sound.shot(shot.weapon.id);
      else sound.shot(shot.weapon.id, this.placeSound(shot.origin, shot.weapon.suppressed ? 3.5 : 8)); // silenced: much quieter
    });
    // Footsteps (see footsteps.js): enemies are loud and crisp, teammates
    // quieter and duller, and your own quiet. Same range as the bots' hearing.
    events.on('footstep', (f) => {
      const viewer = this.viewTarget();
      const side = f.who === viewer ? 'own' : f.who.team === viewer.team ? 'ally' : 'enemy';
      const where = side === 'own' ? null
        : this.placeSound(f, 7, { range: f.kind === 'land' ? FOOTSTEP_RANGE * 1.15 : FOOTSTEP_RANGE, lift: 1 });
      sound.footstep(where, { surface: f.surface, kind: f.kind, side, weight: f.weight });
    });
    events.on('hit', (hit) => {
      const me = this.controlled;
      if (hit.attacker) hit.victim.visualHit?.(hit.attacker.pos, hit.part); // flinch, and which way they fall
      if (hit.victim === me) {
        const a = hit.attacker;
        const angle = a ? Math.atan2(-(a.pos.x - me.pos.x), -(a.pos.z - me.pos.z)) - me.viewYaw : 0;
        hud.hurt(angle);
        sound.hurt();
      }
      if (hit.attacker !== me) return;
      hud.hitMarker(hit.part, !hit.victim.alive);
      hud.damageNumber(hit.damage, hit.part);
      if (hit.victim.alive) sound.hit(hit.part);
    });
    // Escalating kill sounds: 1, 2, 3, 4 kills, then an Ace. In a match the
    // count lasts the round; elsewhere kills chain if they are close together.
    events.on('kill', (kill) => {
      if (kill.attacker !== this.controlled || kill.victim.team === kill.attacker.team) return;
      const n = this.streak.add(this.ctx.time, this.isMatch ? Infinity : STREAK.window);
      sound.kill(n);
      if (this.isMatch && n === STREAK.ace) hud.announce?.('Ace', 'ace');
    });
    events.on('roundStart', () => this.streak.reset());
    events.on('reloadStart', (e) => mine(e) && sound.reloadStart());
    events.on('reloadEnd', (e) => mine(e) && sound.reloadEnd());
    events.on('dryFire', (e) => mine(e) && sound.dryFire());
    events.on('equip', (e) => mine(e) && sound.equip());
    events.on('abilityCast', (e) => {
      if (mine(e)) return sound.ability(e.ability.sound);
      sound.ability(e.ability.sound, this.placeSound(e.owner.pos, 6, { lift: 1.2 }));
    });
    events.on('abilityDenied', (e) => mine(e) && sound.ability('denied'));

    // Thrown abilities, traps, and recon: sounds placed where they happen.
    const at = (pos, kind, near = 6) => sound.ability(kind, this.placeSound(pos, near, { lift: 0.3 }));
    events.on('payload', (e) => at(e.point, e.kind === 'flash' ? 'flash' : e.kind === 'fire' ? 'flame'
      : e.kind === 'concuss' ? 'zap' : e.kind === 'sleep' ? 'sing' : 'reveal', 10));
    events.on('projectileBounce', (p) => at(p, 'bounce', 4));
    events.on('reconPulse', (e) => at(e.zone, 'ping', 12));
    events.on('trapTriggered', (e) => {
      const me = this.controlled;
      if (e.victim === me || e.owner?.team === me.team) sound.ability('alarm');
      if (e.owner?.team === me.team && e.victim !== me) hud.callout?.(e.owner === me ? 'Your trap' : e.owner.name, `Trap caught ${e.victim.name}`);
    });
  }
}

/**
 * Sky light and sun. Maps can set the mood: sunColor, sunDir (where the sun
 * is), and the sky and ground colors of the soft fill light.
 */
function addLights(scene, {
  hemi = 1.0, sun: sunIntensity = 1.7, shadowSize = 26,
  sunColor = 0xffffff, sunDir = [14, 26, 10], skyColor = 0xe4f0ff, groundColor = 0x5a5444,
}) {
  scene.add(new THREE.HemisphereLight(skyColor, groundColor, hemi));
  const sun = new THREE.DirectionalLight(sunColor, sunIntensity);
  sun.position.set(...sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 90,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
}
