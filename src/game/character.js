// The one Character class used by everyone: you, your teammates, and enemies.
// A Character owns its body, physics, health, and status effects. A controller
// (human or bot) only supplies an "intent" each tick: which way to move, jump,
// shoot, or use an ability.
import * as THREE from 'three';
import { raySphere, rayCylinder } from '../core/physics.js';

export const TEAM_COLORS = {
  ally: 0x3a8ee6,
  enemy: 0xe5484d,
};

// Movement tuning. Speeds are close to Valorant's (6.75 m/s running).
export const MOVE = {
  runSpeed: 6.75,
  walkSpeed: 3.6,
  crouchSpeed: 2.9,
  accel: 12,        // ground acceleration (snappy, like Valorant)
  airAccel: 10,     // air acceleration...
  airWishCap: 0.8,  // ...but only up to 0.8 m/s along your input, so you can
                    // steer a little mid-air but not build speed from a standstill
  friction: 10,     // ground friction; makes counter-strafing work
  stopSpeed: 1.5,   // friction acts as if at least this fast, so you stop crisply
  gravity: 20,
  jumpSpeed: 7,     // about 1.2 m jump height
  maxFall: 30,
  stepHeight: 0.4,  // walk up stairs and small ledges
  coyoteTime: 0.1,  // jump still works just after leaving a ledge
  jumpBuffer: 0.12, // jump pressed just before landing still counts
};

// Hitboxes, relative to the feet. They match the visible body:
// a head sphere sitting on a torso, with legs below.
export const HITBOX = {
  headY: 1.58, headR: 0.2,
  bodyTop: 1.38, bodyR: 0.33,
  legsTop: 0.85, legsR: 0.3,
};

// Crouching (hold Ctrl): lower eyes and hitboxes, slower, steadier aim.
export const CROUCH = {
  scale: 0.68,      // body height multiplier when fully crouched
  time: 0.12,       // seconds to crouch or stand
};

// How status effects behave (see build-plan section 4.5).
export const STATUS = {
  stunSpeed: 0.6,    // movement multiplier while stunned
  stunSpread: 2.5,   // extra weapon spread while stunned (degrees)
  stunShake: 0.006,  // random aim drift per tick while stunned (radians)
  slowDefault: 0.6,
};

const IDLE_INTENT = Object.freeze({
  forward: 0, right: 0, walk: false, jump: false,
  fireHeld: false, firePressed: false, reload: false, switchTo: null, switchDelta: 0,
  abilityQ: false, abilityE: false, interact: false, crouch: false,
  adsPressed: false, adsHeld: false, adsHold: false,
});

const freshStatus = () => ({ stun: 0, sleep: 0, slow: 0, slowFactor: 1, revealed: 0, blind: 0, blindMax: 0 });

export class Character {
  constructor({
    name = 'Player', team = 'ally', radius = 0.35, height = 1.8, eyeHeight = 1.6,
    maxHealth = 100, maxShield = 50,
  } = {}) {
    this.name = name;
    this.team = team;
    this.radius = radius;
    this.height = height;
    this.standEyeHeight = eyeHeight;
    this.crouchAmt = 0;  // 0 standing .. 1 fully crouched
    this.stepHeight = MOVE.stepHeight;
    this.maxHealth = maxHealth;
    this.maxShield = maxShield;
    this.health = maxHealth;
    this.shield = maxShield;
    this.bonusShield = 0;     // temporary extra shield (absorbs damage first)
    this.bonusShieldTime = 0;
    this.heals = [];          // heal-over-time effects
    this.status = freshStatus();
    this.alive = true;
    this.deathTime = 0;

    this.pos = new THREE.Vector3();     // feet position
    this.prevPos = new THREE.Vector3(); // for smooth rendering between ticks
    this.seenPos = null;                // where it was last drawn on screen (set in syncMesh)
    this.vel = new THREE.Vector3();
    this.yaw = 0;   // 0 = facing -Z
    this.pitch = 0;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.stepOffset = 0; // visual-only camera smoothing for stairs
    this.wishDir = { x: 0, z: 0 }; // world direction of current movement input
    this.dash = null;

    this.isCharacter = true;
    this.frozen = false;     // pre-round: can look and switch weapons, nothing else
    this.controller = null;
    this.loadout = null;     // weapons, for anyone who carries them
    this.abilities = null;   // AbilityKit, for anyone playing an agent
    this.recoilPitch = 0;    // spray pattern: where bullets go, relative to your aim (radians)
    this.recoilYaw = 0;
    this.punchPitch = 0;     // camera-only kick that springs back (radians)
    this.punchYaw = 0;
    this.onHealthChange = null;
    this.mesh = buildBody(this);
  }

