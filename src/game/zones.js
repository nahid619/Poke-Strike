// Zones are lasting ability effects in the world: smoke clouds (block vision),
// fire patches (burn enemies standing in them), traps (slow and reveal the
// first enemy to step on them), recon eyes (reveal what they can see), and
// thrown projectiles in flight.
import { dealDamage, PAYLOADS } from './abilities.js';

const SMOKE_GROW = 0.5; // seconds to reach full size
const BURN_TICK = 0.25; // fire damage is applied in small chunks
const MAX_BOUNCES = 3;
const BOUNCE_KEEP = 0.45; // speed kept after bouncing off a wall

export class Zones {
  constructor(world, events) {
    this.world = world;
    this.events = events;
    this.smokes = world.smokes; // shared with World.lineOfSight
    this.fires = [];
    this.traps = [];
    this.recons = [];
    this.projectiles = [];
    this.nextId = 1;
  }

  addSmoke({ x, y, z, radius, duration, team }, time) {
    const zone = { id: this.nextId++, kind: 'smoke', x, y, z, radius, r: 0, team, start: time, until: time + duration };
    this.smokes.push(zone);
    this.events.emit('zoneStart', zone);
    return zone;
  }

  addFire({ x, y, z, radius, dps, duration, team, owner, name }, time) {
    const zone = { id: this.nextId++, kind: 'fire', x, y, z, radius, dps, team, owner, name, start: time, until: time + duration };
    this.fires.push(zone);
    this.events.emit('zoneStart', zone);
    return zone;
  }

  addTrap(opts, time) {
    const zone = { id: this.nextId++, kind: 'trap', ...opts, start: time, until: Infinity };
    this.traps.push(zone);
    this.events.emit('zoneStart', zone);
    return zone;
  }

  addRecon(opts, time) {
    const zone = {
      id: this.nextId++, kind: 'recon', ...opts, start: time, until: Infinity,
      pulsesLeft: opts.pulses, nextPulse: time + 0.25,
    };
    this.recons.push(zone);
    this.events.emit('zoneStart', zone);
    return zone;
  }

  addProjectile(opts, time) {
    const p = {
      id: this.nextId++, kind: 'projectile', ...opts, start: time, life: 0, bounces: 0,
      prev: { x: opts.x, y: opts.y, z: opts.z },
    };
    this.projectiles.push(p);
    this.events.emit('projectileStart', p);
    return p;
  }

  /** Take one zone out early (e.g. the oldest trap when placing a new one). */
  remove(zone) {
    for (const list of [this.smokes, this.fires, this.traps, this.recons]) {
      const i = list.indexOf(zone);
      if (i >= 0) {
        list.splice(i, 1);
        this.events.emit('zoneEnd', zone);
        return;
      }
    }
  }

  clear() {
    for (const z of [...this.smokes, ...this.fires, ...this.traps, ...this.recons]) this.events.emit('zoneEnd', z);
    for (const p of this.projectiles) this.events.emit('projectileEnd', p);
    this.smokes.length = 0;
    this.fires.length = 0;
    this.traps.length = 0;
    this.recons.length = 0;
    this.projectiles.length = 0;
  }

