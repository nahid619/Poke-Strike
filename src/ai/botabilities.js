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

/** Aim the bot at a point (abilities like smoke use the view direction). */
function aimAt(c, p, y = 0.5) {
  c.yaw = yawTo(c.pos, p) - c.recoilYaw;
  c.pitch = Math.atan2(y - (c.pos.y + c.eyeHeight), Math.max(0.5, dist2d(c.pos, p))) - c.recoilPitch;
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

export function botAbilities(ctl, c, dt, intent) {
  const kit = c.abilities;
  if (!kit || !c.canUseAbilities || c.frozen) return;
  ctl.abilityClock = (ctl.abilityClock ?? Math.random() * CHECK_EVERY) - dt;
  if (ctl.abilityClock > 0) return;
  ctl.abilityClock = CHECK_EVERY;

  for (const key of ['q', 'e']) {
    const slot = kit.slots[key];
    if (slot.cooldown > 0) continue;
    const plan = decide(ctl, c, slot, intent);
    if (!plan) continue;
    if (Math.random() > (ctl.skill.abilityUse ?? 1)) continue;
    plan(); // aim or steer for the cast
    intent[key === 'q' ? 'abilityQ' : 'abilityE'] = true;
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
  const none = () => {};

  switch (a.type) {
    case 'nova': {
      if (a.status === 'revealed') {
        // Reveal before going in, or after hearing someone it can't see.
        const heardRecently = ctl.time - ctl.heardEnemyAt < 2;
        const entering = ctl.state === STATE.PUSH && ctl.pauseTimer > 0;
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
      if (!sees && ctl.role === 'entry' && ctl.state === STATE.PUSH && ctl.pauseTimer > 0) {
        const intel = ctl.ctx.ai?.senses.intel[c.team].latest(ctl.time, 4);
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
        return ctl.state === STATE.PUSH && ctl.pauseTimer > 0 && c.health > 70 ? none : null;
      }
      return sees && lowHealth ? none : null; // teleport back to safety

    case 'shield':
      return sees && c.bonusShield === 0 ? none : null;

    case 'heal':
      if (c.health >= c.maxHealth - 15) return null;
      return (!t && c.health < 70) || ctl.state === STATE.RETREAT ? none : null;

    case 'smoke': {
      // Before pushing through a choke: smoke the known enemy, or the next node ahead.
      if (sees || ctl.state !== STATE.PUSH || ctl.pauseTimer <= 0) {
        // Covering a retreat: smoke between yourself and the threat.
        if (ctl.state === STATE.RETREAT && ctl.lastSeen) {
          const mid = { x: (c.pos.x + ctl.lastSeen.x) / 2, z: (c.pos.z + ctl.lastSeen.z) / 2 };
          return () => aimAt(c, mid, 1.0);
        }
        return null;
      }
      const intel = ctl.ctx.ai?.senses.intel[c.team].latest(ctl.time, 6);
      if (intel && dist2d(intel, c.pos) < a.range && dist2d(intel, c.pos) > a.radius + 2) {
        return () => aimAt(c, intel, 1.0);
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

