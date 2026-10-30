// What bots can learn besides seeing: noises, and what their teammates saw.
//
// Noises: running footsteps, landings, gunshots, and abilities. Walking
// (Shift) is silent, so you can sneak past bots. Each noise has a radius; bots
// within it hear it and know roughly where it came from. Footsteps come from
// the same 'footstep' events that you hear (see game/footsteps.js).
//
// Team intel: when any bot spots an enemy, the whole team knows where that
// enemy was and when. Anchors use this to rotate toward fights.
export const NOISE = {
  footstepRadius: 22,
  landRadius: 26,      // landing from a jump is louder than a step
  shotRadius: 45,      // (silenced guns: less than half that)
  abilityRadius: 20,
  memory: 1.0,         // how long a noise stays "fresh"
};

export class Senses {
  constructor(events) {
    this.noises = [];
    this.time = 0;
    this.intel = { ally: new TeamIntel(), enemy: new TeamIntel() };
    events.on('shot', (s) => this.noise(s.owner, s.origin.x, s.origin.z, NOISE.shotRadius * (s.weapon?.suppressed ? 0.45 : 1), 'shot'));
    events.on('abilityCast', (e) => this.noise(e.owner, e.owner.pos.x, e.owner.pos.z, NOISE.abilityRadius, 'ability'));
    events.on('footstep', (f) => this.noise(f.who, f.x, f.z, f.kind === 'land' ? NOISE.landRadius : NOISE.footstepRadius, 'step'));
  }

  reset() {
    this.noises.length = 0;
    this.intel.ally.reset();
    this.intel.enemy.reset();
  }

  noise(source, x, z, radius, kind) {
    this.noises.push({ source, team: source.team, x, z, radius, kind, time: this.time });
  }

  /** Call once per tick: moves the clock and forgets old noises. */
  tick(dt) {
    this.time += dt;
    const cutoff = this.time - NOISE.memory;
    while (this.noises.length && this.noises[0].time < cutoff) this.noises.shift();
  }

  /** The loudest recent enemy noise this character can hear, or null. */
  hear(listener, since) {
    let best = null;
    let bestScore = 0;
    for (const n of this.noises) {
      if (n.team === listener.team || n.time <= since) continue;
      const d = Math.hypot(n.x - listener.pos.x, n.z - listener.pos.z);
      if (d > n.radius) continue;
      const score = 1 - d / n.radius;
      if (score > bestScore) {
        bestScore = score;
        best = { ...n, distance: d };
      }
    }
    return best;
  }
}

class TeamIntel {
  constructor() {
    this.reset();
  }

  reset() {
    this.sightings = new Map(); // enemy -> { x, z, time }
    this.contact = null;        // latest spotted enemy: { x, z, time, lane }
  }

  spotted(enemy, time, lane) {
    this.sightings.set(enemy, { x: enemy.pos.x, z: enemy.pos.z, time });
    this.contact = { x: enemy.pos.x, z: enemy.pos.z, time, lane };
  }

  /** Most recent sighting of a living enemy, if any. */
  latest(now, maxAge = 8) {
    let best = null;
    for (const [enemy, s] of this.sightings) {
      if (!enemy.alive || now - s.time > maxAge) continue;
      if (!best || s.time > best.time) best = { ...s, enemy };
    }
    return best;
  }
}
