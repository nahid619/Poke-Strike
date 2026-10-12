// First-person gun model. Drawn in its own scene with its own camera, on top
// of the world, so it never clips into walls and keeps a steady FOV.
import * as THREE from 'three';

const GUN_DARK = 0x2a2e37;
const GUN_MID = 0x3c4250;
const GUN_ACCENT = 0xffcf3a;

function part(geo, color, x, y, z, rx = 0) {
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2 }));
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  return mesh;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function buildRifle() {
  const g = new THREE.Group();
  g.add(part(box(0.06, 0.08, 0.42), GUN_DARK, 0, 0, -0.05));          // receiver
  g.add(part(box(0.055, 0.06, 0.18), GUN_MID, 0, -0.005, -0.33));      // handguard
  const barrel = part(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 10), GUN_DARK, 0, 0.005, -0.5, Math.PI / 2);
  g.add(barrel);
  g.add(part(box(0.04, 0.13, 0.065), GUN_DARK, 0, -0.1, -0.08, 0.2));  // magazine
  g.add(part(box(0.045, 0.09, 0.05), GUN_MID, 0, -0.075, 0.08, -0.35)); // grip
  g.add(part(box(0.05, 0.075, 0.17), GUN_MID, 0, -0.01, 0.23));        // stock
  g.add(part(box(0.016, 0.018, 0.05), GUN_ACCENT, 0, 0.049, -0.02));   // sight
  g.scale.setScalar(0.55);
  g.position.set(0.19, -0.185, -0.5);
  return { group: g, muzzle: new THREE.Vector3(0, 0.005, -0.59), kickBack: 0.035, kickRot: 0.05 };
}

function buildPistol() {
  const g = new THREE.Group();
  g.add(part(box(0.045, 0.05, 0.2), GUN_DARK, 0, 0, -0.02));           // slide
  g.add(part(box(0.04, 0.035, 0.17), GUN_MID, 0, -0.04, -0.015));      // frame
  g.add(part(box(0.04, 0.12, 0.055), GUN_MID, 0, -0.1, 0.06, -0.25));  // grip
  g.add(part(box(0.047, 0.012, 0.05), GUN_ACCENT, 0, 0.02, 0.05));     // accent stripe
  g.scale.setScalar(0.7);
  g.position.set(0.13, -0.13, -0.42);
  return { group: g, muzzle: new THREE.Vector3(0, 0, -0.13), kickBack: 0.05, kickRot: 0.16 };
}

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

    this.models = { rifle: buildRifle(), pistol: buildPistol() };
    for (const m of Object.values(this.models)) {
      m.group.visible = false;
      m.base = m.group.position.clone();
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
    this.kick = 0;
    this.kickRot = 0;
    this.bobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this._v = new THREE.Vector3();
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  show(weaponId) {
    if (this.active?.id === weaponId) return;
    for (const [id, m] of Object.entries(this.models)) m.group.visible = id === weaponId;
    this.active = { id: weaponId, model: this.models[weaponId] };
    this.active.model.group.add(this.flash);
    this.flash.position.copy(this.active.model.muzzle);
  }

  onFire() {
    const m = this.active?.model;
    if (!m) return;
    this.kick += m.kickBack;
    this.kickRot += m.kickRot;
    this.flashTime = 0.045;
    this.flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    this.flash.scale.set(s, s, s);
  }

  /**
   * state: { weaponId, equip (0..1), reload (0..1, 0 when not reloading),
   *          speed (0..1 of run speed), onGround, lookX, lookY (mouse counts this frame) }
   */
  update(dt, state) {
    this.show(state.weaponId);
    const m = this.active.model;

    // Walk bob
    if (state.onGround && state.speed > 0.05) this.bobPhase += dt * (6 + 5 * state.speed);
    const bob = state.onGround ? state.speed : 0;
    const bobX = Math.cos(this.bobPhase) * 0.012 * bob;
    const bobY = -Math.abs(Math.sin(this.bobPhase)) * 0.014 * bob;

    // Sway: the gun lags slightly behind mouse movement
    this.swayX += (-state.lookX * 0.00012 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (state.lookY * 0.00012 - this.swayY) * Math.min(1, dt * 10);
    const swayX = Math.max(-0.03, Math.min(0.03, this.swayX));
    const swayY = Math.max(-0.03, Math.min(0.03, this.swayY));

    // Recoil spring
    const decay = Math.exp(-dt * 16);
    this.kick *= decay;
    this.kickRot *= decay;

    // Reload: dip and roll. Equip: rise from below.
    const dip = state.reload > 0 ? Math.sin(state.reload * Math.PI) : 0;
    const lower = Math.pow(1 - state.equip, 2);

    const g = m.group;
    g.position.set(
      m.base.x + bobX + swayX,
      m.base.y + bobY + swayY - dip * 0.07 - lower * 0.3,
      m.base.z + this.kick
    );
    // Slight inward angle so the barrel points toward the crosshair.
    g.rotation.set(this.kickRot - dip * 0.6 - lower * 0.8, 0.05, dip * 0.45);

    // Flash
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
