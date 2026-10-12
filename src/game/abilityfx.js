// Visuals for abilities and zones. Listens to game events and draws rings,
// bursts, flames, smoke clouds, fire patches, and teleport markers.
import * as THREE from 'three';

const ringGeometry = new THREE.RingGeometry(0.92, 1, 64);
ringGeometry.rotateX(-Math.PI / 2);
const sphereGeometry = new THREE.SphereGeometry(1, 24, 16);
const fireGeometry = new THREE.CylinderGeometry(1, 1, 0.06, 20);
const pillarGeometry = new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8);
pillarGeometry.translate(0, 1.3, 0);
const coneGeometry = new THREE.ConeGeometry(1, 1, 24, 1, true);
coneGeometry.translate(0, -0.5, 0); // apex at the origin, opening toward -Y

const additive = (color, opacity = 1, side = THREE.DoubleSide) =>
  new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending,
    depthWrite: false, side,
  });

export class AbilityFx {
  constructor(scene, events) {
    this.scene = scene;
    this.items = [];           // short-lived effects
    this.zones = new Map();    // zone id -> visual
    this.markers = new Map();  // marker object -> visual
    this.time = 0;

    events.on('abilityCast', (e) => this._onCast(e));
    events.on('zoneStart', (z) => this._zoneStart(z));
    events.on('zoneEnd', (z) => this._zoneEnd(z));
    events.on('markerPlaced', (e) => this._markerPlaced(e));
    events.on('markerEnd', (e) => this._markerEnd(e));
  }

  // ---- building blocks ----

  _add(mesh, life, update) {
    this.scene.add(mesh);
    this.items.push({ mesh, life, max: life, update });
  }

  ring(pos, color, radius, life = 0.5) {
    const mesh = new THREE.Mesh(ringGeometry, additive(color, 0.75));
    mesh.position.set(pos.x, pos.y + 0.05, pos.z);
    this._add(mesh, life, (k) => {
      mesh.scale.setScalar(0.2 + radius * Math.sqrt(k));
      mesh.material.opacity = 0.75 * (1 - k);
    });
  }

  // Front faces only: seen from outside as a dome, invisible from inside, so
  // the caster isn't blinded by their own ability.
  burst(pos, color, radius, life = 0.45, opacity = 0.35) {
    const mesh = new THREE.Mesh(sphereGeometry, additive(color, opacity, THREE.FrontSide));
    mesh.position.set(pos.x, pos.y, pos.z);
    this._add(mesh, life, (k) => {
      mesh.scale.setScalar(0.1 + radius * Math.sqrt(k));
      mesh.material.opacity = opacity * (1 - k);
    });
  }

  puff(pos, color, size = 0.5) {
    this.burst(pos, color, size, 0.35, 0.6);
  }

