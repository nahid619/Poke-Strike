// Aim Trainer: 30-second drills with score, accuracy, and saved best scores.
import { Session } from '../game/session.js';
import { Character } from '../game/character.js';
import { StrafeController } from '../game/controllers.js';
import { Loadout } from '../game/weapons.js';
import { Orb } from '../game/targets.js';
import { yawToward } from '../game/level.js';
import { load, save } from '../core/storage.js';
import aimrange from '../data/maps/aimrange.js';

export const DRILL_TIME = 30;
const COUNTDOWN = 3;
const BODY_REMOVE_DELAY = 0.35; // let the fall animation play
const BEST_KEY = 'aimBest';
const DEG = Math.PI / 180;

export const DRILLS = [
  {
    id: 'static',
    name: 'Static',
    about: 'Three still targets. Hit one and another appears. Headshots score 150, other hits 100.',
    targets: 3,
    heads: true,
  },
  {
    id: 'moving',
    name: 'Moving',
    about: 'Two targets strafing at running speed. Stop, aim, tap. Headshots score 150.',
    targets: 2,
    heads: true,
  },
  {
    id: 'flick',
    name: 'Flick',
    about: 'One orb at a time, anywhere in view. 100 per hit, up to 100 more for fast hits.',
    targets: 1,
    heads: false,
  },
  {
    id: 'tracking',
    name: 'Tracking',
    about: 'Keep the crosshair on a drifting orb while you fire. 10 per bullet that lands.',
    targets: 1,
    heads: false,
  },
];

export function bestScores() {
  return load(BEST_KEY, {});
}

export function bestKey(drillId, weaponId) {
  return `${drillId}:${weaponId}`;
}

const rand = (a, b) => a + Math.random() * (b - a);

export class AimTrainer extends Session {
  constructor(shared) {
    super({ ...shared, map: aimrange, loadout: ['rifle'] });
    this.phase = 'idle'; // idle -> countdown -> running -> done
    this.targets = [];
    this.removals = [];
    this.stats = null;
    this.result = null;

    this.events.on('shot', (s) => {
      if (s.owner === this.player && this.phase === 'running') this.stats.shots++;
    });
    this.events.on('hit', (h) => this._onHit(h));
  }

  get finished() {
    return this.phase === 'done';
  }

  begin(drillId, weaponId) {
    this.drill = DRILLS.find((d) => d.id === drillId) ?? DRILLS[0];
    this.weaponId = weaponId;
    for (const t of [...this.targets]) this._removeTarget(t);
    this.removals.length = 0;

    const loadout = new Loadout([weaponId]);
    loadout.infiniteAmmo = true;
    loadout.enabled = false;
    this.player.loadout = loadout;
    this.respawnPlayer();

    this.stats = { score: 0, shots: 0, hits: 0, heads: 0, reactions: [] };
    this.result = null;
    this.lastFlick = null;
    this.countdown = COUNTDOWN;
    this.timeLeft = DRILL_TIME;
    this.phase = 'countdown';
  }

