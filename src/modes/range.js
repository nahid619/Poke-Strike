// Test range: free movement with practice targets that respawn.
import { Session } from '../game/session.js';
import { Character } from '../game/character.js';
import { StrafeController } from '../game/controllers.js';
import { attachHealthBar } from '../game/healthbar.js';
import { yawToward } from '../game/level.js';
import testmap from '../data/maps/testmap.js';

const RESPAWN_DELAY = 2.5;
const FAST_COOLDOWNS = 0.25; // the test range can shorten cooldowns to 25%

export class RangeMode extends Session {
  constructor(shared) {
    super({ ...shared, map: testmap });
    this.settings = shared.settings;
    this.respawns = [];

    for (const d of testmap.dummies) {
      const dummy = new Character({ name: 'Target', team: d.team });
      dummy.home = { x: d.x, z: d.z, yaw: yawToward(d, testmap.spawn) };
      dummy.teleport(d.x, 0, d.z, dummy.home.yaw);
      if (d.move === 'strafe') dummy.setController(new StrafeController());
      attachHealthBar(dummy);
      this.add(dummy);
    }

    this.events.on('kill', ({ victim }) => {
      if (victim.home) this.respawns.push({ who: victim, at: this.ctx.time + RESPAWN_DELAY });
    });
  }

  setAgent(agent) {
    super.setAgent(agent);
    this.applyCooldownSetting();
  }

  applyCooldownSetting() {
    const kit = this.player.abilities;
    if (kit) kit.cooldownScale = this.settings?.fastCooldowns ? FAST_COOLDOWNS : 1;
  }

  onTick() {
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      const r = this.respawns[i];
      if (this.ctx.time < r.at) continue;
      r.who.revive(r.who.home.x, 0, r.who.home.z, r.who.home.yaw);
      this.respawns.splice(i, 1);
    }
  }
}
