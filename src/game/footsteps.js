// Footsteps: who is making noise, and where.
//
// Every tick this checks each living character. Running on the ground makes
// a footstep every `stride` meters; walking (Shift) and crouching are silent,
// like Valorant. Landing from a jump or a drop makes a louder landing sound.
//
// It emits 'footstep' events: { who, x, y, z, kind: 'step' | 'land', surface,
// speed, weight }. The sound system plays them (you hear enemies coming), and
// the bots' senses use the same events, so you and the bots hear exactly the
// same things.
import { MOVE } from './character.js';

export const FOOTSTEPS = {
  stride: 2.3,                    // meters between steps (about 0.34 s at full run speed)
  minSpeed: MOVE.walkSpeed + 0.4, // slower than this (walking, crouching) is silent
  landSpeed: 4,                   // falling faster than this (m/s) makes a landing sound
  hardLandSpeed: 9,               // landing this fast is as loud as a landing gets
};

export class Footsteps {
  constructor(world, events) {
    this.world = world;
    this.events = events;
    this.state = new WeakMap(); // character -> { dist, air, fall }
  }

  /** Call once per tick, after everyone has moved. */
  tick(dt, characters) {
    for (const c of characters) {
      if (!c.isCharacter) continue;
      if (!c.alive) {
        this.state.delete(c);
        continue;
      }
      let s = this.state.get(c);
      if (!s) {
        // The first step comes a little after you start running.
        s = { dist: FOOTSTEPS.stride * 0.6, air: !c.onGround, fall: 0 };
        this.state.set(c, s);
      }

      if (!c.onGround) {
        s.air = true;
        s.fall = Math.max(0, -c.vel.y);
        continue;
      }

      if (s.air) {
        s.air = false;
        if (s.fall > FOOTSTEPS.landSpeed) {
          const range = FOOTSTEPS.hardLandSpeed - FOOTSTEPS.landSpeed;
          const weight = Math.min(1, 0.4 + (0.6 * (s.fall - FOOTSTEPS.landSpeed)) / range);
          this._emit(c, 'land', s.fall, weight);
          s.dist = 0; // the next stride starts from the landing
        }
        s.fall = 0;
      }

      const speed = Math.hypot(c.vel.x, c.vel.z);
      // Dashes have their own sound, and a frozen character isn't moving.
      if (speed < FOOTSTEPS.minSpeed || c.dash || c.frozen) {
        s.dist = Math.min(s.dist, FOOTSTEPS.stride * 0.6);
        continue;
      }
      s.dist += speed * dt;
      if (s.dist >= FOOTSTEPS.stride) {
        s.dist -= FOOTSTEPS.stride;
        this._emit(c, 'step', speed, 1);
      }
    }
  }

  _emit(c, kind, speed, weight) {
    const surface = this.world.surfaceAt(c.pos.x, c.pos.y, c.pos.z, c.radius * 0.6);
    this.events.emit('footstep', { who: c, x: c.pos.x, y: c.pos.y, z: c.pos.z, kind, surface, speed, weight });
  }
}