  flame(origin, dir, range, angleDeg) {
    const radius = Math.tan((angleDeg * Math.PI) / 180) * range;
    const outer = new THREE.Mesh(coneGeometry, additive(0xff7a2a, 0.55));
    const inner = new THREE.Mesh(coneGeometry, additive(0xffd27a, 0.6));
    const d = new THREE.Vector3(dir.x, dir.y, dir.z).normalize();
    for (const [mesh, s] of [[outer, 1], [inner, 0.55]]) {
      mesh.position.set(origin.x + d.x * 0.4, origin.y - 0.25 + d.y * 0.4, origin.z + d.z * 0.4);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d);
      this._add(mesh, 0.35, (k) => {
        const grow = Math.min(1, k * 4);
        mesh.scale.set(radius * s * grow, range * grow, radius * s * grow);
        mesh.material.opacity = (s === 1 ? 0.55 : 0.6) * (1 - k);
      });
    }
  }

  // ---- ability casts ----

  _onCast(e) {
    const a = e.ability;
    const p = e.owner.pos;
    const feet = { x: p.x, y: p.y, z: p.z };
    const chest = { x: p.x, y: p.y + 1.1, z: p.z };
    switch (a.type) {
      case 'dash':
        this.ring(e.from, a.trail ? 0xff7a2a : 0xffe14a, 1.6, 0.4);
        this.puff({ x: e.from.x, y: e.from.y + 1, z: e.from.z }, a.trail ? 0xff7a2a : 0xffe14a, 0.7);
        break;
      case 'blink':
      case 'marker':
        if (e.from && e.to) {
          this.puff({ x: e.from.x, y: e.from.y + 1, z: e.from.z }, 0xb68cff, 0.9);
          this.puff({ x: e.to.x, y: e.to.y + 1, z: e.to.z }, 0xb68cff, 0.9);
          this.ring(e.to, 0xb68cff, 1.4, 0.4);
        }
        break;
      case 'nova':
        this.ring(feet, a.color, a.radius, a.throughWalls ? 0.9 : 0.5);
        this.burst(chest, a.color, a.radius, a.throughWalls ? 0.9 : 0.45, a.throughWalls ? 0.08 : 0.16);
        break;
      case 'cone':
        this.flame(e.origin, e.dir, a.range, a.angle);
        break;
      case 'shield':
        this.burst(chest, 0x9fd8ff, 1.2, 0.5, 0.4);
        break;
      case 'heal':
        this.ring(feet, 0x5ee08a, 1.5, 0.6);
        break;
    }
  }

  // ---- zones ----

  _zoneStart(z) {
    let visual;
    if (z.kind === 'smoke') {
      const group = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({
        color: 0x4a3d62, emissive: 0x1a1426, transparent: true, opacity: 0.97, side: THREE.DoubleSide,
      });
      // A main sphere plus a few lumps so it reads as a cloud.
      const lumps = [[0, 0, 0, 1], [0.45, -0.25, 0.2, 0.62], [-0.4, -0.2, -0.3, 0.6], [0.1, 0.35, -0.35, 0.55]];
      for (const [x, y, zz, s] of lumps) {
        const m = new THREE.Mesh(sphereGeometry, mat);
        m.position.set(x * z.radius, y * z.radius, zz * z.radius);
        m.scale.setScalar(s * z.radius);
        group.add(m);
      }
      group.position.set(z.x, z.y, z.z);
      group.scale.setScalar(0.01);
      visual = { root: group, mat, zone: z };
    } else {
      // Patches overlap, so the base uses normal blending (stays orange
      // instead of stacking up to white) with a faint additive glow on top.
      const group = new THREE.Group();
      const base = new THREE.Mesh(fireGeometry, new THREE.MeshBasicMaterial({
        color: 0xff6a1a, transparent: true, opacity: 0.5, depthWrite: false,
      }));
      base.scale.set(z.radius, 1, z.radius);
      const core = new THREE.Mesh(fireGeometry, additive(0xffb040, 0.14));
      core.scale.set(z.radius * 0.5, 2, z.radius * 0.5);
      core.position.y = 0.04;
      group.add(base, core);
      group.position.set(z.x, z.y + 0.03 + Math.random() * 0.01, z.z);
      visual = { root: group, mats: [base.material, core.material], zone: z, seed: Math.random() * 10 };
    }
    this.scene.add(visual.root);
    this.zones.set(z.id, visual);
  }

  _zoneEnd(z) {
    const v = this.zones.get(z.id);
    if (!v) return;
    v.root.removeFromParent();
    this.zones.delete(z.id);
  }

  _markerPlaced({ marker }) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(ringGeometry, additive(0xb68cff, 0.8));
    ring.scale.setScalar(0.7);
    const pillar = new THREE.Mesh(pillarGeometry, additive(0xb68cff, 0.35));
    group.add(ring, pillar);
    group.position.set(marker.x, marker.y + 0.03, marker.z);
    this.scene.add(group);
    this.markers.set(marker, { root: group, ring });
  }

  _markerEnd({ marker }) {
    const v = this.markers.get(marker);
    if (!v) return;
    v.root.removeFromParent();
    this.markers.delete(marker);
  }

  /** Remove every effect, zone visual, and marker (new match, or leaving one). */
  clear() {
    for (const it of this.items) {
      it.mesh.removeFromParent();
      it.mesh.material.dispose();
    }
    this.items.length = 0;
    for (const v of this.zones.values()) v.root.removeFromParent();
    this.zones.clear();
    for (const v of this.markers.values()) v.root.removeFromParent();
    this.markers.clear();
  }

  /** time = game time, so smoke and fire animate in step with the game. */
  update(dt, time) {
    this.time += dt;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life <= 0) {
        it.mesh.removeFromParent();
        it.mesh.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.update(1 - it.life / it.max);
    }
    for (const v of this.zones.values()) {
      const z = v.zone;
      const age = time - z.start;
      const left = z.until - time;
      if (z.kind === 'smoke') {
        const grow = Math.min(1, age / 0.5);
        v.root.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - grow, 3)));
        v.mat.opacity = 0.97 * Math.min(1, Math.max(0, left / 1.0));
        v.root.rotation.y += dt * 0.05;
      } else {
        const fade = Math.min(1, Math.max(0, left / 0.6));
        const flicker = 0.8 + 0.2 * Math.sin(this.time * 18 + v.seed);
        v.mats[0].opacity = 0.5 * fade * flicker;
        v.mats[1].opacity = 0.14 * fade * (1.1 - flicker * 0.3);
      }
    }
    for (const [marker, v] of this.markers) {
      if (marker.dead) {
        v.root.removeFromParent();
        this.markers.delete(marker);
        continue;
      }
      v.ring.scale.setScalar(0.6 + 0.1 * Math.sin(this.time * 5));
    }
  }
}
