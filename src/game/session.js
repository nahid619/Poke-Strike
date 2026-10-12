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
import { loadoutWith, PRIMARIES } from '../data/weapons.js';
import { load, save } from '../core/storage.js';

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
  syncMeshes(alpha, holdSeen = false) {
    this.alpha = alpha;
    for (const c of this.ctx.characters) c.syncMesh(alpha, holdSeen);
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
      if (shot.owner === this.viewTarget()) sound.shot(shot.weapon.id);
      else {
        // Other people's shots: quieter with distance, panned left or right.
        const L = this.listener;
        const dx = shot.origin.x - L.x;
        const dz = shot.origin.z - L.z;
        const d = Math.hypot(dx, dz);
        const angle = Math.atan2(-dx, -dz) - L.yaw;
        sound.shot(shot.weapon.id, Math.min(1, 1 / (1 + d / 8)), -Math.sin(angle) * Math.min(1, d / 3));
      }
    });
    events.on('hit', (hit) => {
      const me = this.controlled;
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
    events.on('kill', (kill) => kill.attacker === this.controlled && sound.kill());
    events.on('reloadStart', (e) => mine(e) && sound.reloadStart());
    events.on('reloadEnd', (e) => mine(e) && sound.reloadEnd());
    events.on('dryFire', (e) => mine(e) && sound.dryFire());
    events.on('equip', (e) => mine(e) && sound.equip());
    events.on('abilityCast', (e) => {
      if (mine(e)) return sound.ability(e.ability.sound);
      const L = this.listener;
      const dx = e.owner.pos.x - L.x;
      const dz = e.owner.pos.z - L.z;
      const d = Math.hypot(dx, dz);
      const angle = Math.atan2(-dx, -dz) - L.yaw;
      sound.ability(e.ability.sound, Math.min(1, 1 / (1 + d / 6)), -Math.sin(angle) * Math.min(1, d / 3));
    });
    events.on('abilityDenied', (e) => mine(e) && sound.ability('denied'));

    // Thrown abilities, traps, and recon: sounds placed where they happen.
    const at = (pos, kind, near = 6) => {
      const L = this.listener;
      const dx = pos.x - L.x;
      const dz = pos.z - L.z;
      const d = Math.hypot(dx, dz);
      const angle = Math.atan2(-dx, -dz) - L.yaw;
      sound.ability(kind, Math.min(1, 1 / (1 + d / near)), -Math.sin(angle) * Math.min(1, d / 3));
    };
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

function addLights(scene, { hemi = 1.0, sun: sunIntensity = 1.7, shadowSize = 26 }) {
  scene.add(new THREE.HemisphereLight(0xe4f0ff, 0x5a5444, hemi));
  const sun = new THREE.DirectionalLight(0xffffff, sunIntensity);
  sun.position.set(14, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 90,
  });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
}
