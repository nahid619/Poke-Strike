// Animated bodies, built and animated entirely in code (no model files).
//
// Each character is a simple jointed figure: hips, a torso, a head with a
// visor, two arms holding the current gun, and legs with knees and feet. The
// joints are posed every frame from what the character is doing:
//   - walking and running: the legs step in the direction of movement (one
//     step every 2.3 m, the same rhythm as the footstep sounds), the hips bob,
//     and the torso leans into the movement
//   - crouching: the knees bend and the hips drop
//   - aiming: the arms and gun follow where the character looks, up or down;
//     the gun kicks when it fires and dips during a reload
//   - getting hit: the torso and head flinch away from the shot
//   - dying: the knees buckle and the body falls away from the killing shot
//
// The head and torso always sit exactly on the hitboxes (HITBOX in
// character.js), standing or crouched, so what you see is what you hit.
// Arms and legs are placed with two-bone inverse kinematics: we decide where
// the hand or foot should be, and solve for the elbow or knee.
import * as THREE from 'three';

export const RIG = {
  hipX: 0.12, thigh: 0.42, shin: 0.4, ankle: 0.035,   // legs (meters)
  shoulderX: 0.25, upperArm: 0.27, forearm: 0.26,      // arms
  chestY: 0.29, shoulderY: 0.46, headY: 0.73,          // above the hips, standing
  stride: 2.3,        // meters per step (matches FOOTSTEPS.stride)
  stepReach: 0.3,     // how far a foot reaches forward and back at full run
  stepLift: 0.16,     // how high a foot lifts at full run
  lean: 0.1,          // forward lean at full run (radians)
  flinchTime: 0.22,   // seconds a flinch takes to settle
  deathTime: 0.9,     // seconds from the killing shot to lying still
};

const UP = new THREE.Vector3(0, 1, 0);
const DARK = 0x262a33;

