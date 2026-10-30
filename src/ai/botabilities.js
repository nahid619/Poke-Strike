// When bots use their agent's abilities. Each effect type has a rule for when
// it helps; the difficulty's `abilityUse` decides how often a bot actually
// follows through. One ability per decision, a few decisions per second.
import { STATE } from './bot.js';

const CHECK_EVERY = 0.35;

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/** Point the bot's movement input in a world direction (for dashes). */
function moveToward(c, intent, dx, dz) {
  const len = Math.hypot(dx, dz) || 1;
  const mx = dx / len;
  const mz = dz / len;
  const sin = Math.sin(c.yaw);
  const cos = Math.cos(c.yaw);
  intent.forward = mx * -sin + mz * -cos;
  intent.right = mx * cos + mz * -sin;
}

/** Set yaw and pitch so the camera (which abilities use) points this way. */
function look(c, yaw, pitch) {
  c.yaw = yaw - (c.viewYaw - c.yaw);
  c.pitch = pitch - (c.viewPitch - c.pitch);
}

/** Aim the bot's view at a point at height y (smokes, traps, flashes). */
function aimAt(c, p, y = 0.5) {
  look(c, yawTo(c.pos, p), Math.atan2(y - (c.pos.y + c.eyeHeight), Math.max(0.5, dist2d(c.pos, p))));
}

/** Aim a thrown ability so its arc lands on p (the flatter of the two arcs). */
function aimThrow(c, p, a, lift = 0.3) {
  const g = a.gravity ?? 0;
  const v = a.speed;
  const d = Math.max(0.5, dist2d(c.pos, p));
  const h = (p.y ?? c.pos.y) + lift - (c.pos.y + c.eyeHeight - 0.1);
  let pitch;
  if (g <= 0) {
    pitch = Math.atan2(h, d);
  } else {
    const v2 = v * v;
    const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
    pitch = disc >= 0 ? Math.atan((v2 - Math.sqrt(disc)) / (g * d)) : Math.PI / 4;
  }
  look(c, yawTo(c.pos, p), pitch);
}

/** Furthest a throw can reach on flat ground (for range checks). */
function throwRange(a) {
  const g = a.gravity ?? 0;
  if (g <= 0) return a.speed * (a.fuse ?? 1);
  return Math.min((a.speed * a.speed) / g, a.speed * (a.fuse ?? 2));
}

function visibleEnemiesWithin(ctl, c, radius) {
  const world = ctl.ctx.world;
  const eye = { x: c.pos.x, y: c.pos.y + c.eyeHeight, z: c.pos.z };
  let n = 0;
  for (const e of ctl.ctx.characters) {
    if (!e.isCharacter || !e.alive || e.team === c.team) continue;
    if (dist2d(e.pos, c.pos) > radius) continue;
    if (world.lineOfSight(eye, { x: e.pos.x, y: e.pos.y + 1.1, z: e.pos.z }, false)) n++;
  }
  return n;
}

function alliesWithin(ctl, c, radius, test = () => true) {
  return ctl.ctx.characters.filter((m) => m !== c && m.isCharacter && m.alive && m.team === c.team &&
    dist2d(m.pos, c.pos) <= radius && test(m)).length;
}

/** Is `t` looking roughly at `c` (so a flash between them will blind it)? */
function facing(t, c, degrees = 60) {
  return Math.abs(wrap(yawTo(t.pos, c.pos) - (t.viewYaw ?? t.yaw))) < (degrees * Math.PI) / 180;
}

export function botAbilities(ctl, c, dt, intent) {
  const kit = c.abilities;
  if (!kit || !c.canUseAbilities || c.frozen) return;
  ctl.abilityClock = (ctl.abilityClock ?? Math.random() * CHECK_EVERY) - dt;
  if (ctl.abilityClock > 0) return;
  ctl.abilityClock = CHECK_EVERY;

  for (const key of ['x', 'q', 'e']) {
    const slot = kit.slots[key];
    if (!slot || !slot.ready || (slot.ult && (c.ultPoints ?? 0) < slot.ult)) continue;
    const plan = decide(ctl, c, slot, intent);
    if (!plan) continue;
    if (Math.random() > (ctl.skill.abilityUse ?? 1)) continue;
    plan(); // aim or steer for the cast
    intent[{ q: 'abilityQ', e: 'abilityE', x: 'abilityX' }[key]] = true;
    ctl.lastCast = { key, name: slot.def.name, time: ctl.time };
    return;
  }
}

