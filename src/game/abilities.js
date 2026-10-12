// Ability system. An AbilityKit holds an agent's Q and E slots and cooldowns.
// Each ability's `type` picks one of the reusable EFFECTS below; the numbers
// come from the agent data. Works for the player now and bots later.
import { directionFromAngles } from './weapons.js';

const DEG = Math.PI / 180;

class Slot {
  constructor(def) {
    this.def = def;
    this.cooldown = 0;
    this.marker = null; // Shadow Mark: placed marker waiting for the teleport
  }
}

export class AbilityKit {
  constructor(agent) {
    this.agent = agent;
    this.slots = { q: new Slot(agent.abilities.q), e: new Slot(agent.abilities.e) };
    this.cooldownScale = 1; // the test range shortens cooldowns
  }

  reset() {
    for (const s of Object.values(this.slots)) s.cooldown = 0;
    this.clearMarkers();
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
      s.cooldown = Math.max(0, s.cooldown - dt);
      // An unused marker expires and the cooldown starts.
      if (s.marker && ctx.time >= s.marker.until) {
        ctx.events.emit('markerEnd', { owner, marker: s.marker });
        s.marker = null;
        s.cooldown = s.def.cooldown * this.cooldownScale;
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
    if (slot.cooldown > 0) {
      ctx.events.emit('abilityDenied', { owner, key, ability: def, reason: 'cooldown' });
      return false;
    }
    const result = EFFECTS[def.type](owner, def, ctx, slot);
    if (result === DENIED) {
      ctx.events.emit('abilityDenied', { owner, key, ability: def, reason: 'not now' });
      return false;
    }
    ctx.events.emit('abilityCast', { owner, key, ability: def, ...(result ?? {}) });
    if (!result?.armed) slot.cooldown = def.cooldown * this.cooldownScale;
    return true;
  }
}

const DENIED = Symbol('denied');

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
};