  onTick(dt) {
    for (let i = this.removals.length - 1; i >= 0; i--) {
      if (this.ctx.time < this.removals[i].at) continue;
      this._removeTarget(this.removals[i].target);
      this.removals.splice(i, 1);
    }

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'running';
        this.player.loadout.enabled = true;
        this._fill();
      }
      return;
    }
    if (this.phase !== 'running') return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.phase = 'done';
      this.player.loadout.enabled = false;
      for (const t of [...this.targets]) this._removeTarget(t);
      this.removals.length = 0;
      this._finish();
    }
  }

  // ---- targets ----

  _fill() {
    let alive = this.targets.filter((t) => t.alive).length;
    while (alive < this.drill.targets) {
      this._spawn();
      alive++;
    }
  }

  _spawn() {
    const id = this.drill.id;
    if (id === 'static' || id === 'moving') this._spawnBody(id === 'moving');
    else if (id === 'flick') this._spawnFlickOrb();
    else this._spawnTrackingOrb();
  }

  _spawnBody(moving) {
    const zone = moving ? aimrange.zones.strafe : aimrange.zones.floor;
    let x = 0;
    let z = -16;
    for (let tries = 0; tries < 30; tries++) {
      x = rand(zone.minX, zone.maxX);
      z = rand(zone.minZ, zone.maxZ);
      const clear = this.targets.every((t) => !t.alive || Math.hypot(t.pos.x - x, t.pos.z - z) > 2.5);
      if (clear) break;
    }
    const target = new Character({ name: 'Target', team: 'enemy', maxHealth: 1, maxShield: 0 });
    target.teleport(x, 0, z, yawToward({ x, z }, this.player.pos));
    if (moving) target.setController(new StrafeController({ range: 3.5, minTime: 0.3, maxTime: 0.9, stopChance: 0.15 }));
    this._addTarget(target);
  }

  _spawnFlickOrb() {
    // Somewhere in a wide arc in front of the booth, far enough from the last
    // one that you have to flick to it. The arc is centred on the booth, not on
    // you: centring it on you put orbs inside or behind the far wall once you
    // walked downrange. Orbs a wall hides (from the booth or from you) are
    // re-rolled.
    const booth = { x: aimrange.spawn.x, y: this.player.eyeHeight, z: aimrange.spawn.z };
    const eye = { x: this.player.pos.x, y: this.player.pos.y + this.player.eyeHeight, z: this.player.pos.z };
    const world = this.ctx.world;
    let yaw = 0;
    let pitch = 0;
    let spot = null;
    for (let tries = 0; tries < 40; tries++) {
      yaw = rand(-40, 40) * DEG;
      pitch = rand(-4, 18) * DEG;
      const dist = rand(12, 16);
      const p = {
        x: booth.x - Math.sin(yaw) * Math.cos(pitch) * dist,
        y: booth.y + Math.sin(pitch) * dist,
        z: booth.z - Math.cos(yaw) * Math.cos(pitch) * dist,
      };
      spot ??= p; // fallback if nothing better turns up
      const farEnough = !this.lastFlick ||
        Math.hypot(yaw - this.lastFlick.yaw, pitch - this.lastFlick.pitch) > 15 * DEG;
      const visible = world.lineOfSight(booth, p, false) && world.lineOfSight(eye, p, false);
      // After 30 tries, give up on the distance rule but still insist on visibility.
      if (visible && (farEnough || tries >= 30)) {
        spot = p;
        break;
      }
    }
    this.lastFlick = { yaw, pitch };
    const orb = new Orb({ radius: 0.32, color: 0x4fd1ff });
    orb.place(spot.x, spot.y, spot.z);
    orb.spawnTime = this.ctx.time;
    this._addTarget(orb);
  }

  _spawnTrackingOrb() {
    const zone = aimrange.zones.tracking;
    const orb = new Orb({ radius: 0.45, color: 0xffcf3a, durable: true, motion: trackingMotion(zone) });
    orb.place(0, 2.2, zone.z);
    this._addTarget(orb);
  }

  _addTarget(t) {
    this.targets.push(t);
    this.add(t);
  }

  _removeTarget(t) {
    const i = this.targets.indexOf(t);
    if (i >= 0) this.targets.splice(i, 1);
    this.remove(t);
  }

  // ---- scoring ----

  _onHit(h) {
    if (h.attacker !== this.player || this.phase !== 'running') return;
    const s = this.stats;
    s.hits++;
    if (h.part === 'head') s.heads++;

    switch (this.drill.id) {
      case 'static':
      case 'moving':
        s.score += h.part === 'head' ? 150 : 100;
        this.removals.push({ target: h.victim, at: this.ctx.time + BODY_REMOVE_DELAY });
        this._fill();
        break;
      case 'flick': {
        const reaction = this.ctx.time - h.victim.spawnTime;
        s.reactions.push(reaction);
        s.score += 100 + Math.max(0, Math.min(100, Math.round((0.8 - reaction) * 125)));
        this.removals.push({ target: h.victim, at: this.ctx.time });
        this._fill();
        break;
      }
      case 'tracking':
        s.score += 10;
        break;
    }
  }

  _finish() {
    const s = this.stats;
    const key = bestKey(this.drill.id, this.weaponId);
    const bests = bestScores();
    const previous = bests[key] ?? null;
    const isBest = !previous || s.score > previous.score;
    const accuracy = s.shots ? s.hits / s.shots : 0;
    if (isBest && s.score > 0) {
      bests[key] = { score: s.score, accuracy, at: Date.now() };
      save(BEST_KEY, bests);
    }
    this.result = {
      drill: this.drill,
      weaponId: this.weaponId,
      score: s.score,
      shots: s.shots,
      hits: s.hits,
      accuracy,
      headRate: this.drill.heads && s.hits ? s.heads / s.hits : null,
      avgReaction: s.reactions.length ? s.reactions.reduce((a, b) => a + b, 0) / s.reactions.length : null,
      previousBest: previous?.score ?? null,
      isBest: isBest && s.score > 0,
    };
  }
}

/** Smooth, unpredictable drifting inside a vertical rectangle. */
function trackingMotion(zone) {
  let timer = 0;
  const want = { x: 0, y: 0 };
  return (orb, dt) => {
    timer -= dt;
    if (timer <= 0) {
      timer = rand(0.5, 1.4);
      const speed = rand(3, 6.5);
      const a = Math.random() * Math.PI * 2;
      want.x = Math.cos(a) * speed;
      want.y = Math.sin(a) * speed * 0.45;
    }
    const k = Math.min(1, dt * 6);
    orb.vel.x += (want.x - orb.vel.x) * k;
    orb.vel.y += (want.y - orb.vel.y) * k;
    orb.pos.x += orb.vel.x * dt;
    orb.pos.y += orb.vel.y * dt;
    // Bounce off the zone edges.
    if (orb.pos.x < zone.minX) { orb.pos.x = zone.minX; orb.vel.x = want.x = Math.abs(want.x); }
    if (orb.pos.x > zone.maxX) { orb.pos.x = zone.maxX; orb.vel.x = want.x = -Math.abs(want.x); }
    if (orb.pos.y < zone.minY) { orb.pos.y = zone.minY; orb.vel.y = want.y = Math.abs(want.y); }
    if (orb.pos.y > zone.maxY) { orb.pos.y = zone.maxY; orb.vel.y = want.y = -Math.abs(want.y); }
  };
}