  tick(dt, ctx) {
    const now = ctx.time;
    for (const list of [this.smokes, this.fires, this.traps, this.recons]) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (now < list[i].until) continue;
        this.events.emit('zoneEnd', list[i]);
        list.splice(i, 1);
      }
    }
    for (const s of this.smokes) s.r = s.radius * Math.min(1, (now - s.start) / SMOKE_GROW);

    this._tickProjectiles(dt, ctx);
    this._tickTraps(ctx);
    this._tickRecons(ctx);

    // Burning: standing in any enemy fire deals its damage per second.
    for (const c of ctx.characters) {
      if (!c.alive || !c.applyStatus) continue;
      let source = null;
      for (const f of this.fires) {
        if (f.team === c.team) continue;
        const dx = c.pos.x - f.x;
        const dz = c.pos.z - f.z;
        const r = f.radius + c.radius * 0.5;
        if (dx * dx + dz * dz <= r * r && c.pos.y >= f.y - 0.5 && c.pos.y <= f.y + 1) {
          source = f;
          break;
        }
      }
      if (!source) {
        c._burn = 0;
        c._burnTimer = 0;
        continue;
      }
      c._burn = (c._burn ?? 0) + source.dps * dt;
      c._burnTimer = (c._burnTimer ?? 0) + dt;
      if (c._burnTimer >= BURN_TICK) {
        const dmg = Math.floor(c._burn);
        c._burn -= dmg;
        c._burnTimer = 0;
        if (dmg > 0) dealDamage(source.owner, c, dmg, source.name, ctx);
      }
    }
  }

  // ---- thrown abilities ----

  _tickProjectiles(dt, ctx) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.prev.x = p.x;
      p.prev.y = p.y;
      p.prev.z = p.z;
      p.vy -= p.gravity * dt;
      p.life += dt;

      const sx = p.vx * dt;
      const sy = p.vy * dt;
      const sz = p.vz * dt;
      const len = Math.hypot(sx, sy, sz);
      const hit = len > 1e-6 ? this.world.raycast(p, { x: sx / len, y: sy / len, z: sz / len }, len + 0.05) : null;
      if (hit) {
        const t = Math.max(0, hit.t - 0.05);
        const point = {
          x: p.x + (sx / len) * t + hit.nx * 0.15,
          y: p.y + (sy / len) * t + hit.ny * 0.15,
          z: p.z + (sz / len) * t + hit.nz * 0.15,
        };
        const floor = hit.ny > 0.6;
        if (!p.bounce || floor || p.bounces >= MAX_BOUNCES) {
          this._detonate(i, point, ctx);
          continue;
        }
        // Bounce off walls and ceilings.
        const dot = p.vx * hit.nx + p.vy * hit.ny + p.vz * hit.nz;
        p.vx = (p.vx - 2 * dot * hit.nx) * BOUNCE_KEEP;
        p.vy = (p.vy - 2 * dot * hit.ny) * BOUNCE_KEEP;
        p.vz = (p.vz - 2 * dot * hit.nz) * BOUNCE_KEEP;
        p.x = point.x;
        p.y = point.y;
        p.z = point.z;
        p.bounces++;
        this.events.emit('projectileBounce', p);
      } else {
        p.x += sx;
        p.y += sy;
        p.z += sz;
      }
      if (p.life >= p.fuse) this._detonate(i, { x: p.x, y: p.y, z: p.z }, ctx);
    }
  }

  _detonate(index, point, ctx) {
    const p = this.projectiles[index];
    this.projectiles.splice(index, 1);
    this.events.emit('projectileEnd', p);
    const fn = PAYLOADS[p.payload?.kind];
    const hits = fn ? fn(p, point, ctx) : [];
    this.events.emit('payload', { projectile: p, owner: p.owner, kind: p.payload?.kind, payload: p.payload, point, hits });
  }

  // ---- traps and recon ----

  _tickTraps(ctx) {
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (ctx.time < t.armAt) continue;
      if (t.owner && !t.owner.alive) continue; // still there, but nobody to warn
      const victim = ctx.characters.find((c) => c.alive && c.applyStatus && c.team !== t.team &&
        Math.hypot(c.pos.x - t.x, c.pos.z - t.z) <= t.radius && Math.abs(c.pos.y - t.y) < 1.2);
      if (!victim) continue;
      victim.applyStatus('slow', t.slowDuration, { factor: t.slow });
      victim.applyStatus('revealed', t.revealDuration);
      this.traps.splice(i, 1);
      this.events.emit('zoneEnd', t);
      this.events.emit('trapTriggered', { trap: t, owner: t.owner, victim });
    }
  }

  _tickRecons(ctx) {
    for (const r of this.recons) {
      if (r.pulsesLeft <= 0 || ctx.time < r.nextPulse) continue;
      const hits = [];
      for (const c of ctx.characters) {
        if (!c.alive || !c.applyStatus || c.team === r.team) continue;
        const chest = { x: c.pos.x, y: c.pos.y + 1.1, z: c.pos.z };
        if (Math.hypot(chest.x - r.x, chest.y - r.y, chest.z - r.z) > r.radius) continue;
        if (!this.world.lineOfSight(r, chest, false)) continue;
        c.applyStatus('revealed', r.reveal);
        hits.push(c);
      }
      r.pulsesLeft--;
      r.nextPulse = ctx.time + r.interval;
      if (r.pulsesLeft <= 0) r.until = ctx.time + 0.8;
      this.events.emit('reconPulse', { zone: r, owner: r.owner, hits });
    }
  }
}
