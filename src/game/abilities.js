// Ability system. An AbilityKit holds an agent's Q and E slots and cooldowns,
// and the ultimate on X. Ultimates have no cooldown: they cost ultimate
// points (owner.ultPoints), earned from kills, deaths, planting or defusing,
// and ultimate orbs (see orbs.js); using one spends them all.
// Each ability's `type` picks one of the reusable EFFECTS below; the numbers
// come from the agent data. Works for the player now and bots later.
import { directionFromAngles } from './weapons.js';

const DEG = Math.PI / 180;

class Slot {
  constructor(def) {
    this.def = def;
    this.max = def.charges ?? 1;
    this.ult = def.ult ?? 0; // ultimate: points needed (0 = a normal ability)
    this.charges = this.max;
    this.cooldown = 0;  // time until the next charge comes back
    this.marker = null; // Shadow Mark: placed marker waiting for the teleport
  }

  /** Ready to use: at least one charge. */
  get ready() {
    return this.charges > 0;
  }
}

export class AbilityKit {
  constructor(agent) {
    this.agent = agent;
    this.slots = { q: new Slot(agent.abilities.q), e: new Slot(agent.abilities.e) };
    if (agent.abilities.x) this.slots.x = new Slot(agent.abilities.x);
    this.cooldownScale = 1; // the test range shortens cooldowns
  }

  reset() {
    for (const s of Object.values(this.slots)) {
      s.cooldown = 0;
      s.charges = s.max;
    }
    this.clearMarkers();
  }

  /** Use up one charge and start recharging it. */
  _spend(slot, owner) {
    if (slot.ult) {
      owner.ultPoints = 0;
      return;
    }
    slot.charges = Math.max(0, slot.charges - 1);
    if (slot.cooldown <= 0) slot.cooldown = slot.def.cooldown * this.cooldownScale;
  }

  /** Remove any placed Shadow Mark. Its visual removes itself. */
  clearMarkers() {
    for (const s of Object.values(this.slots)) {
      if (s.marker) s.marker.dead = true;
      s.marker = null;
    }
  }

  tick(dt, intent, owner, ctx) {
    for (const [key, s] of Object.entries(this.slots)) {
      // Charges come back one at a time (ultimates use points instead).
      if (s.ult) {
        if (intent.abilityX) this.use(key, owner, ctx);
        continue;
      }
      if (s.charges < s.max) {
        s.cooldown -= dt;
        if (s.cooldown <= 0) {
          s.charges++;
          s.cooldown = s.charges < s.max ? s.def.cooldown * this.cooldownScale : 0;
        }
      } else {
        s.cooldown = 0;
      }
      // An unused marker expires and the cooldown starts.
      if (s.marker && ctx.time >= s.marker.until) {
        ctx.events.emit('markerEnd', { owner, marker: s.marker });
        s.marker = null;
        this._spend(s, owner);
      }
      const pressed = key === 'q' ? intent.abilityQ : intent.abilityE;
      if (pressed) this.use(key, owner, ctx);
    }
  }

  use(key, owner, ctx) {
    const slot = this.slots[key];
    const def = slot.def;
    if (!owner.canUseAbilities) {
      ctx.events.emit('abilityDenied', { owner, key, ability: def, reason: owner.asleep ? 'asleep' : 'stunned' });
      return false;
    }
    if (!slot.ready || (slot.ult && (owner.ultPoints ?? 0) < slot.ult)) {
      ctx.events.emit('abilityDenied', { owner, key, ability: def, reason: slot.ult ? 'ultimate not ready' : 'cooldown' });
      return false;
    }
    const result = EFFECTS[def.type](owner, def, ctx, slot);
    if (result === DENIED) {
      ctx.events.emit('abilityDenied', { owner, key, ability: def, reason: 'not now' });
      return false;
    }
    ctx.events.emit('abilityCast', { owner, key, ability: def, ...(result ?? {}) });
    if (!result?.armed) this._spend(slot, owner);
    return true;
  }
}

const DENIED = Symbol('denied');

