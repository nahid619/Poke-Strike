// Weapon logic: firing, recoil, spread, reloading, switching, and damage.
// Works the same for the player and (later) bots: it only reads an intent.
import { WEAPONS } from '../data/weapons.js';
import { MOVE, STATUS } from './character.js';

const DEG = Math.PI / 180;
const MAX_RANGE = 200;
// A drawn position further than this from the real one is stale (a teleport or
// respawn since the last frame), so the real position is used instead.
const MAX_SEEN_GAP = 1.5;
const TRIGGER_BUFFER = 0.1; // a semi-auto click this early still fires when ready
const SPRAY_RESET_DELAY = 0.25;
const SPRAY_DECAY = 18; // bullets of spray forgiven per second once you stop

class Weapon {
  constructor(def) {
    this.def = def;
    this.interval = 60 / def.rpm;
    this.refill();
  }

  refill() {
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserve;
  }
}

const lerp = (a, b, k) => a + (b - a) * k;

export class Loadout {
  /** `ids`: [primary, sidearm]; the primary can be null (nothing bought). */
  constructor(ids) {
    this.weapons = ids.map((id) => (id ? new Weapon(WEAPONS[id]) : null));
    this.index = Math.max(0, this.weapons.findIndex((w) => w));
    this.equipTimer = 0;
    this.reloadTimer = 0;
    this.nextFire = 0;
    this.lastShot = -Infinity;
    this.spray = 0;
    this.trigger = 0;
    this.lastSpread = 0;
    this.lastMoveSpread = 0;  // the part of the spread from moving or jumping
    this.lastFireSpread = 0;  // the part from spraying
    this.ads = false;         // wants to aim down sights / scope
    this.adsAmount = 0;       // 0 = hip, 1 = fully zoomed
    this.zoomLevel = 0;       // which zoom (sniper: 0 = 2.5x, 1 = 5x)
    this.rescopeAt = 0;       // after a sniper shot, no scoping until the bolt is back
    this.chamber = 0;         // sniper bolt cycling after a shot (visual)
    this.enabled = true;       // false = can't fire (e.g. drill countdown)
    this.infiniteAmmo = false; // aim trainer: never run dry
  }

  get current() {
    return this.weapons[this.index];
  }

  get reloading() {
    return this.reloadTimer > 0;
  }

  get reloadProgress() {
    return this.reloading ? 1 - this.reloadTimer / this.current.def.reloadTime : 0;
  }

  get equipProgress() {
    const t = this.current.def.equipTime;
    return t > 0 ? 1 - this.equipTimer / t : 1;
  }

  /** The zoom levels of the current weapon (empty if it has none). */
  get zoomLevels() {
    const a = this.current.def.ads;
    return a ? a.zoomLevels ?? [a.zoom] : [];
  }

  /** Magnification of the selected zoom level (what you get once fully zoomed). */
  get zoomLevelValue() {
    const levels = this.zoomLevels;
    return levels.length ? levels[Math.min(this.zoomLevel, levels.length - 1)] : 1;
  }

  /** How zoomed in the current weapon is right now (1 = no zoom). */
  get zoom() {
    return this.current.def.ads ? lerp(1, this.zoomLevelValue, this.adsAmount) : 1;
  }

  _unzoom() {
    this.ads = false;
    this.zoomLevel = 0;
  }

  /** Fully zoomed in. */
  get scoped() {
    return !!this.current.def.ads && this.adsAmount >= 0.999;
  }

  /** How much the zoom's accuracy and handling apply right now (0..1). */
  get adsWeight() {
    const a = this.current.def.ads;
    if (!a) return 0;
    return a.requireFull ? (this.adsAmount >= 0.999 ? 1 : 0) : this.adsAmount;
  }

  /** Running speed multiplier from the weapon in hand (and zooming). */
  get moveMultiplier() {
    const def = this.current.def;
    const a = def.ads;
    return (def.moveMult ?? 1) * (a ? lerp(1, a.moveMult ?? 1, this.adsAmount) : 1);
  }

  get chamberProgress() {
    const t = this.current.def.chamberTime;
    return t && this.chamber > 0 ? 1 - this.chamber / t : 0;
  }

  refill() {
    for (const w of this.weapons) w.refill();
    this.reloadTimer = 0;
    this.equipTimer = 0;
    this.spray = 0;
    this._unzoom();
    this.adsAmount = 0;
    this.chamber = 0;
    this.rescopeAt = 0;
  }

  /** Swap the primary weapon (slot 1), e.g. from the buy menu. */
  setPrimary(id, owner = null, ctx = null) {
    if (!WEAPONS[id] || this.weapons[0]?.def.id === id) return false;
    return this.setSlot(0, id, owner, ctx);
  }

