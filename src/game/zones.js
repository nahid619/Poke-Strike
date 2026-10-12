// Zones are lasting ability effects in the world: smoke clouds (block vision)
// and fire patches (burn enemies standing in them).
import { dealDamage } from './abilities.js';

const SMOKE_GROW = 0.5; // seconds to reach full size
const BURN_TICK = 0.25; // fire damage is applied in small chunks

export class Zones {
  constructor(world, events) {
    this.world = world;
    this.events = events;
    this.smokes = world.smokes; // shared with World.lineOfSight
    this.fires = [];
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

  clear() {
    for (const z of [...this.smokes, ...this.fires]) this.events.emit('zoneEnd', z);
    this.smokes.length = 0;
    this.fires.length = 0;
  }

  tick(dt, ctx) {
    const now = ctx.time;
    for (const list of [this.smokes, this.fires]) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (now < list[i].until) continue;
        this.events.emit('zoneEnd', list[i]);
        list.splice(i, 1);
      }
    }
    for (const s of this.smokes) s.r = s.radius * Math.min(1, (now - s.start) / SMOKE_GROW);

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
}
