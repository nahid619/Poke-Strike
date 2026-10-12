// The spike (bomb) for plant-and-defuse rounds. Pure rules, no visuals.
//
//   - One attacker carries it. If the carrier dies it drops; any attacker who
//     walks over it picks it up.
//   - Plant: the carrier holds the interact key (F) inside a site.
//   - Once planted it counts down. Defenders defuse by holding F next to it.
//     Defuse progress is kept at the halfway mark if they let go after it.
//   - Planting and defusing lock you in place (you can still look around).
export const SPIKE = {
  plantTime: 3.5,
  defuseTime: 7,
  defuseCheckpoint: 3.5,
  fuse: 40,
  pickupRadius: 1.4,
  defuseRadius: 1.8,
  attackerBarrier: 2, // attackers wait this long at round start so defenders can set up
};

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class Spike {
  constructor(events, sites) {
    this.events = events;
    this.sites = sites;
    this.reset(null, null);
  }

  reset(attackers, carrier) {
    this.attackers = attackers;
    this.active = false;
    this.carrier = carrier;
    this.dropped = null;
    this.planted = null;
    this.fuseLeft = SPIKE.fuse;
    this.planter = null;
    this.plantProgress = 0;
    this.defuser = null;
    this.defuseProgress = 0;
    this.defuseCheckpoint = 0;
    this.detonated = false;
    this.defused = false;
  }

  get defenders() {
    return this.attackers === 'ally' ? 'enemy' : 'ally';
  }

  get live() {
    return this.active && !this.detonated && !this.defused;
  }

  /** Which site (A or B) a position is inside, or null. */
  siteAt(pos) {
    for (const [id, s] of Object.entries(this.sites)) if (flat(pos, s) <= s.radius) return id;
    return null;
  }

  canDefuseFrom(c) {
    return !!this.planted && flat(c.pos, this.planted) <= SPIKE.defuseRadius && Math.abs(c.pos.y - this.planted.y) < 1.5;
  }

  /**
   * Called for every character each tick with their intent. Returns true if
   * the character is busy planting or defusing (and must stay still).
   */
  interact(c, intent, dt) {
    if (!this.live || !c.alive) return false;

    // Planting
    if (!this.planted && c === this.carrier) {
      const site = this.siteAt(c.pos);
      if (intent.interact && site && c.onGround) {
        if (this.planter !== c) {
          this.planter = c;
          this.plantProgress = 0;
          this.events.emit('plantStart', { who: c, site });
        }
        this.plantProgress += dt;
        if (this.plantProgress >= SPIKE.plantTime) {
          this._plant(c, site);
          return false;
        }
        return true;
      }
      if (this.planter === c) this._cancelPlant();
      return false;
    }

    // Defusing
    if (this.planted && c.team === this.defenders) {
      if (intent.interact && this.canDefuseFrom(c) && (!this.defuser || this.defuser === c)) {
        if (this.defuser !== c) {
          this.defuser = c;
          this.defuseProgress = this.defuseCheckpoint;
          this.events.emit('defuseStart', { who: c });
        }
        this.defuseProgress += dt;
        if (this.defuseProgress >= SPIKE.defuseCheckpoint) this.defuseCheckpoint = SPIKE.defuseCheckpoint;
        if (this.defuseProgress >= SPIKE.defuseTime) {
          this.defused = true;
          this.defuser = null;
          this.events.emit('spikeDefused', { who: c });
          return false;
        }
        return true;
      }
      if (this.defuser === c) this._cancelDefuse();
    }
    return false;
  }

  _plant(c, site) {
    this.planted = { x: c.pos.x, y: c.pos.y, z: c.pos.z, site };
    this.carrier = null;
    this.planter = null;
    this.plantProgress = 0;
    this.fuseLeft = SPIKE.fuse;
    this.events.emit('spikePlanted', { who: c, site, pos: this.planted });
  }

  _cancelPlant() {
    this.events.emit('plantCancel', { who: this.planter });
    this.planter = null;
    this.plantProgress = 0;
  }

  _cancelDefuse() {
    this.events.emit('defuseCancel', { who: this.defuser });
    this.defuser = null;
    this.defuseProgress = this.defuseCheckpoint;
  }

  /** The carrier died: leave the spike where they fell. */
  drop(c) {
    if (c !== this.carrier) return;
    this.carrier = null;
    this.dropped = { x: c.pos.x, y: c.pos.y, z: c.pos.z };
    this.events.emit('spikeDropped', { who: c, pos: this.dropped });
  }

  tick(dt, characters) {
    if (!this.live) return;
    if (this.planter && !this.planter.alive) this._cancelPlant();
    if (this.defuser && !this.defuser.alive) this._cancelDefuse();

    if (this.dropped) {
      for (const c of characters) {
        if (!c.isCharacter || !c.alive || c.team !== this.attackers) continue;
        if (flat(c.pos, this.dropped) <= SPIKE.pickupRadius && Math.abs(c.pos.y - this.dropped.y) < 1.5) {
          this.carrier = c;
          this.dropped = null;
          this.events.emit('spikePickup', { who: c });
          break;
        }
      }
    }

    if (this.planted) {
      this.fuseLeft -= dt;
      if (this.fuseLeft <= 0) {
        this.fuseLeft = 0;
        this.detonated = true;
        this.events.emit('spikeDetonated', { pos: this.planted });
      }
    }
  }
}