// ---- shared geometry and materials (one set for every character) ----
const seg = (r0, r1, len) => new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0);
const GEO = {
  chest: new THREE.CapsuleGeometry(0.25, 0.16, 4, 12),
  belt: new THREE.CylinderGeometry(0.2, 0.2, 0.12, 12),
  head: new THREE.SphereGeometry(0.2, 16, 12),
  visor: new THREE.BoxGeometry(0.26, 0.08, 0.1),
  pad: new THREE.BoxGeometry(0.15, 0.08, 0.17),
  stripe: new THREE.BoxGeometry(0.3, 0.06, 0.02),
  thigh: seg(0.095, 0.08, RIG.thigh),
  shin: seg(0.08, 0.06, RIG.shin),
  foot: new THREE.BoxGeometry(0.11, 0.07, 0.24),
  upperArm: seg(0.065, 0.055, RIG.upperArm),
  forearm: seg(0.055, 0.045, RIG.forearm),
  hand: new THREE.SphereGeometry(0.05, 8, 6),
};
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// Guns, in the aim frame (x right, y up, -z forward from the shoulders).
const GUNS = {
  rifle: [box(0.06, 0.08, 0.6, 0.1, -0.06, -0.33), box(0.04, 0.12, 0.06, 0.1, -0.15, -0.3), box(0.05, 0.08, 0.16, 0.1, -0.07, 0.02)],
  sniper: [box(0.06, 0.08, 0.85, 0.1, -0.06, -0.42), new THREE.CylinderGeometry(0.03, 0.03, 0.26, 10).rotateX(Math.PI / 2).translate(0.1, 0.01, -0.3),
    box(0.05, 0.09, 0.18, 0.1, -0.07, 0.04)],
  pistol: [box(0.05, 0.07, 0.19, 0.1, -0.05, -0.36), box(0.04, 0.1, 0.05, 0.1, -0.11, -0.3)],
  smg: [box(0.06, 0.08, 0.4, 0.1, -0.06, -0.26), box(0.035, 0.18, 0.05, 0.1, -0.17, -0.24), box(0.04, 0.06, 0.12, 0.1, -0.06, 0.0)],
  shotgun: [box(0.08, 0.1, 0.55, 0.1, -0.06, -0.3), new THREE.CylinderGeometry(0.03, 0.03, 0.2, 10).rotateX(Math.PI / 2).translate(0.1, -0.06, -0.65),
    box(0.06, 0.09, 0.16, 0.1, -0.07, 0.03)],
  marksman: [box(0.06, 0.08, 0.7, 0.1, -0.06, -0.37), new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10).rotateX(Math.PI / 2).translate(0.1, 0.0, -0.26),
    box(0.05, 0.08, 0.16, 0.1, -0.07, 0.02)],
  carbine: [box(0.06, 0.08, 0.56, 0.1, -0.06, -0.31), new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10).rotateX(Math.PI / 2).translate(0.1, -0.05, -0.7),
    box(0.04, 0.12, 0.06, 0.1, -0.15, -0.28), box(0.05, 0.08, 0.16, 0.1, -0.07, 0.02)],
};
// Where the hands hold each gun (aim frame): [right hand, left hand].
const GRIPS = {
  rifle: [[0.1, -0.12, -0.14], [0.09, -0.1, -0.48]],
  sniper: [[0.1, -0.12, -0.14], [0.09, -0.1, -0.58]],
  pistol: [[0.1, -0.1, -0.31], [0.05, -0.11, -0.3]],
  smg: [[0.1, -0.12, -0.14], [0.09, -0.1, -0.4]],
  shotgun: [[0.1, -0.12, -0.14], [0.09, -0.11, -0.46]],
  marksman: [[0.1, -0.12, -0.14], [0.09, -0.1, -0.5]],
  carbine: [[0.1, -0.12, -0.14], [0.09, -0.1, -0.46]],
};
const gunMaterial = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.5, metalness: 0.3 });
const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1f2a, roughness: 0.3 });
const materials = new Map();
const mat = (color, roughness = 0.6) => {
  const key = `${color}|${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness }));
  return materials.get(key);
};

/**
 * Build the figure. Returns the root group (the character's mesh) and its
 * parts. `revealMaterial` draws the see-through-walls outline when revealed.
 */
export function buildRig({ color, revealMaterial }) {
  const team = mat(color);
  const dark = mat(new THREE.Color(color).multiplyScalar(0.55).getHex(), 0.7);
  const add = (parent, geo, material, shadow = true) => {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();   // tips over when dying, pivoting at the feet
  root.add(body);
  const spine = new THREE.Group();  // at the hips; leans and flinches
  body.add(spine);
  const chest = add(spine, GEO.chest, team);
  chest.scale.z = 0.8;
  const stripe = add(spine, GEO.stripe, team, false); // agent color, set later
  const belt = add(body, GEO.belt, dark);
  const shoulders = new THREE.Group();
  spine.add(shoulders);
  const pads = [-1, 1].map((s) => {
    const p = add(shoulders, GEO.pad, team);
    p.position.set(s * RIG.shoulderX, 0.04, 0);
    return p;
  });
  // The head is not part of the leaning spine, so it always sits on its hitbox.
  const neck = new THREE.Group();
  body.add(neck);
  const head = add(neck, GEO.head, team);
  head.position.y = 0.17;
  const visor = add(neck, GEO.visor, visorMaterial, false);
  visor.position.set(0, 0.19, -0.17);

  const aim = new THREE.Group();     // pitches with where the character looks
  shoulders.add(aim);
  const guns = {};
  for (const [id, parts] of Object.entries(GUNS)) {
    const g = new THREE.Group();
    for (const geo of parts) add(g, geo, gunMaterial);
    g.visible = false;
    aim.add(g);
    guns[id] = g;
  }
  const arms = [-1, 1].map((s) => ({
    s,
    upper: add(shoulders, GEO.upperArm, team),
    fore: add(shoulders, GEO.forearm, team),
    hand: add(shoulders, GEO.hand, dark),
  }));
  const legs = [-1, 1].map((s) => ({
    s,
    thigh: add(body, GEO.thigh, dark),
    shin: add(body, GEO.shin, dark),
    foot: add(body, GEO.foot, mat(DARK, 0.8)),
  }));

  // The revealed outline: a copy of the main shapes that follows each part.
  const reveal = [];
  for (const m of [chest, head, belt, ...arms.flatMap((a) => [a.upper, a.fore]), ...legs.flatMap((l) => [l.thigh, l.shin])]) {
    const r = new THREE.Mesh(m.geometry, revealMaterial);
    r.renderOrder = 999;
    r.visible = false;
    m.add(r);
    reveal.push(r);
  }

  const parts = {
    body, spine, chest, stripe, belt, shoulders, pads, neck, head, visor, aim, guns, arms, legs, reveal,
    anim: freshAnim(),
  };
  return { root, parts };
}

function freshAnim() {
  return {
    phase: Math.random() * Math.PI * 2, speed: 0, air: 0, crouch: 0, lean: 0, roll: 0,
    flinch: 0, hit: { x: 0, z: 1 }, head: false, kick: 0, reload: 0,
    dead: false, fall: { x: 0, z: 1 }, time: Math.random() * 10, gun: null, agent: null, revealed: false,
  };
}

// ---- scratch vectors (no allocation per frame) ----
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Vector3();
const _S = new THREE.Vector3();
const _T = new THREE.Vector3();
const _J = new THREE.Vector3();
const _E = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();

/**
 * Two-bone IK: from S toward target T with bone lengths a and b, bending the
 * middle joint toward `pole`. Writes the joint and the (reachable) end.
 */
export function solveTwoBone(S, T, a, b, pole, joint, end) {
  _d.subVectors(T, S);
  let d = _d.length();
  if (d < 1e-6) _d.set(0, -1, 0);
  else _d.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-4), a + b - 1e-4);
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-10) _p.set(0, 0, -1);
  else _p.normalize();
  joint.copy(S).addScaledVector(_d, a * cosA).addScaledVector(_p, a * sinA);
  end.copy(S).addScaledVector(_d, d);
}

/** Put a limb segment (built along +Y from its base) from `from` to `to`. */
function place(mesh, from, to) {
  _e.subVectors(to, from);
  const len = _e.length();
  mesh.position.copy(from);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _e.divideScalar(len));
}

/** A point in the aim frame, in shoulder space: rotate about X by the aim pitch. */
function fromAim(out, [x, y, z], pitch, aimY) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  return out.set(x, aimY + y * c - z * s, y * s + z * c);
}

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const approach = (v, target, rate, dt) => v + (target - v) * Math.min(1, rate * dt);

/** The shot that hit this character came from `from` (for flinches and death falls). */
export function rigHit(parts, c, from, part) {
  const a = parts.anim;
  let dx = c.pos.x - from.x;
  let dz = c.pos.z - from.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  // World direction to the body's own frame (it faces -Z after its yaw).
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  a.hit = { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
  a.flinch = 1;
  a.head = part === 'head';
}

export function rigFire(parts) {
  parts.anim.kick = 1;
}

/** Pose the figure for this frame. `dt` is the frame time (0 while paused). */
export function animateRig(parts, c, dt, hitbox) {
  const a = parts.anim;
  a.time += dt;
  const k = c.bodyScale;

  // Agent color on the chest stripe and shoulder pads.
  const agent = c.agent?.id ?? null;
  if (a.agent !== agent) {
    a.agent = agent;
    const accent = c.agent?.color ? mat(new THREE.Color(c.agent.color).getHex(), 0.5) : parts.chest.material;
    parts.stripe.material = accent;
    for (const p of parts.pads) p.material = accent;
  }
  // The gun in hand.
  const def = c.loadout?.current?.def;
  const gun = GUNS[def?.id] ? def.id : def?.slot === 'secondary' ? 'pistol' : 'rifle'; // every sidearm uses the pistol shape
  if (a.gun !== gun) {
    for (const [id, g] of Object.entries(parts.guns)) g.visible = id === gun;
    a.gun = gun;
  }
  const revealed = c.alive && c.revealed;
  if (a.revealed !== revealed) {
    a.revealed = revealed;
    for (const r of parts.reveal) r.visible = revealed;
  }

  // Movement in the body's own frame: x right, z backward (-z is forward).
  const cos = Math.cos(c.yaw);
  const sin = Math.sin(c.yaw);
  const lx = c.vel.x * cos - c.vel.z * sin;
  const lz = c.vel.x * sin + c.vel.z * cos;
  const speed = c.alive ? Math.hypot(lx, lz) : 0;
  a.speed = approach(a.speed, Math.min(1, speed / 6.75), 10, dt);
  a.air = approach(a.air, c.onGround || !c.alive ? 0 : 1, 12, dt);
  if (c.onGround) a.phase += (speed * dt * Math.PI) / RIG.stride; // half a cycle per step
  const dirX = speed > 0.2 ? lx / speed : 0;
  const dirZ = speed > 0.2 ? lz / speed : -1;
  a.flinch = Math.max(0, a.flinch - dt / RIG.flinchTime);
  a.kick = Math.max(0, a.kick - dt * 9);
  a.reload = approach(a.reload, c.loadout?.reloading ? 1 : 0, 8, dt);

  // ---- dying: knees buckle, then the body falls away from the shot
  if (!c.alive && !a.dead) {
    a.dead = true;
    const h = a.hit;
    const len = Math.hypot(h.x, h.z);
    a.fall = len > 0.1 ? { x: h.x / len, z: h.z / len } : { x: 0, z: 1 };
  } else if (c.alive && a.dead) {
    a.dead = false;
    parts.body.quaternion.identity();
  }
  const t = a.dead ? c.deathTime : 0;
  const buckle = a.dead ? smooth(clamp01(t / 0.3)) : 0;
  let topple = 0;
  if (a.dead) {
    const u = clamp01((t - 0.12) / (RIG.deathTime - 0.3));
    topple = u * u * 1.43; // falls faster and faster, like gravity...
    if (topple > 1) {
      // ...then a small bounce as it hits the ground.
      const after = (t - 0.12) - (RIG.deathTime - 0.3) / Math.sqrt(1.43);
      topple = 1 - 0.06 * Math.abs(Math.sin(after * 14)) * Math.exp(-after * 7);
    }
    _axis.set(a.fall.z, 0, -a.fall.x).normalize();
    parts.body.quaternion.setFromAxisAngle(_axis, topple * Math.PI * 0.48);
  }

  // ---- hips and legs
  const run = a.speed;
  const crouchDrop = hitbox.legsTop * (1 - k);
  let hipY = hitbox.legsTop - crouchDrop - 0.05 * run - 0.03 * run * Math.abs(Math.cos(a.phase)) - 0.12 * a.air;
  if (a.dead) hipY = THREE.MathUtils.lerp(hipY, 0.5 + 0.25 * clamp01(topple), buckle);
  const reach = RIG.stepReach * run * (1 - 0.4 * c.crouchAmt);
  const lift = RIG.stepLift * run * (1 - 0.5 * c.crouchAmt);
  for (const leg of parts.legs) {
    const ph = a.phase + (leg.s > 0 ? 0 : Math.PI);
    const off = reach * Math.sin(ph);
    const up = lift * Math.max(0, Math.cos(ph)) + 0.22 * a.air * (leg.s > 0 ? 1 : 0.7);
    _S.set(leg.s * RIG.hipX, hipY, 0);
    _T.set(leg.s * (RIG.hipX + 0.02) + dirX * off, RIG.ankle + up, dirZ * off - 0.1 * a.air);
    if (a.dead) _T.z -= 0.25 * buckle * (leg.s > 0 ? 1 : 0.6); // knees fold forward
    _pole.set(leg.s * 0.15, 0, -1); // knees bend forward
    solveTwoBone(_S, _T, RIG.thigh, RIG.shin, _pole, _J, _E);
    place(leg.thigh, _S, _J);
    place(leg.shin, _J, _E);
    leg.foot.position.set(_E.x, _E.y - 0.005, _E.z - 0.06);
    leg.foot.rotation.x = -0.35 * run * Math.cos(ph) * (dirZ < 0 ? 1 : -1);
  }

  // ---- torso: on the hips, leaning into the movement, flinching from hits
  const forward = -dirZ * run;
  a.lean = approach(a.lean, RIG.lean * forward + 0.18 * c.crouchAmt, 8, dt);
  a.roll = approach(a.roll, -0.06 * dirX * run, 8, dt);
  const breathe = Math.sin(a.time * 1.7) * 0.012 * (1 - run);
  const f = a.flinch * a.flinch * (a.head ? 0.15 : 0.3);
  parts.spine.position.y = hipY;
  parts.spine.rotation.set(-a.lean + breathe + f * a.hit.z + (a.dead ? 0.5 * buckle * -a.fall.z : 0),
    0, a.roll - f * a.hit.x);
  parts.chest.position.y = RIG.chestY * k;
  parts.chest.scale.y = k;
  parts.stripe.position.set(0, (RIG.chestY + 0.12) * k, -0.2);
  parts.belt.position.y = hipY;
  parts.shoulders.position.y = RIG.shoulderY * k - 0.02 * c.crouchAmt;

  // ---- head: on the head hitbox, turning with the aim. It ignores the
  // small lean (so it stays on its hitbox) but follows the torso through a
  // flinch or a death fall, so it never comes apart from the body.
  const bendX = f * a.hit.z + (a.dead ? 0.5 * buckle * -a.fall.z : 0);
  const bendZ = -f * a.hit.x;
  // Alive: the head stays at its hitbox height. Dying: it rides on the hips as they drop.
  const neckLen = THREE.MathUtils.lerp(hitbox.headY * k - 0.17 - hipY, (hitbox.headY - hitbox.legsTop) * k - 0.17, buckle);
  _e.set(0, neckLen, 0).applyEuler(_euler.set(bendX, 0, bendZ));
  parts.neck.position.set(_e.x, hipY + _e.y, _e.z);
  const pitch = Math.max(-1, Math.min(1, c.viewPitch ?? c.pitch ?? 0));
  const hf = a.head ? a.flinch * a.flinch * 0.45 : 0;
  parts.neck.rotation.set(bendX + pitch * 0.6 + hf * a.hit.z + (a.dead ? -0.6 * buckle : 0), 0, bendZ - hf * a.hit.x);

  // ---- arms and gun: follow the aim; kick on fire; dip during reloads; go limp when dead
  const aimPitch = a.dead ? THREE.MathUtils.lerp(pitch, -1.2, buckle) : pitch + a.kick * 0.09 - a.reload * 0.55;
  parts.aim.rotation.set(aimPitch, 0, -a.reload * 0.35);
  parts.aim.position.set(0, -0.03, a.kick * 0.04);
  const grips = GRIPS[gun];
  for (const arm of parts.arms) {
    const grip = grips[arm.s > 0 ? 0 : 1];
    _S.set(arm.s * RIG.shoulderX, 0, 0);
    fromAim(_T, grip, aimPitch, -0.03);
    _T.z += a.kick * 0.04;
    if (arm.s < 0 && a.reload > 0) _T.lerp(_E.set(0.05, -0.32, -0.15), a.reload * 0.8); // reaching for a magazine
    _pole.set(arm.s * 0.8, -1, 0.35); // elbows down and out
    solveTwoBone(_S, _T, RIG.upperArm, RIG.forearm, _pole, _J, _E);
    place(arm.upper, _S, _J);
    place(arm.fore, _J, _E);
    arm.hand.position.copy(_E);
  }
}