/** Returns a function that prepares the cast, or null if now is not the time. */
function decide(ctl, c, slot, intent) {
  const a = slot.def;
  const t = ctl.target;
  const sees = ctl.targetVisible && t?.alive;
  const dT = t ? dist2d(c.pos, t.pos) : Infinity;
  const lowHealth = c.health < Math.max(ctl.skill.retreatHealth ?? 0, 30) + 10;
  const entering = ctl.state === STATE.PUSH && ctl.pauseTimer > 0;
  const heardRecently = ctl.time - ctl.heardEnemyAt < 2;
  const intel = ctl.ctx.ai?.senses.intel[c.team].latest(ctl.time, 4);
  // A spot the team keeps dying to just came into view (see tactics.js): utility it.
  const adapt = ctl.skill.adapt ?? 0;
  const danger = adapt > 0 && !sees && ctl.danger && ctl.time - ctl.dangerSince < 1.2 &&
    (adapt >= 2 || entering || ctl.state === STATE.HOLD) ? ctl.danger : null;
  const none = () => {};

  switch (a.type) {
    case 'throw': {
      const p = a.payload ?? {};
      const reach = throwRange(a);

      if (p.kind === 'flash') {
        // Open a fight by flashing someone who is looking this way.
        if (sees && dT > 5 && dT < 30 && !lowHealth && facing(t, c)) {
          return () => aimAt(c, t.pos, t.pos.y + 1.4);
        }
        // Flash ahead before stepping out of a choke toward known enemies.
        if (!sees && entering && intel && dist2d(intel, c.pos) < 25) return () => aimAt(c, intel, c.pos.y + 2);
        if (danger && dist2d(danger, c.pos) < 25) return () => aimAt(c, danger, danger.y + 0.6);
        return null;
      }

      if (p.kind === 'fire') {
        // After planting: burn the spike while a defender is on it.
        const spike = ctl.ctx.objective;
        if (spike?.planted && spike.defuser && c.team !== spike.defenders) {
          const d = dist2d(spike.planted, c.pos);
          if (d > 5 && d < reach * 0.95) return () => aimThrow(c, spike.planted, a, 0);
        }
        // Burn a visible or recently spotted enemy out of their spot.
        const goal = sees ? t.pos : intel && ctl.time - intel.time < 2.5 ? intel : null;
        if (goal && dist2d(goal, c.pos) > p.radius + 2 && dist2d(goal, c.pos) < reach * 0.9) {
          return () => aimThrow(c, { x: goal.x, y: goal.y ?? c.pos.y, z: goal.z }, a, 0);
        }
        return null;
      }

      if (p.kind === 'concuss' || p.kind === 'sleep') {
        // Throw at a visible enemy (not so close that it would be wasted), or
        // at known enemies just before pushing in.
        if (sees && dT > p.radius * 0.6 && dT < Math.min(20, reach * 0.9)) return () => aimThrow(c, t.pos, a, 1);
        if (!sees && entering && intel && dist2d(intel, c.pos) < Math.min(18, reach * 0.9)) {
          return () => aimThrow(c, { x: intel.x, y: c.pos.y, z: intel.z }, a, 1);
        }
        if (danger && dist2d(danger, c.pos) < Math.min(18, reach * 0.9)) {
          return () => aimThrow(c, { x: danger.x, y: c.pos.y, z: danger.z }, a, 1);
        }
        return null;
      }

      if (p.kind === 'recon') {
        if (sees || !(entering || heardRecently || danger)) return null;
        let goal = danger && dist2d(danger, c.pos) < reach ? danger : intel && dist2d(intel, c.pos) < reach ? intel : null;
        if (!goal) {
          const route = ctl.orders?.route;
          goal = route?.[(ctl.routeIndex ?? 0) + 1] ?? null;
        }
        if (!goal) goal = { x: c.pos.x - Math.sin(c.yaw) * 12, z: c.pos.z - Math.cos(c.yaw) * 12 };
        return () => aimThrow(c, { x: goal.x, y: c.pos.y, z: goal.z }, a, 1.5);
      }
      return null;
    }

    case 'trap': {
      // Anchors and defenders lock down the angle they are holding.
      if (sees) return null;
      const placed = ctl.ctx.zones?.traps.filter((z) => z.owner === c).length ?? 0;
      if (placed >= (a.maxActive ?? 2)) return null;
      const spike = ctl.ctx.objective?.active ? ctl.ctx.objective : null;
      const attacking = spike && c.team !== spike.defenders;
      if (attacking) {
        // Attackers: after the plant, trap the spike to catch the defuser.
        if (!spike.planted || ctl.state !== STATE.GUARD) return null;
        const d = dist2d(spike.planted, c.pos);
        const already = ctl.ctx.zones.traps.some((z) => z.owner === c && dist2d(z, spike.planted) < 2);
        if (already || d < 2 || d > a.range - 1) return null;
        return () => aimAt(c, spike.planted, spike.planted.y);
      }
      if (ctl.state !== STATE.HOLD || ctl.holdArrived == null) return null;
      const lookAt = ctl.holdLook;
      const lookYaw = lookAt ? yawTo(c.pos, lookAt) : c.yaw;
      // Best spot: a waypoint enemies walk through, in the direction being watched.
      const eye = { x: c.pos.x, y: c.pos.y + c.eyeHeight, z: c.pos.z };
      const taken = ctl.ctx.zones?.traps.filter((z) => z.owner === c) ?? [];
      let p = null;
      let bestScore = -Infinity;
      for (const n of ctl.nav?.nodes ?? []) {
        const d = dist2d(n, c.pos);
        if (d < 4 || d > a.range - 1.5) continue;
        const off = Math.abs(wrap(yawTo(c.pos, n) - lookYaw));
        if (off > 1.0) continue;
        if (taken.some((z) => dist2d(z, n) < 3)) continue;
        if (!ctl.ctx.world.lineOfSight(eye, { x: n.x, y: c.pos.y + 0.3, z: n.z }, false)) continue;
        const score = d - off * 6; // far down the angle, close to its center
        if (score > bestScore) { bestScore = score; p = { x: n.x, z: n.z }; }
      }
      if (!p) {
        const d = Math.min(7, a.range - 2);
        p = { x: c.pos.x - Math.sin(lookYaw) * d, z: c.pos.z - Math.cos(lookYaw) * d };
      }
      // The second trap covers a flank instead of stacking on the first.
      const mine = ctl.ctx.zones?.traps.filter((z) => z.owner === c) ?? [];
      if (mine.some((z) => dist2d(z, p) < 3)) {
        const side = Math.random() < 0.5 ? 1 : -1;
        const yaw = yawTo(c.pos, p) + side * Math.PI / 2;
        p = { x: c.pos.x - Math.sin(yaw) * 6, z: c.pos.z - Math.cos(yaw) * 6 };
      }
      return () => aimAt(c, p, c.pos.y);
    }

    case 'aura': {
      if (a.shield) {
        // Shield up when a fight starts, or right before the team goes in.
        if (sees && c.bonusShield === 0) return none;
        if (entering && c.bonusShield === 0 && alliesWithin(ctl, c, a.radius) > 0) return none;
        return null;
      }
      if (a.heal) {
        if (sees) return null;
        const hurt = alliesWithin(ctl, c, a.radius * 0.9, (m) => m.health < 60);
        return c.health < 70 || hurt > 0 ? none : null;
      }
      return null;
    }

    case 'nova': {
      if (a.status === 'revealed') {
        // Reveal before going in, or after hearing someone it can't see.
        return !sees && (heardRecently || entering) ? none : null;
      }
      if (a.status === 'stun' || a.status === 'sleep') {
        // Any visible enemy in range, not only the one being fought.
        return visibleEnemiesWithin(ctl, c, a.radius * 0.9) > 0 ? none : null;
      }
      if (a.damage) return visibleEnemiesWithin(ctl, c, a.radius * 0.85) > 0 ? none : null;
      return null;
    }

    case 'cone': {
      if (!sees || dT > a.range * 0.9) return null;
      const off = Math.abs(wrap(yawTo(c.pos, t.pos) - c.viewYaw));
      return off < a.angle * 0.7 * (Math.PI / 180) ? none : null;
    }

    case 'dash': {
      // Escape: dash away from the threat when low.
      if (sees && lowHealth) {
        return () => moveToward(c, intent, c.pos.x - t.pos.x, c.pos.z - t.pos.z);
      }
      // Entry: dash through a choke toward a known enemy ahead.
      if (!sees && ctl.role === 'entry' && entering) {
        if (intel && dist2d(intel, c.pos) < 20) return () => moveToward(c, intent, intel.x - c.pos.x, intel.z - c.pos.z);
      }
      return null;
    }

    case 'blink':
      // Escape: turn away from the threat and blink out of the fight.
      return sees && lowHealth ? () => { c.yaw = yawTo(t.pos, c.pos); } : null;

    case 'marker':
      if (!slot.marker) {
        // Leave a way back before stepping into a dangerous area.
        return entering && c.health > 70 ? none : null;
      }
      return sees && lowHealth ? none : null; // teleport back to safety

    case 'shield':
      return sees && c.bonusShield === 0 ? none : null;

    case 'heal':
      if (c.health >= c.maxHealth - 15) return null;
      return (!t && c.health < 70) || ctl.state === STATE.RETREAT ? none : null;

    case 'smoke': {
      // Before pushing through a choke: smoke the known enemy, or the next node ahead.
      if (danger && dist2d(danger, c.pos) < a.range && dist2d(danger, c.pos) > a.radius + 2) {
        return () => aimAt(c, danger, 1.0); // smoke off the angle they keep killing us from
      }
      if (sees || ctl.state !== STATE.PUSH || ctl.pauseTimer <= 0) {
        // Covering a retreat: smoke between yourself and the threat.
        if (ctl.state === STATE.RETREAT && ctl.lastSeen) {
          const mid = { x: (c.pos.x + ctl.lastSeen.x) / 2, z: (c.pos.z + ctl.lastSeen.z) / 2 };
          return () => aimAt(c, mid, 1.0);
        }
        return null;
      }
      const known = ctl.ctx.ai?.senses.intel[c.team].latest(ctl.time, 6);
      if (known && dist2d(known, c.pos) < a.range && dist2d(known, c.pos) > a.radius + 2) {
        return () => aimAt(c, known, 1.0);
      }
      const route = ctl.orders?.route;
      const ahead = route?.[(ctl.routeIndex ?? 0) + 1];
      const half = c.team === 'ally' ? 'e' : 'a';
      if (ahead && ahead.id.endsWith(half) && dist2d(ahead, c.pos) > a.radius + 2) {
        return () => aimAt(c, ahead, 1.0);
      }
      return null;
    }
  }
  return null;
}