  // ---- state queries ----

  get asleep() { return this.status.sleep > 0; }
  get stunned() { return this.status.stun > 0; }
  get revealed() { return this.status.revealed > 0; }
  get blinded() { return this.status.blind > 0; }
  /** 0..1 how white your screen is from a flash. */
  get blindAmount() {
    const b = this.status.blind;
    return b > 0 ? Math.min(1, b / Math.min(0.6, this.status.blindMax || 0.6)) : 0;
  }
  get eyeHeight() { return this.standEyeHeight * (1 - (1 - CROUCH.scale) * this.crouchAmt); }
  get bodyScale() { return 1 - (1 - CROUCH.scale) * this.crouchAmt; }
  get canUseAbilities() { return this.alive && !this.asleep && !this.stunned; }

  get speedMultiplier() {
    let m = 1;
    if (this.stunned) m *= STATUS.stunSpeed;
    if (this.status.slow > 0) m *= this.status.slowFactor;
    return m;
  }

  /** How much of the spray pattern the camera follows (per weapon). */
  get viewFollow() { return this.loadout?.current.def.recoil.view ?? 1; }
  /** Where the camera looks: your aim, a little of the spray, plus the kick. */
  get viewYaw() { return this.yaw + this.recoilYaw * this.viewFollow + this.punchYaw; }
  get viewPitch() { return this.pitch + this.recoilPitch * this.viewFollow + this.punchPitch; }
  /** Where bullets go before random spread: your aim plus the full spray pattern. */
  get aimYaw() { return this.yaw + this.recoilYaw; }
  get aimPitch() { return this.pitch + this.recoilPitch; }

  setController(controller) {
    this.controller?.detach?.(this);
    this.controller = controller;
    controller?.attach?.(this);
  }

  teleport(x, y, z, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.stepOffset = 0;
    this.dash = null;
  }

  // ---- status effects, healing, shields ----

  applyStatus(type, duration, { factor } = {}) {
    if (!this.alive || duration <= 0) return;
    const s = this.status;
    s[type] = Math.max(s[type] ?? 0, duration);
    if (type === 'slow') s.slowFactor = factor ?? STATUS.slowDefault;
    if (type === 'sleep') this.dash = null;
    if (type === 'blind') s.blindMax = Math.max(s.blind, duration);
    this.onHealthChange?.(this);
  }

  addOvershield(amount, duration) {
    this.bonusShield = Math.max(this.bonusShield, amount);
    this.bonusShieldTime = duration;
    this.onHealthChange?.(this);
  }

  startHeal(amount, duration) {
    this.heals.push({ rate: amount / duration, left: duration });
  }

  get healing() { return this.heals.length > 0; }

  heal(amount) {
    if (!this.alive) return 0;
    const before = this.health;
    this.health = Math.min(this.maxHealth, this.health + amount);
    if (this.health !== before) this.onHealthChange?.(this);
    return this.health - before;
  }

  startDash(dx, dz, speed, duration, trail = null) {
    this.dash = { dx, dz, speed, timer: duration, trail, sinceDrop: Infinity };
    this.vel.y = 0;
  }

  _tickStatus(dt) {
    const s = this.status;
    let changed = false;
    for (const key of ['stun', 'sleep', 'slow', 'revealed', 'blind']) {
      if (s[key] > 0) {
        s[key] = Math.max(0, s[key] - dt);
        if (s[key] === 0) changed = true;
      }
    }
    if (this.bonusShieldTime > 0) {
      this.bonusShieldTime = Math.max(0, this.bonusShieldTime - dt);
      if (this.bonusShieldTime === 0 && this.bonusShield > 0) {
        this.bonusShield = 0;
        changed = true;
      }
    }
    for (let i = this.heals.length - 1; i >= 0; i--) {
      const h = this.heals[i];
      const step = Math.min(dt, h.left);
      this.heal(h.rate * step);
      h.left -= step;
      if (h.left <= 0) this.heals.splice(i, 1);
    }
    if (changed) this.onHealthChange?.(this);
  }

  // ---- simulation ----