/** Add ultimate points (capped at what the ultimate costs). Returns true if it just became ready. */
export function addUltPoints(c, n = 1) {
  const cost = c.abilities?.slots.x?.ult;
  if (!cost) return false;
  const before = c.ultPoints ?? 0;
  c.ultPoints = Math.min(cost, before + n);
  return before < cost && c.ultPoints >= cost;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const chest = (c) => ({ x: c.pos.x, y: c.pos.y + 1.1, z: c.pos.z });
const eye = (c) => ({ x: c.pos.x, y: c.pos.y + c.eyeHeight, z: c.pos.z });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Living enemies that can be affected by abilities. */
function enemiesOf(owner, ctx) {
  return ctx.characters.filter((c) => c !== owner && c.alive && c.team !== owner.team && c.applyStatus);
}

/** Ability damage goes through the same events as bullets (hit markers, kill feed). */
export function dealDamage(attacker, victim, damage, abilityName, ctx) {
  damage = Math.round(damage * (attacker?.damageScale ?? 1));
  const result = victim.applyDamage(damage);
  const info = { attacker, victim, part: 'body', damage, dealt: result.dealt, ability: abilityName, point: chest(victim) };
  ctx.events.emit('hit', info);
  if (result.killed) ctx.events.emit('kill', info);
  return result;
}

/** Living teammates (including yourself) that abilities can help. */
function alliesOf(owner, ctx) {
  return ctx.characters.filter((c) => c.alive && c.team === owner.team && c.applyStatus);
}

/** Floor height under a point (or null if there is none within `depth`). */
function floorBelow(world, p, depth = 8) {
  const hit = world.raycast({ x: p.x, y: p.y + 0.05, z: p.z }, { x: 0, y: -1, z: 0 }, depth);
  return hit ? p.y + 0.05 - hit.t : null;
}

function forwardFlat(owner) {
  return { x: -Math.sin(owner.yaw), z: -Math.cos(owner.yaw) };
}

// ---------------------------------------------------------------------------
// Effects. Each returns extra event data, { armed: true } to skip the
// cooldown (first press of a two-step ability), or DENIED.
// ---------------------------------------------------------------------------

export const EFFECTS = {
  /** Fast flat dash in the movement direction (or forward). Optional fire trail. */
  dash(owner, a) {
    const w = owner.wishDir;
    const dir = Math.hypot(w.x, w.z) > 0.1 ? w : forwardFlat(owner);
    const from = owner.pos.clone();
    const trail = a.trail ? { ...a.trail, team: owner.team, owner } : null;
    owner.startDash(dir.x, dir.z, a.speed, a.duration, trail);
    return { from, dir: { ...dir } };
  },

  /** Instant teleport forward, stopping before walls. */
  blink(owner, a, ctx) {
    const f = forwardFlat(owner);
    const world = ctx.world;
    const r = owner.radius - 0.01;
    const from = owner.pos.clone();
    let best = { x: from.x, y: from.y, z: from.z };
    for (let d = 0.25; d <= a.distance + 1e-6; d += 0.25) {
      const x = from.x + f.x * d;
      const z = from.z + f.z * d;
      let y = best.y;
      if (world.overlapsCylinder(x, y, z, r, owner.height)) {
        y = best.y + owner.stepHeight; // allow stepping up small ledges
        if (world.overlapsCylinder(x, y, z, r, owner.height)) break;
      }
      best = { x, y, z };
    }
    if (Math.hypot(best.x - from.x, best.z - from.z) < 0.5) return DENIED; // wall right in front
    owner.pos.set(best.x, best.y, best.z);
    owner.prevPos.copy(owner.pos);
    return { from, to: owner.pos.clone() };
  },

  /** First press: place a marker. Second press: teleport back to it. */
  marker(owner, a, ctx, slot) {
    if (!slot.marker) {
      slot.marker = { x: owner.pos.x, y: owner.pos.y, z: owner.pos.z, until: ctx.time + a.duration };
      ctx.events.emit('markerPlaced', { owner, marker: slot.marker });
      return { armed: true, placed: true };
    }
    const from = owner.pos.clone();
    const m = slot.marker;
    owner.pos.set(m.x, m.y, m.z);
    owner.prevPos.copy(owner.pos);
    owner.vel.set(0, 0, 0);
    ctx.events.emit('markerEnd', { owner, marker: m });
    slot.marker = null;
    return { from, to: owner.pos.clone(), teleported: true };
  },

  shield(owner, a) {
    owner.addOvershield(a.amount, a.duration);
    return {};
  },

  heal(owner, a) {
    if (owner.health >= owner.maxHealth) return DENIED;
    owner.startHeal(a.amount, a.duration);
    return {};
  },

  /** Area effect around the caster: status, damage (with falloff), knockback. */
  nova(owner, a, ctx) {
    const center = chest(owner);
    const hits = [];
    for (const c of enemiesOf(owner, ctx)) {
      const p = chest(c);
      const d = dist(center, p);
      if (d > a.radius) continue;
      if (!a.throughWalls && !ctx.world.lineOfSight(eye(owner), p, false)) continue;
      if (a.status) c.applyStatus(a.status, a.statusDuration);
      if (a.damage) {
        const k = d / a.radius;
        const dmg = Math.round(a.damage + ((a.minDamage ?? a.damage) - a.damage) * k);
        dealDamage(owner, c, dmg, a.name, ctx);
      }
      if (a.knockback && c.alive) {
        const nx = (p.x - center.x) / (Math.hypot(p.x - center.x, p.z - center.z) || 1);
        const nz = (p.z - center.z) / (Math.hypot(p.x - center.x, p.z - center.z) || 1);
        c.vel.x += nx * a.knockback;
        c.vel.z += nz * a.knockback;
        c.vel.y = Math.max(c.vel.y, 3.5);
        c.onGround = false;
      }
      hits.push(c);
    }
    return { center, hits };
  },

  /** Cone in front of the caster: damages enemies inside it that are in view. */
  cone(owner, a, ctx) {
    const o = eye(owner);
    const dir = directionFromAngles(owner.viewYaw, owner.viewPitch);
    const cosLimit = Math.cos(a.angle * DEG);
    const hits = [];
    for (const c of enemiesOf(owner, ctx)) {
      const p = chest(c);
      const d = dist(o, p);
      if (d > a.range || d < 1e-3) continue;
      const cos = ((p.x - o.x) * dir.x + (p.y - o.y) * dir.y + (p.z - o.z) * dir.z) / d;
      if (cos < cosLimit) continue;
      if (!ctx.world.lineOfSight(o, p, false)) continue;
      dealDamage(owner, c, a.damage, a.name, ctx);
      hits.push(c);
    }
    return { origin: o, dir, hits };
  },

  /** Smoke cloud where you aim (stops short of walls). */
  smoke(owner, a, ctx) {
    const o = eye(owner);
    const dir = directionFromAngles(owner.viewYaw, owner.viewPitch);
    const hit = ctx.world.raycast(o, dir, a.range);
    const t = hit ? Math.max(0, hit.t - 0.6) : a.range;
    const center = {
      x: o.x + dir.x * t,
      y: Math.min(Math.max(o.y + dir.y * t, 0.8), 6),
      z: o.z + dir.z * t,
    };
    const zone = ctx.zones.addSmoke({ ...center, radius: a.radius, duration: a.duration, team: owner.team }, ctx.time);
    return { zone };
  },

  /** Throw something where you aim. It sets off its payload on impact or when the fuse ends. */
  throw(owner, a, ctx) {
    const o = eye(owner);
    const dir = directionFromAngles(owner.viewYaw, owner.viewPitch);
    // Start a little in front of the face, but never inside a wall.
    const wall = ctx.world.raycast(o, dir, 0.6);
    const lead = wall ? Math.max(0, wall.t - 0.15) : 0.5;
    const projectile = ctx.zones.addProjectile({
      owner, team: owner.team, name: a.name, color: a.color,
      x: o.x + dir.x * lead, y: o.y - 0.1 + dir.y * lead, z: o.z + dir.z * lead,
      vx: dir.x * a.speed, vy: dir.y * a.speed, vz: dir.z * a.speed,
      gravity: a.gravity ?? 0, fuse: a.fuse ?? 2, bounce: !!a.bounce, stick: !!a.stick,
      payload: a.payload,
    }, ctx.time);
    return { projectile, dir };
  },

  /** Place a trap on the floor where you aim. */
  trap(owner, a, ctx) {
    const world = ctx.world;
    const o = eye(owner);
    const dir = directionFromAngles(owner.viewYaw, owner.viewPitch);
    const hit = world.raycast(o, dir, a.range);
    let p;
    if (hit && hit.ny > 0.6) {
      p = { x: o.x + dir.x * hit.t, y: o.y + dir.y * hit.t, z: o.z + dir.z * hit.t };
    } else {
      // Aimed at a wall or into the air: drop it to the floor just before that point.
      const t = hit ? Math.max(0, hit.t - 0.4) : a.range;
      const q = { x: o.x + dir.x * t, y: o.y + dir.y * t, z: o.z + dir.z * t };
      const y = floorBelow(world, q, 10);
      if (y === null) return DENIED;
      p = { x: q.x, y, z: q.z };
    }
    const mine = ctx.zones.traps.filter((t) => t.owner === owner);
    if (mine.length >= (a.maxActive ?? 2)) ctx.zones.remove(mine[0]); // the oldest one goes
    const zone = ctx.zones.addTrap({
      ...p, owner, team: owner.team, name: a.name, radius: a.radius, armAt: ctx.time + (a.armTime ?? 1),
      slow: a.slow, slowDuration: a.slowDuration, revealDuration: a.revealDuration, color: a.color,
    }, ctx.time);
    return { zone, point: p };
  },

  /** Help yourself and nearby teammates you can see: shield and/or healing. */
  aura(owner, a, ctx) {
    const center = chest(owner);
    const helped = [];
    for (const c of alliesOf(owner, ctx)) {
      const p = chest(c);
      if (c !== owner && (dist(center, p) > a.radius || !ctx.world.lineOfSight(center, p, false))) continue;
      helped.push(c);
    }
    if (a.heal && !a.shield && !helped.some((c) => c.health < c.maxHealth)) return DENIED; // nobody hurt
    for (const c of helped) {
      if (a.shield) c.addOvershield(a.shield, a.shieldDuration);
      if (a.heal && c.health < c.maxHealth) c.startHeal(a.heal, a.healDuration);
    }
    return { center, helped };
  },
};

// ---------------------------------------------------------------------------
// Payloads: what a thrown ability does when it goes off at `point`.
// Each returns the characters it affected.
// ---------------------------------------------------------------------------

const FLASH_FULL = Math.cos(55 * DEG);  // looking within 55 degrees: full blind
const FLASH_HALF = Math.cos(100 * DEG); // within 100 degrees: a short blind

export const PAYLOADS = {
  flash(p, point, ctx) {
    const a = p.payload;
    const hits = [];
    for (const c of enemiesOf(p.owner, ctx)) {
      const e = eye(c);
      const d = dist(e, point);
      if (d > (a.range ?? 40) || d < 1e-3) continue;
      if (!ctx.world.lineOfSight(e, point, true)) continue; // walls and smoke shield you
      const look = directionFromAngles(c.viewYaw ?? c.yaw, c.viewPitch ?? c.pitch);
      const cos = ((point.x - e.x) * look.x + (point.y - e.y) * look.y + (point.z - e.z) * look.z) / d;
      const k = cos >= FLASH_FULL ? 1 : cos >= FLASH_HALF ? 0.35 : 0;
      if (k <= 0) continue;
      c.applyStatus('blind', a.duration * k);
      hits.push(c);
    }
    return hits;
  },

  fire(p, point, ctx) {
    const a = p.payload;
    const y = floorBelow(ctx.world, point, 6) ?? point.y;
    ctx.zones.addFire({
      x: point.x, y, z: point.z, radius: a.radius, dps: a.dps, duration: a.duration,
      team: p.team, owner: p.owner, name: p.name,
    }, ctx.time);
    return [];
  },

  concuss(p, point, ctx) {
    return statusBurst(p, point, ctx, 'stun');
  },

  sleep(p, point, ctx) {
    return statusBurst(p, point, ctx, 'sleep');
  },

  recon(p, point, ctx) {
    const a = p.payload;
    ctx.zones.addRecon({
      ...point, owner: p.owner, team: p.team, name: p.name, radius: a.radius,
      pulses: a.pulses ?? 2, interval: a.interval ?? 1.4, reveal: a.reveal ?? 3,
    }, ctx.time);
    return [];
  },
};

function statusBurst(p, point, ctx, status) {
  const a = p.payload;
  const hits = [];
  for (const c of enemiesOf(p.owner, ctx)) {
    const q = chest(c);
    if (dist(point, q) > a.radius) continue;
    if (!ctx.world.lineOfSight(point, q, false)) continue;
    c.applyStatus(status, a.duration);
    hits.push(c);
  }
  return hits;
}