  /**
   * Put a weapon in a slot (0 = primary, 1 = sidearm), or empty the primary
   * slot with null. Buying a gun takes it out right away, like Valorant.
   */
  setSlot(slot, id, owner = null, ctx = null) {
    if (id && !WEAPONS[id]) return false;
    this.weapons[slot] = id ? new Weapon(WEAPONS[id]) : null;
    if (!id) {
      if (this.index === slot) this.index = this.weapons.findIndex((w) => w);
      this.equipTimer = this.current?.def.equipTime ?? 0;
      return true;
    }
    this.index = slot;
    {
      this.reloadTimer = 0;
      this.equipTimer = this.current.def.equipTime;
      this.spray = 0;
      this.trigger = 0;
      this._unzoom();
      this.adsAmount = 0;
      this.chamber = 0;
      this.rescopeAt = 0;
      if (ctx) ctx.events.emit('equip', { owner, weapon: this.current.def });
    }
    return true;
  }

  /** Full magazines and reserves (a new round). */
  refill() {
    for (const w of this.weapons) {
      if (!w) continue;
      w.ammo = w.def.magSize;
      w.reserve = w.def.reserve;
    }
    this.reloadTimer = 0;
  }

  switchTo(index, owner, ctx) {
    if (index === this.index || !this.weapons[index]) return;
    this.index = index;
    this.reloadTimer = 0; // switching cancels a reload
    this.equipTimer = this.current.def.equipTime;
    this.spray = 0;
    this.trigger = 0;
    this._unzoom();
    this.adsAmount = 0;
    this.chamber = 0;
    this.rescopeAt = 0;
    ctx.events.emit('equip', { owner, weapon: this.current.def });
  }

  startReload(owner, ctx) {
    const w = this.current;
    if (this.reloading || w.ammo >= w.def.magSize || w.reserve <= 0) return;
    this.reloadTimer = w.def.reloadTime;
    this._unzoom(); // reloading takes you out of the scope
    ctx.events.emit('reloadStart', { owner, weapon: w.def });
  }

  /** The spread values in use right now: hip fire blended toward zoomed. */
  _spreadDef() {
    const def = this.current.def;
    const s = def.spread;
    const a = def.ads;
    const k = this.adsWeight;
    if (!a || k <= 0) return s;
    const z = a.spread ?? Object.fromEntries(Object.entries(s).map(([key, v]) =>
      [key, key === 'firstAccurateShots' ? v : v * (a.spreadMult ?? 1)]));
    const out = {};
    for (const key of Object.keys(s)) out[key] = key === 'firstAccurateShots' ? s[key] : lerp(s[key], z[key] ?? s[key], k);
    return out;
  }

  /** Current bullet spread (half-angle, degrees) for this owner. */
  spreadFor(owner) {
    const s = this._spreadDef();
    const speed = Math.hypot(owner.vel.x, owner.vel.z);
    const moving = Math.min(Math.max((speed - 0.8) / (MOVE.runSpeed - 0.8), 0), 1);
    const crouch = 1 - 0.2 * (owner.crouchAmt ?? 0); // crouching steadies your aim a little
    let move = moving * s.run;
    if (!owner.onGround) move += s.air;
    if (owner.stunned) move += STATUS.stunSpread;
    const sprayShots = Math.max(0, this.spray - (s.firstAccurateShots - 1));
    const fire = Math.min(s.maxSpray, sprayShots * s.perShot) * crouch;
    this.lastMoveSpread = move;
    this.lastFireSpread = fire;
    return s.base * crouch + move + fire;
  }

  tick(dt, intent, owner, ctx) {
    // Switching
    if (intent.switchTo != null) this.switchTo(intent.switchTo, owner, ctx);
    else if (intent.switchDelta) {
      const n = this.weapons.length;
      this.switchTo((this.index + intent.switchDelta + n) % n, owner, ctx);
    }
    if (this.equipTimer > 0) this.equipTimer = Math.max(0, this.equipTimer - dt);
    if (this.chamber > 0) this.chamber = Math.max(0, this.chamber - dt);

    // Reloading
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this._finishReload(owner, ctx);
    }
    if (intent.reload) this.startReload(owner, ctx);