  /** One fixed game step. ctx = { world, characters, events, zones, time }. */
  tick(dt, ctx) {
    const world = ctx.world;
    this.prevPos.copy(this.pos);
    if (!this.alive) {
      this.deathTime += dt;
      // Abilities stop ticking when you die, so a placed Shadow Mark would
      // otherwise stay on the map until the next round.
      this.abilities?.clearMarkers();
      return;
    }
    this._tickStatus(dt);

    let intent = this.controller ? this.controller.getIntent(this, dt) : IDLE_INTENT;
    if (this.asleep) intent = IDLE_INTENT;
    else if (this.frozen) {
      intent = {
        ...IDLE_INTENT, switchTo: intent.switchTo, switchDelta: intent.switchDelta, reload: intent.reload,
        crouch: intent.crouch, adsPressed: intent.adsPressed, adsHeld: intent.adsHeld, adsHold: intent.adsHold,
      };
    }
    // Planting or defusing the spike locks you in place (you can still look).
    this.busy = ctx.objective ? ctx.objective.interact(this, intent, dt) : false;
    if (this.busy) intent = { ...IDLE_INTENT, interact: true, crouch: intent.crouch };

    // Crouch smoothly toward the wanted height.
    const crouchTarget = intent.crouch ? 1 : 0;
    const cstep = dt / CROUCH.time;
    this.crouchAmt = crouchTarget > this.crouchAmt
      ? Math.min(crouchTarget, this.crouchAmt + cstep)
      : Math.max(crouchTarget, this.crouchAmt - cstep);

    // Wish direction from facing + input.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * intent.forward + cos * intent.right;
    let wz = -cos * intent.forward - sin * intent.right;
    const wishLen = Math.hypot(wx, wz);
    if (wishLen > 1e-6) {
      wx /= wishLen;
      wz /= wishLen;
    }
    this.wishDir.x = wishLen > 1e-6 ? wx : 0;
    this.wishDir.z = wishLen > 1e-6 ? wz : 0;
    let baseSpeed = intent.walk ? MOVE.walkSpeed : MOVE.runSpeed;
    if (this.crouchAmt > 0.5) baseSpeed = Math.min(baseSpeed, MOVE.crouchSpeed);
    const weaponMult = this.loadout?.moveMultiplier ?? 1;
    const maxSpeed = wishLen > 1e-6 ? baseSpeed * this.speedMultiplier * weaponMult : 0;

    let jumped = false;
    if (this.dash) {
      this._tickDash(dt, ctx);
    } else {
      if (this.onGround) {
        applyFriction(this.vel, dt);
        accelerate(this.vel, wx, wz, maxSpeed, MOVE.accel, dt);
      } else {
        accelerate(this.vel, wx, wz, maxSpeed, MOVE.airAccel, dt, MOVE.airWishCap);
      }

      // Jump (buffered + coyote time so it never feels like it was eaten).
      if (intent.jump) this.jumpBuffer = MOVE.jumpBuffer;
      if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
        this.vel.y = MOVE.jumpSpeed;
        this.onGround = false;
        this.coyote = 0;
        this.jumpBuffer = 0;
        jumped = true;
      }
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.vel.y = Math.max(this.vel.y - MOVE.gravity * dt, -MOVE.maxFall);
    }

    // Move and collide.
    const wasGrounded = this.onGround && !jumped;
    this.onGround = false;
    world.moveCharacter(this, this.vel.x * dt, this.vel.y * dt, this.vel.z * dt, wasGrounded);
    if (!this.onGround && wasGrounded && this.vel.y <= 0) {
      world.snapToGround(this, this.stepHeight);
    }

    this.coyote = this.onGround ? MOVE.coyoteTime : Math.max(0, this.coyote - dt);
    this.stepOffset *= Math.exp(-dt * 16);
    if (Math.abs(this.stepOffset) < 1e-3) this.stepOffset = 0;

    // Stun: the aim drifts randomly.
    if (this.stunned) {
      const sp = (Math.random() - 0.5) * STATUS.stunShake;
      const sy = (Math.random() - 0.5) * STATUS.stunShake;
      this.recoilPitch += sp;
      this.recoilYaw += sy;
      this.punchPitch += sp * 2;
      this.punchYaw += sy * 2;
    }

