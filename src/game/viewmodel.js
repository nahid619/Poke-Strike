// First-person gun model. Drawn in its own scene with its own camera, on top
// of the world, so it never clips into walls and keeps a steady FOV.
//
// Animation is spring-based so it settles smoothly at any frame rate:
// recoil kicks the gun back and up and it springs home, aiming down sights
// glides the gun to the center of the screen, and reloads drop the magazine.
import * as THREE from 'three';

const GUN_DARK = 0x2a2e37;
const GUN_MID = 0x3c4250;
const GUN_ACCENT = 0xffcf3a;
const GLASS = 0x6fb6ff;

function part(geo, color, x, y, z, rx = 0, opts = {}) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...opts }));
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tube = (r, len, seg = 12) => new THREE.CylinderGeometry(r, r, len, seg);

function buildRifle() {
  const g = new THREE.Group();
  g.add(part(box(0.06, 0.08, 0.42), GUN_DARK, 0, 0, -0.05));          // receiver
  g.add(part(box(0.055, 0.06, 0.18), GUN_MID, 0, -0.005, -0.33));      // handguard
  g.add(part(tube(0.012, 0.16, 10), GUN_DARK, 0, 0.005, -0.5, Math.PI / 2)); // barrel
  const mag = part(box(0.04, 0.13, 0.065), GUN_DARK, 0, -0.1, -0.08, 0.2);  // magazine
  g.add(mag);
  g.add(part(box(0.045, 0.09, 0.05), GUN_MID, 0, -0.075, 0.08, -0.35)); // grip
  g.add(part(box(0.05, 0.075, 0.17), GUN_MID, 0, -0.01, 0.23));        // stock
  g.add(part(box(0.03, 0.03, 0.07), GUN_DARK, 0, 0.055, -0.02));       // sight body
  g.add(part(box(0.022, 0.006, 0.01), GUN_ACCENT, 0, 0.072, -0.05));   // sight blade
  g.scale.setScalar(0.55);
  return {
    group: g, mag, magHome: mag.position.clone(),
    hip: new THREE.Vector3(0.19, -0.185, -0.5),
    // Sight centered on screen, gun pulled in toward the eye.
    ads: new THREE.Vector3(0, -0.044, -0.48),
    muzzle: new THREE.Vector3(0, 0.005, -0.59),
    kick: { back: 0.03, up: 0.045, side: 0.012 },
  };
}

function buildSniper() {
  const g = new THREE.Group();
  g.add(part(box(0.06, 0.075, 0.36), GUN_DARK, 0, 0, -0.02));            // receiver
  g.add(part(box(0.058, 0.055, 0.26), GUN_MID, 0, -0.01, -0.32));        // forend
  g.add(part(tube(0.014, 0.42, 12), GUN_DARK, 0, 0.01, -0.62, Math.PI / 2)); // long barrel
  g.add(part(box(0.03, 0.03, 0.06), GUN_DARK, 0, 0.01, -0.85));          // muzzle brake
  // Scope: a tube with lenses on top.
  g.add(part(tube(0.026, 0.26, 16), GUN_DARK, 0, 0.075, -0.06, Math.PI / 2));
  g.add(part(tube(0.032, 0.05, 16), GUN_DARK, 0, 0.075, -0.2, Math.PI / 2));
  g.add(part(tube(0.03, 0.005, 16), GLASS, 0, 0.075, -0.226, Math.PI / 2, { metalness: 0.6, roughness: 0.1 }));
  g.add(part(box(0.02, 0.03, 0.03), GUN_MID, 0, 0.045, -0.12));          // scope mounts
  g.add(part(box(0.02, 0.03, 0.03), GUN_MID, 0, 0.045, 0.02));
  const mag = part(box(0.045, 0.08, 0.07), GUN_DARK, 0, -0.07, -0.05, 0.1);
  g.add(mag);
  g.add(part(box(0.045, 0.09, 0.05), GUN_MID, 0, -0.075, 0.12, -0.35));  // grip
  g.add(part(box(0.055, 0.09, 0.22), GUN_MID, 0, -0.015, 0.28));         // stock
  g.add(part(box(0.06, 0.012, 0.1), GUN_ACCENT, 0, 0.04, 0.3));          // cheek-rest stripe
  // The bolt handle slides back after each shot.
  const bolt = new THREE.Group();
  bolt.add(part(tube(0.007, 0.06, 8), GUN_MID, 0.035, 0.02, 0, 0));
  bolt.children[0].rotation.z = Math.PI / 2;
  bolt.add(part(new THREE.SphereGeometry(0.014, 10, 8), GUN_ACCENT, 0.068, 0.02, 0));
  bolt.position.set(0, 0, 0.08);
  g.add(bolt);
  g.scale.setScalar(0.52);
  return {
    group: g, mag, magHome: mag.position.clone(), bolt, boltHome: bolt.position.clone(),
    hip: new THREE.Vector3(0.2, -0.2, -0.52),
    ads: new THREE.Vector3(0, -0.06, -0.3),
    muzzle: new THREE.Vector3(0, 0.01, -0.9),
    kick: { back: 0.09, up: 0.14, side: 0.02 },
  };
}