    // Aim down sights. Toggle: each right click goes to the next zoom level,
    // and past the last one zooms out (Operator: 2.5x, 5x, out). Hold: zoomed
    // to the first level while held.
    const w = this.current;
    const def = w.def;
    const levels = this.zoomLevels;
    const canZoom = !!def.ads && !this.reloading && this.equipTimer <= 0 && !owner.asleep && ctx.time >= this.rescopeAt;
    if (intent.adsHold) {
      this.ads = !!intent.adsHeld;
      if (!this.ads) this.zoomLevel = 0;
    } else if (intent.adsPressed && canZoom) {
      if (!this.ads) {
        this.ads = true;
        this.zoomLevel = 0;
      } else if (this.zoomLevel < levels.length - 1) {
        this.zoomLevel++;
      } else {
        this._unzoom();
      }
    }
    if (!canZoom && !intent.adsHold) this._unzoom();
    const wantZoom = this.ads && canZoom;
    if (def.ads) {
      const step = dt / def.ads.time;
      this.adsAmount = wantZoom ? Math.min(1, this.adsAmount + step) : Math.max(0, this.adsAmount - step * 1.4);
    } else {
      this.adsAmount = 0;
    }

    // Trigger
    if (intent.firePressed) this.trigger = TRIGGER_BUFFER;
    const wantsFire = this.enabled && (def.mode === 'auto' ? intent.fireHeld || this.trigger > 0 : this.trigger > 0);
    this.trigger = Math.max(0, this.trigger - dt);

    const ready = this.equipTimer <= 0 && !this.reloading && ctx.time >= this.nextFire;
    if (wantsFire && ready) {
      if (w.ammo > 0) {
        this._fire(owner, ctx);
        this.trigger = 0;
      } else {
        if (intent.firePressed) ctx.events.emit('dryFire', { owner, weapon: def });
        this.trigger = 0;
        this.startReload(owner, ctx);
      }
    }

    // Recovery once you stop shooting. The camera kick springs back quickly.
    const idle = ctx.time - this.lastShot;
    if (idle > w.interval + 0.03) {
      const k = Math.exp(-dt * def.recoil.recover);
      owner.recoilPitch *= k;
      owner.recoilYaw *= k;
    }
    const pk = Math.exp(-dt * 16);
    owner.punchPitch *= pk;
    owner.punchYaw *= pk;
    if (idle > SPRAY_RESET_DELAY) this.spray = Math.max(0, this.spray - dt * SPRAY_DECAY);
    this.lastSpread = this.spreadFor(owner);
  }

  _finishReload(owner, ctx) {
    this.reloadTimer = 0;
    const w = this.current;
    const take = Math.min(w.def.magSize - w.ammo, w.reserve);
    w.ammo += take;
    w.reserve -= take;
    ctx.events.emit('reloadEnd', { owner, weapon: w.def });
  }

  _fire(owner, ctx) {
    const w = this.current;
    const def = w.def;
    if (!this.infiniteAmmo) w.ammo--;
    const k = this.adsWeight;

    // Keep a steady fire rate even though ticks are 1/60 s apart. Zooming
    // slows the fire rate a little, like Valorant.
    const interval = w.interval / lerp(1, def.ads?.fireRateMult ?? 1, k);
    this.nextFire = ctx.time - this.nextFire < interval ? this.nextFire + interval : ctx.time + interval;
    this.lastShot = ctx.time;
    if (def.chamberTime) this.chamber = def.chamberTime;
    // The Operator kicks you out of the scope with every shot.
    const unscope = def.ads?.unscopeOnFire && this.adsAmount > 0;

    // Aim direction = where you aim plus the spray pattern (the camera only
    // follows part of it), plus random spread.
    const spread = this.spreadFor(owner) * DEG;
    // Fire from the eye, where the camera is. The drawn position already
    // includes the smoothing after stepping up a ledge (stepOffset).
    const at = shotPosition(owner, owner);
    const lift = at === owner.pos ? owner.stepOffset : 0;
    const origin = { x: at.x, y: at.y + owner.eyeHeight + lift, z: at.z };

    // One ray per bullet; a shotgun fires several pellets in a cone, and
    // their damage adds up on each target (the best body part counts).
    const pellets = def.pellets ?? 1;
    const rank = { legs: 0, body: 1, head: 2 };
    const hits = [];
    const totals = new Map();
    for (let p = 0; p < pellets; p++) {
      const dir = directionFromAngles(owner.aimYaw, owner.aimPitch);
      applySpread(dir, spread);
      if (def.pelletSpread) applySpread(dir, def.pelletSpread * DEG);
      const hit = traceShot(origin, dir, owner, ctx);
      hits.push({ dir, hit });
      if (!hit.character) continue;
      const damage = def.damage[hit.part] * falloffMultiplier(def, hit.t) * (owner.damageScale ?? 1);
      const t = totals.get(hit.character) ?? { damage: 0, part: hit.part, point: hit.point };
      t.damage += damage;
      if (rank[hit.part] > rank[t.part]) {
        t.part = hit.part;
        t.point = hit.point;
      }
      totals.set(hit.character, t);
    }
    for (const [victim, t] of totals) {
      const damage = Math.round(t.damage);
      const result = victim.applyDamage(damage);
      const info = { attacker: owner, victim, part: t.part, damage, dealt: result.dealt, weapon: def, point: t.point, pellets: pellets > 1 };
      ctx.events.emit('hit', info);
      if (result.killed) ctx.events.emit('kill', info);
    }
    const shot = {
      owner, weapon: def, origin, dir: hits[0].dir, hit: hits[0].hit, scoped: k > 0.5,
      pellets: hits.slice(1).map((h) => h.hit), // the other pellets, for tracers and impacts
    };
    ctx.events.emit('shot', shot);

    this._kick(owner, def, lerp(1, def.ads?.recoilMult ?? 1, k));
    this.spray += 1;
    if (unscope) {
      this._unzoom();
      this.adsAmount = 0;
      this.rescopeAt = ctx.time + (def.chamberTime ?? interval * 0.75);
    }
  }

  _kick(owner, def, mult = 1) {
    const r = def.recoil;
    const i = Math.floor(this.spray);
    const vertical = r.vertical[Math.min(i, r.vertical.length - 1)] * mult;
    let horizontal = (Math.random() * 2 - 1) * r.jitter * mult;
    if (r.swayStart != null && i >= r.swayStart) {
      const side = Math.floor((i - r.swayStart) / r.swayPeriod) % 2 === 0 ? 1 : -1;
      horizontal += side * r.swayAmount * mult;
    }
    owner.recoilPitch = Math.min(owner.recoilPitch + vertical * DEG, r.maxPitch * DEG);
    owner.recoilYaw = Math.max(-r.maxYaw * DEG, Math.min(r.maxYaw * DEG, owner.recoilYaw + horizontal * DEG));
    // Camera-only kick: the screen jolts and settles, the aim point doesn't move.
    const punch = (r.punch ?? 0) * DEG;
    owner.punchPitch += punch;
    owner.punchYaw += (Math.random() * 2 - 1) * punch * 0.25;
  }
}