    this.loadout?.tick(dt, intent, this, ctx);
    this.abilities?.tick(dt, intent, this, ctx);
  }

  _tickDash(dt, ctx) {
    const d = this.dash;
    this.vel.x = d.dx * d.speed;
    this.vel.z = d.dz * d.speed;
    this.vel.y = 0; // dashes are flat
    if (d.trail && ctx.zones) {
      d.sinceDrop += d.speed * dt;
      if (d.sinceDrop >= d.trail.spacing) {
        d.sinceDrop = 0;
        ctx.zones.addFire({ ...d.trail, x: this.pos.x, y: this.pos.y, z: this.pos.z }, ctx.time);
      }
    }
    d.timer -= dt;
    if (d.timer <= 0) {
      this.dash = null;
      // Come out of the dash at normal running speed.
      const speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > MOVE.runSpeed) {
        this.vel.x *= MOVE.runSpeed / speed;
        this.vel.z *= MOVE.runSpeed / speed;
      }
    }
  }

  // ---- combat ----

  /**
   * Bullet hit test against head, body, and legs. Returns { t, part } or null.
   * `at` replaces the position, so a shot can be tested against where this
   * character was drawn on the shooter's screen (see traceShot).
   */
  raycast(o, d, maxT, at = this.pos) {
    if (!this.alive) return null;
    const p = at;
    const H = HITBOX;
    const k = this.bodyScale; // crouching lowers every hitbox
    // Cheap reject first: a sphere around the whole body.
    if (raySphere(o, d, p.x, p.y + 0.9, p.z, 1.1, maxT) === null) return null;

    let best = null;
    const head = raySphere(o, d, p.x, p.y + H.headY * k, p.z, H.headR, maxT);
    if (head !== null) best = { t: head, part: 'head' };
    const body = rayCylinder(o, d, p.x, p.z, H.bodyR, p.y + H.legsTop * k, p.y + H.bodyTop * k, best ? best.t : maxT);
    if (body !== null) best = { t: body, part: 'body' };
    const legs = rayCylinder(o, d, p.x, p.z, H.legsR, p.y, p.y + H.legsTop * k, best ? best.t : maxT);
    if (legs !== null) best = { t: legs, part: 'legs' };
    return best;
  }

  /** Extra shield, then shield, then health. Damage wakes a sleeping character. */
  applyDamage(amount) {
    if (!this.alive || amount <= 0) return { dealt: 0, killed: false };
    let left = amount;
    const toBonus = Math.min(this.bonusShield, left);
    this.bonusShield -= toBonus;
    left -= toBonus;
    const toShield = Math.min(this.shield, left);
    this.shield -= toShield;
    left -= toShield;
    const toHealth = Math.min(this.health, left);
    this.health -= toHealth;
    this.status.sleep = 0;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deathTime = 0;
      this.vel.set(0, 0, 0);
      this.dash = null;
      this.heals.length = 0;
      this.status = freshStatus();
    }
    this.onHealthChange?.(this);
    return { dealt: toBonus + toShield + toHealth, killed: !this.alive };
  }

  revive(x, y, z, yaw) {
    this.teleport(x, y, z, yaw);
    this.health = this.maxHealth;
    this.shield = this.maxShield;
    this.bonusShield = 0;
    this.bonusShieldTime = 0;
    this.heals.length = 0;
    this.status = freshStatus();
    this.alive = true;
    this.deathTime = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.punchPitch = 0;
    this.punchYaw = 0;
    this.crouchAmt = 0;
    this.loadout?.refill();
    this.abilities?.reset();
    this.onHealthChange?.(this);
  }

  // ---- rendering ----

  renderPosition(alpha, out) {
    return out.lerpVectors(this.prevPos, this.pos, alpha);
  }

  eyePosition(alpha, out) {
    this.renderPosition(alpha, out);
    out.y += this.eyeHeight + this.stepOffset;
    return out;
  }

  /**
   * `holdSeen` keeps the previous `seenPos`: while a click waits for the next
   * tick, the shot must use the frame you clicked on, not a newer one.
   */
  syncMesh(alpha, holdSeen = false) {
    this.renderPosition(alpha, this.mesh.position);
    this.mesh.position.y += this.stepOffset;
    if (!holdSeen || !this.seenPos) (this.seenPos ??= new THREE.Vector3()).copy(this.mesh.position);
    this.mesh.rotation.y = this.yaw;
    // Death: tip over backwards.
    const fall = this.alive ? 0 : Math.min(this.deathTime / 0.3, 1);
    this.mesh.rotation.x = fall * fall * (Math.PI / 2) * 0.95;

    const parts = this.mesh.userData;
    const k = this.bodyScale;
    if (parts.body && parts.lastScale !== k) {
      parts.lastScale = k;
      parts.body.scale.y = k;
      parts.body.position.y = (HITBOX.bodyTop / 2) * k;
      parts.head.position.y = HITBOX.headY * k;
      parts.visor.position.y = (HITBOX.headY + 0.02) * k;
      parts.rb.scale.y = k;
      parts.rb.position.y = parts.body.position.y;
      parts.rh.position.y = parts.head.position.y;
    }
    parts.reveal.visible = this.alive && this.revealed;
    parts.stunRing.visible = this.alive && this.stunned;
    if (parts.stunRing.visible) parts.stunRing.rotation.z += 0.15;
    parts.sleepIcon.visible = this.alive && this.asleep;
    if (parts.nameTag) parts.nameTag.visible = this.alive;
  }
}

