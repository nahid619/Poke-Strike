// Controllers decide what a Character wants to do.
// HumanController reads the keyboard and mouse. BotController (Phase 6) will
// produce the same kind of intent from AI, which is what makes takeover easy.

const DEG_PER_COUNT = 0.07; // Valorant's sensitivity scale
const MAX_PITCH = (89 * Math.PI) / 180;

export class HumanController {
  constructor(input, settings) {
    this.input = input;
    this.settings = settings;
    this.isHuman = true; // shots from a human are checked against what was on screen
  }

  /** Called every rendered frame (not per tick) so aiming feels instant. */
  updateLook(character) {
    const delta = this.input.consumeMouse();
    if (character.asleep) return { x: 0, y: 0 }; // can't aim while asleep
    const { x, y } = delta;
    const radPerCount = (this.settings.sensitivity * DEG_PER_COUNT * Math.PI) / 180;
    character.yaw -= x * radPerCount;
    character.pitch -= y * radPerCount;
    character.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, character.pitch));
    // Keep yaw in a tidy range.
    if (character.yaw > Math.PI) character.yaw -= Math.PI * 2;
    else if (character.yaw < -Math.PI) character.yaw += Math.PI * 2;
    return delta;
  }

  getIntent() {
    const i = this.input;
    let switchTo = null;
    if (i.consumePressed('Digit1')) switchTo = 0;
    if (i.consumePressed('Digit2')) switchTo = 1;
    return {
      forward: (i.isDown('KeyW') ? 1 : 0) - (i.isDown('KeyS') ? 1 : 0),
      right: (i.isDown('KeyD') ? 1 : 0) - (i.isDown('KeyA') ? 1 : 0),
      walk: i.isDown('ShiftLeft') || i.isDown('ShiftRight'),
      jump: i.consumePressed('Space'),
      fireHeld: i.isDown('Mouse0'),
      firePressed: i.consumePressed('Mouse0'),
      reload: i.consumePressed('KeyR'),
      switchTo,
      switchDelta: Math.sign(i.consumeWheel()),
      abilityQ: i.consumePressed('KeyQ'),
      abilityE: i.consumePressed('KeyE'),
      interact: i.isDown('KeyF'), // hold to plant or defuse the spike
    };
  }
}

/**
 * Practice-target movement: strafes left and right at random intervals,
 * sometimes stopping, and stays near its starting point.
 */
export class StrafeController {
  constructor({ range = 3, minTime = 0.35, maxTime = 1.1, stopChance = 0.25 } = {}) {
    this.range = range;
    this.minTime = minTime;
    this.maxTime = maxTime;
    this.stopChance = stopChance;
    this.home = null;
    this.timer = 0;
    this.dir = 1;
  }

  attach(character) {
    this.home = character.pos.clone();
  }

  getIntent(character, dt) {
    if (!this.home) this.home = character.pos.clone();
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.minTime + Math.random() * (this.maxTime - this.minTime);
      if (Math.random() < this.stopChance) this.dir = 0;
      else this.dir = this.dir === 0 ? (Math.random() < 0.5 ? 1 : -1) : -this.dir;
    }
    // Turn back if it wandered too far from home (measured along its right axis).
    const rx = Math.cos(character.yaw);
    const rz = -Math.sin(character.yaw);
    const offset = (character.pos.x - this.home.x) * rx + (character.pos.z - this.home.z) * rz;
    if (offset > this.range) this.dir = -1;
    else if (offset < -this.range) this.dir = 1;
    return { forward: 0, right: this.dir, walk: false, jump: false };
  }
}
