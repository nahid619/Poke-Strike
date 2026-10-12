// Orb: a floating sphere target for the aim trainer. It has the same shape
// of interface as a Character (pos, alive, team, raycast, applyDamage, tick,
// syncMesh), so bullets and effects treat it like any other target.
import * as THREE from 'three';
import { raySphere } from '../core/physics.js';

const orbGeometry = new THREE.SphereGeometry(1, 24, 16);

export class Orb {
  constructor({ radius = 0.35, color = 0x4fd1ff, durable = false, motion = null } = {}) {
    this.team = 'enemy';
    this.radius = radius;
    this.durable = durable; // durable orbs take hits without dying (tracking)
    this.motion = motion;   // optional (orb, dt) => void
    this.alive = true;
    this.pos = new THREE.Vector3();
    this.prevPos = new THREE.Vector3();
    this.seenPos = null; // where it was last drawn on screen (set in syncMesh)
    this.vel = new THREE.Vector3();
    this.flash = 0;
    this.spawnTime = 0;

    this.material = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35,
    });
    this.mesh = new THREE.Mesh(orbGeometry, this.material);
    this.mesh.scale.setScalar(radius);
    this.mesh.castShadow = true;
  }

  place(x, y, z) {
    this.pos.set(x, y, z);
    this.prevPos.copy(this.pos);
  }

  raycast(o, d, maxT, at = this.pos) {
    if (!this.alive) return null;
    const t = raySphere(o, d, at.x, at.y, at.z, this.radius, maxT);
    return t === null ? null : { t, part: 'body' };
  }

  applyDamage() {
    if (!this.alive) return { dealt: 0, killed: false };
    if (this.durable) {
      this.flash = 0.08;
      return { dealt: 1, killed: false };
    }
    this.alive = false;
    return { dealt: 1, killed: true };
  }

  tick(dt) {
    this.prevPos.copy(this.pos);
    if (this.alive) this.motion?.(this, dt);
    this.flash = Math.max(0, this.flash - dt);
  }

  syncMesh(alpha, holdSeen = false) {
    this.mesh.position.lerpVectors(this.prevPos, this.pos, alpha);
    if (!holdSeen || !this.seenPos) (this.seenPos ??= new THREE.Vector3()).copy(this.mesh.position);
    this.mesh.visible = this.alive;
    this.material.emissiveIntensity = this.flash > 0 ? 1.4 : 0.35;
  }
}
