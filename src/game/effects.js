// Short-lived visual effects: bullet tracers, bullet holes, and hit puffs.
// Everything is pooled so firing never allocates new objects.
import * as THREE from 'three';

const TRACER_LIFE = 0.07;
const DECAL_LIFE = 8;
const PUFF_LIFE = 0.16;

export class Effects {
  constructor(scene) {
    this.scene = scene;

    const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
    tracerGeo.translate(0, 0, -0.5); // origin at one end, extends along -Z
    this.tracers = this._pool(24, () => {
      const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({
        color: 0xfff0b8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      return m;
    });

    const decalGeo = new THREE.PlaneGeometry(0.07, 0.07);
    this.decals = this._pool(80, () => new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({
      color: 0x1d1b19, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    })));

    const puffGeo = new THREE.SphereGeometry(1, 8, 6);
    this.puffs = this._pool(24, () => new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, depthWrite: false,
    })));

    this._dir = new THREE.Vector3();
  }

  _pool(n, make) {
    const items = [];
    for (let i = 0; i < n; i++) {
      const mesh = make();
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      items.push({ mesh, life: 0, max: 1 });
    }
    return { items, next: 0 };
  }

  _take(pool, life) {
    const item = pool.items[pool.next];
    pool.next = (pool.next + 1) % pool.items.length;
    item.life = life;
    item.max = life;
    item.mesh.visible = true;
    return item;
  }

  tracer(from, to) {
    const item = this._take(this.tracers, TRACER_LIFE);
    const len = from.distanceTo(to);
    item.mesh.position.copy(from);
    item.mesh.lookAt(to);
    item.mesh.scale.set(0.012, 0.012, len);
    item.mesh.material.opacity = 0.9;
  }

  bulletHole(point, normal) {
    const item = this._take(this.decals, DECAL_LIFE);
    const m = item.mesh;
    m.position.set(point.x + normal.x * 0.003, point.y + normal.y * 0.003, point.z + normal.z * 0.003);
    m.lookAt(m.position.x + normal.x, m.position.y + normal.y, m.position.z + normal.z);
    m.rotation.z = Math.random() * Math.PI;
    m.material.opacity = 0.85;
  }

  puff(point, color, size = 0.06) {
    const item = this._take(this.puffs, PUFF_LIFE);
    item.mesh.position.set(point.x, point.y, point.z);
    item.mesh.material.color.setHex(color);
    item.size = size;
  }

  /** Hide every tracer, bullet hole, and puff. */
  clear() {
    for (const pool of [this.tracers, this.decals, this.puffs]) {
      for (const item of pool.items) {
        item.mesh.visible = false;
        item.life = 0;
      }
    }
  }

  update(dt) {
    for (const t of this.tracers.items) {
      if (!t.mesh.visible) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = 0.9 * (t.life / t.max);
    }
    for (const d of this.decals.items) {
      if (!d.mesh.visible) continue;
      d.life -= dt;
      if (d.life <= 0) d.mesh.visible = false;
      else if (d.life < 1) d.mesh.material.opacity = 0.85 * d.life;
    }
    for (const p of this.puffs.items) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const k = 1 - p.life / p.max;
      p.mesh.scale.setScalar(p.size * (1 + k * 2.5));
      p.mesh.material.opacity = 0.8 * (1 - k);
    }
  }
}