function buildPistol() {
  const g = new THREE.Group();
  g.add(part(box(0.045, 0.05, 0.2), GUN_DARK, 0, 0, -0.02));           // slide
  g.add(part(box(0.04, 0.035, 0.17), GUN_MID, 0, -0.04, -0.015));      // frame
  const grip = part(box(0.04, 0.12, 0.055), GUN_MID, 0, -0.1, 0.06, -0.25);
  g.add(grip);
  g.add(part(box(0.047, 0.012, 0.05), GUN_ACCENT, 0, 0.02, 0.05));     // accent stripe
  g.scale.setScalar(0.7);
  return {
    group: g, mag: grip, magHome: grip.position.clone(),
    hip: new THREE.Vector3(0.13, -0.13, -0.42),
    ads: null,
    muzzle: new THREE.Vector3(0, 0, -0.13),
    kick: { back: 0.045, up: 0.13, side: 0.02 },
  };
}

// The rest of the arsenal, built from the same parts.
function buildSmg() {
  const g = new THREE.Group();
  g.add(part(box(0.055, 0.075, 0.3), GUN_DARK, 0, 0, -0.04));            // receiver
  g.add(part(tube(0.011, 0.1, 10), GUN_DARK, 0, 0.005, -0.24, Math.PI / 2)); // barrel
  const mag = part(box(0.035, 0.2, 0.05), GUN_DARK, 0, -0.13, -0.1, 0.05); // long magazine
  g.add(mag);
  g.add(part(box(0.045, 0.09, 0.05), GUN_MID, 0, -0.075, 0.06, -0.35));  // grip
  g.add(part(box(0.04, 0.05, 0.14), GUN_MID, 0, -0.01, 0.17));           // folding stock
  g.add(part(box(0.022, 0.006, 0.01), GUN_ACCENT, 0, 0.045, -0.06));     // sight
  g.scale.setScalar(0.58);
  return {
    group: g, mag, magHome: mag.position.clone(),
    hip: new THREE.Vector3(0.18, -0.18, -0.46), ads: new THREE.Vector3(0, -0.03, -0.42),
    muzzle: new THREE.Vector3(0, 0.005, -0.3), kick: { back: 0.018, up: 0.025, side: 0.01 },
  };
}

function buildShotgun() {
  const g = new THREE.Group();
  g.add(part(box(0.07, 0.09, 0.4), GUN_DARK, 0, 0, -0.05));              // receiver
  g.add(part(tube(0.022, 0.34, 12), GUN_DARK, 0, 0.012, -0.4, Math.PI / 2)); // fat barrel
  const mag = part(box(0.05, 0.05, 0.22), GUN_MID, 0, -0.055, -0.32);     // pump
  g.add(mag);
  g.add(part(box(0.05, 0.1, 0.05), GUN_MID, 0, -0.08, 0.08, -0.35));     // grip
  g.add(part(box(0.06, 0.09, 0.2), GUN_MID, 0, -0.015, 0.25));           // stock
  g.add(part(box(0.072, 0.012, 0.08), GUN_ACCENT, 0, 0.05, -0.02));      // stripe
  g.scale.setScalar(0.55);
  return {
    group: g, mag, magHome: mag.position.clone(),
    hip: new THREE.Vector3(0.19, -0.19, -0.5), ads: null,
    muzzle: new THREE.Vector3(0, 0.012, -0.58), kick: { back: 0.07, up: 0.12, side: 0.02 },
  };
}