export function directionFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Rotate `dir` by a random angle inside a cone of half-angle `spread` (radians). */
function applySpread(dir, spread) {
  if (spread <= 0) return;
  // Two vectors perpendicular to dir.
  let ux = -dir.z, uy = 0, uz = dir.x;
  let len = Math.hypot(ux, uz);
  if (len < 1e-6) { ux = 1; uz = 0; len = 1; }
  ux /= len; uz /= len;
  const vx = dir.y * uz - dir.z * uy;
  const vy = dir.z * ux - dir.x * uz;
  const vz = dir.x * uy - dir.y * ux;

  const r = Math.tan(spread) * Math.sqrt(Math.random()); // uniform over the disc
  const a = Math.random() * Math.PI * 2;
  const ox = Math.cos(a) * r;
  const oy = Math.sin(a) * r;
  dir.x += ux * ox + vx * oy;
  dir.y += uy * ox + vy * oy;
  dir.z += uz * ox + vz * oy;
  const n = Math.hypot(dir.x, dir.y, dir.z);
  dir.x /= n; dir.y /= n; dir.z /= n;
}

function falloffMultiplier(def, distance) {
  let mult = 1;
  for (const step of def.falloff) if (distance >= step.from) mult = step.mult;
  return mult;
}

/**
 * Where `c` should be for a shot fired by `shooter`. A human aims at what is on
 * screen, which is drawn up to one tick behind the simulation, so their shots
 * are tested against the drawn position. Bots see the true positions.
 */
export function shotPosition(c, shooter) {
  if (!shooter.controller?.isHuman || !c.seenPos) return c.pos;
  return c.seenPos.distanceTo(c.pos) <= MAX_SEEN_GAP ? c.seenPos : c.pos;
}

/**
 * Nearest thing a bullet hits: the map or a character.
 * Bullets pass through teammates (no friendly fire on bullets).
 */
export function traceShot(origin, dir, owner, ctx) {
  const wall = ctx.world.raycast(origin, dir, MAX_RANGE);
  const hit = {
    t: wall ? wall.t : MAX_RANGE,
    normal: wall ? { x: wall.nx, y: wall.ny, z: wall.nz } : null,
    character: null,
    part: null,
    point: null,
  };
  for (const c of ctx.characters) {
    if (c === owner || !c.alive || c.team === owner.team) continue;
    const h = c.raycast(origin, dir, hit.t, shotPosition(c, owner));
    if (h && h.t < hit.t) {
      hit.t = h.t;
      hit.character = c;
      hit.part = h.part;
      hit.normal = null;
    }
  }
  hit.point = { x: origin.x + dir.x * hit.t, y: origin.y + dir.y * hit.t, z: origin.z + dir.z * hit.t };
  hit.wall = !hit.character && !!wall;
  return hit;
}