function applyFriction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 1e-4) {
    vel.x = 0;
    vel.z = 0;
    return;
  }
  const drop = Math.max(speed, MOVE.stopSpeed) * MOVE.friction * dt;
  const scale = Math.max(speed - drop, 0) / speed;
  vel.x *= scale;
  vel.z *= scale;
}

function accelerate(vel, wx, wz, wishSpeed, accel, dt, cap = Infinity) {
  if (wishSpeed <= 0) return;
  const current = vel.x * wx + vel.z * wz;
  const add = Math.min(wishSpeed, cap) - current;
  if (add <= 0) return;
  const step = Math.min(accel * wishSpeed * dt, add);
  vel.x += wx * step;
  vel.z += wz * step;
}

// ---------------------------------------------------------------------------
// Body: a team-colored torso capsule, a head sphere, and a dark visor showing
// which way the character faces. Plus status indicators: a see-through-walls
// outline (revealed), a spinning ring (stunned), and a "Zz" (asleep).
// ---------------------------------------------------------------------------
const bodyGeometry = new THREE.CapsuleGeometry(HITBOX.bodyR, HITBOX.bodyTop - HITBOX.bodyR * 2, 4, 12);
const headGeometry = new THREE.SphereGeometry(HITBOX.headR, 16, 12);
const visorGeometry = new THREE.BoxGeometry(0.26, 0.08, 0.1);
const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.3 });
const revealMaterial = new THREE.MeshBasicMaterial({
  color: 0xff5ad8, transparent: true, opacity: 0.55, depthTest: false, depthWrite: false,
});
const stunGeometry = new THREE.TorusGeometry(0.28, 0.035, 6, 24);
const stunMaterial = new THREE.MeshBasicMaterial({ color: 0xffe14a });
const teamMaterials = {};
let sleepTexture = null;

function makeSleepTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#c9a8ff';
  g.font = 'bold 34px sans-serif';
  g.fillText('Z', 8, 44);
  g.font = 'bold 22px sans-serif';
  g.fillText('z', 38, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildBody(c) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ'; // yaw first, so the death tilt is in the body's own frame
  const material = (teamMaterials[c.team] ??= new THREE.MeshStandardMaterial({
    color: TEAM_COLORS[c.team] ?? 0xaaaaaa,
    roughness: 0.6,
  }));

  const body = new THREE.Mesh(bodyGeometry, material);
  body.position.y = HITBOX.bodyTop / 2;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(headGeometry, material);
  head.position.y = HITBOX.headY;
  head.castShadow = true;
  group.add(head);

  const visor = new THREE.Mesh(visorGeometry, visorMaterial);
  visor.position.set(0, HITBOX.headY + 0.02, -HITBOX.headR + 0.03);
  group.add(visor);

  // Revealed outline, drawn on top of walls.
  const reveal = new THREE.Group();
  const rb = new THREE.Mesh(bodyGeometry, revealMaterial);
  rb.position.y = body.position.y;
  const rh = new THREE.Mesh(headGeometry, revealMaterial);
  rh.position.y = head.position.y;
  for (const m of [rb, rh]) m.renderOrder = 999;
  reveal.add(rb, rh);
  reveal.visible = false;
  group.add(reveal);

  const stunRing = new THREE.Mesh(stunGeometry, stunMaterial);
  stunRing.rotation.x = Math.PI / 2;
  stunRing.position.y = HITBOX.headY + 0.32;
  stunRing.visible = false;
  group.add(stunRing);

  let sleepIcon;
  if (typeof document !== 'undefined') {
    sleepTexture ??= makeSleepTexture();
    sleepIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: sleepTexture, depthWrite: false }));
    sleepIcon.scale.set(0.5, 0.5, 1);
    sleepIcon.position.set(0.3, HITBOX.headY + 0.85, 0);
  } else {
    sleepIcon = new THREE.Object3D(); // headless tests
  }
  sleepIcon.visible = false;
  group.add(sleepIcon);

  group.userData = { reveal, stunRing, sleepIcon, body, head, visor, rb, rh, lastScale: 1 };
  return group;
}