function buildMarksman() {
  const m = buildRifle();
  const g = m.group;
  g.add(part(tube(0.012, 0.16, 10), GUN_DARK, 0, 0.005, -0.64, Math.PI / 2)); // longer barrel
  g.add(part(tube(0.018, 0.12, 12), GUN_DARK, 0, 0.07, -0.1, Math.PI / 2));  // small scope
  g.add(part(box(0.058, 0.014, 0.12), GUN_ACCENT, 0, -0.04, -0.33));         // stripe
  return { ...m, muzzle: new THREE.Vector3(0, 0.005, -0.72), ads: new THREE.Vector3(0, -0.062, -0.42), kick: { back: 0.04, up: 0.07, side: 0.01 } };
}

function buildCarbine() {
  const m = buildRifle();
  m.group.add(part(tube(0.026, 0.2, 12), GUN_MID, 0, 0.005, -0.66, Math.PI / 2)); // suppressor
  return { ...m, muzzle: new THREE.Vector3(0, 0.005, -0.76), kick: { back: 0.025, up: 0.035, side: 0.01 } };
}

function buildSidearm(suppressed) {
  const m = buildPistol();
  if (suppressed) m.group.add(part(tube(0.017, 0.13, 10), GUN_MID, 0, 0.002, -0.19, Math.PI / 2));
  else m.group.scale.setScalar(0.62);
  return { ...m, muzzle: new THREE.Vector3(0, 0, suppressed ? -0.24 : -0.12) };
}

/** A damped spring toward 0. */
class Spring {
  constructor(stiffness = 220, damping = 0.75) {
    this.x = 0;
    this.v = 0;
    this.k = stiffness;
    this.c = 2 * Math.sqrt(stiffness) * damping;
  }

  step(dt) {
    // Small substeps keep it stable on slow frames.
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      this.v += (-this.k * this.x - this.c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    return this.x;
  }
}

const ease = (k) => 1 - Math.pow(1 - k, 3);
const smooth = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.min(1, Math.max(0, k));

export class Viewmodel {
  constructor(aspect) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x3a3630, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(-1, 2, 1.5);
    this.scene.add(key);

    this.root = new THREE.Group(); // bob, sway, and animations move this
    this.scene.add(this.root);

    this.models = {
      rifle: buildRifle(), sniper: buildSniper(), pistol: buildPistol(), smg: buildSmg(), shotgun: buildShotgun(),
      marksman: buildMarksman(), carbine: buildCarbine(), sidearm: buildSidearm(false), lightpistol: buildSidearm(true),
    };
    for (const m of Object.values(this.models)) {
      m.group.visible = false;
      m.group.position.copy(m.hip);
      this.root.add(m.group);
    }

    // Muzzle flash: two crossed additive planes.
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffd27a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.flash = new THREE.Group();
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), flashMat);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.22), flashMat);
    b.rotation.y = Math.PI / 2;
    this.flash.add(a, b);
    this.flash.visible = false;
    this.flashTime = 0;

    this.active = null;
    this.springs = {
      back: new Spring(260, 0.8),   // recoil push toward the camera
      pitch: new Spring(200, 0.7),  // recoil tilt up
      yaw: new Spring(200, 0.8),
      land: new Spring(160, 0.6),   // landing dip
    };
    this.bobPhase = 0;
    this.bobAmount = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.wasOnGround = true;
    this.lastVy = 0;
    this._v = new THREE.Vector3();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  show(weaponId) {
    if (this.active?.id === weaponId) return;
    const id = this.models[weaponId] ? weaponId : 'rifle';
    for (const [key, m] of Object.entries(this.models)) m.group.visible = key === id;
    this.active = { id: weaponId, model: this.models[id] };
    this.active.model.group.add(this.flash);
    this.flash.position.copy(this.active.model.muzzle);
    for (const s of Object.values(this.springs)) { s.x = 0; s.v = 0; }
  }

  onFire() {
    const m = this.active?.model;
    if (!m) return;
    const adsDamp = 1 - 0.6 * (this.ads ?? 0); // zoomed in, the gun barely moves
    const s = this.springs;
    s.back.v += m.kick.back * 30 * adsDamp;
    s.pitch.v += m.kick.up * 30 * adsDamp;
    s.yaw.v += (Math.random() * 2 - 1) * m.kick.side * 30 * adsDamp;
    this.flashTime = 0.04;
    this.flash.rotation.z = Math.random() * Math.PI;
    const sc = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(sc, sc, sc);
  }

  /**
   * state: { weaponId, equip (0..1), reload (0..1, 0 when not reloading),
   *          speed (0..1 of run speed), onGround, vy, lookX, lookY (mouse counts
   *          this frame), ads (0..1), crouch (0..1), chamber (0..1), walking }
   */
  update(dt, state) {
    this.show(state.weaponId);
    const m = this.active.model;
    const ads = m.ads ? state.ads ?? 0 : 0;
    this.ads = ads;
    const adsK = smooth(ads);
    const hipK = 1 - adsK;

    // Walk bob: gentle, and almost none while zoomed.
    const moving = state.onGround && state.speed > 0.05;
    this.bobAmount += ((moving ? state.speed : 0) - this.bobAmount) * Math.min(1, dt * 10);
    if (moving) this.bobPhase += dt * (5 + 6 * state.speed);
    const bob = this.bobAmount * (0.25 + 0.75 * hipK);
    const bobX = Math.cos(this.bobPhase) * 0.009 * bob;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.011 * bob;

    // Sway: a small, quick lag behind the mouse (too much feels like input lag).
    const swayRate = Math.min(1, dt * 18);
    this.swayX += (-state.lookX * 0.00006 - this.swayX) * swayRate;
    this.swayY += (state.lookY * 0.00006 - this.swayY) * swayRate;
    const swayX = Math.max(-0.02, Math.min(0.02, this.swayX)) * (0.3 + 0.7 * hipK);
    const swayY = Math.max(-0.02, Math.min(0.02, this.swayY)) * (0.3 + 0.7 * hipK);

    // Landing: a little dip that springs back.
    if (state.onGround && !this.wasOnGround) this.springs.land.v -= Math.min(1.2, Math.abs(this.lastVy) * 0.08);
    this.wasOnGround = state.onGround;
    this.lastVy = state.vy ?? 0;

    const back = this.springs.back.step(dt);
    const pitch = this.springs.pitch.step(dt);
    const yaw = this.springs.yaw.step(dt);
    const land = this.springs.land.step(dt);

    // Reload: tilt the gun, drop the magazine out, bring a fresh one in.
    const r = state.reload;
    const tilt = r > 0 ? smooth(clamp01(r / 0.2)) * smooth(clamp01((1 - r) / 0.2)) : 0;
    let magDrop = 0;
    if (r > 0) {
      if (r < 0.45) magDrop = smooth(clamp01((r - 0.12) / 0.25));   // out
      else magDrop = 1 - smooth(clamp01((r - 0.5) / 0.3));          // back in
    }
    if (m.mag) {
      m.mag.position.copy(m.magHome);
      m.mag.position.y -= magDrop * 0.35;
      m.mag.position.z += magDrop * 0.05;
    }

    // Sniper bolt: back and forward after each shot.
    let boltK = 0;
    if (m.bolt) {
      const c = state.chamber ?? 0;
      if (c > 0) boltK = c < 0.5 ? smooth(clamp01((c - 0.1) / 0.3)) : 1 - smooth(clamp01((c - 0.5) / 0.3));
      m.bolt.position.copy(m.boltHome);
      m.bolt.position.z += boltK * 0.12;
      m.bolt.rotation.z = -boltK * 0.9;
    }

    // Equip: rise from below with a little roll.
    const lower = 1 - ease(clamp01(state.equip));
    const crouch = state.crouch ?? 0;

    const g = m.group;
    const home = this._v.copy(m.hip);
    if (m.ads) home.lerp(m.ads, adsK);
    g.position.set(
      home.x + bobX + swayX,
      home.y + bobY + swayY + land * 0.04 - tilt * 0.06 - lower * 0.3 - crouch * 0.012 * hipK,
      home.z + back * 0.5
    );
    // Slight inward angle at the hip so the barrel points toward the crosshair.
    g.rotation.set(
      pitch * 0.9 - tilt * 0.5 - lower * 0.8 - boltK * 0.06,
      0.05 * hipK + yaw * 0.6,
      tilt * 0.55 + lower * 0.2 + boltK * 0.12
    );

    this.flashTime -= dt;
    this.flash.visible = this.flashTime > 0;
  }

  /** World-space muzzle position, for drawing tracers from the gun. */
  muzzleWorld(mainCamera, out) {
    const m = this.active?.model;
    if (!m) return out.copy(mainCamera.position);
    this.scene.updateMatrixWorld();
    out.copy(m.muzzle);
    m.group.localToWorld(out); // in viewmodel-camera space
    return out.applyMatrix4(mainCamera.matrixWorld);
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
