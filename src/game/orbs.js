// Ultimate orbs: one on each half of the map, in the middle lane. Walk over
// one to take it for an ultimate point. They come back every round (every
// 40 s in deathmatch). Bots go for them when one is close and safe.
import * as THREE from 'three';

export const ORBS = { radius: 1.1, respawn: 40 };

const geometry = new THREE.OctahedronGeometry(0.2);
const ringGeometry = new THREE.TorusGeometry(0.34, 0.02, 6, 24);
const material = new THREE.MeshStandardMaterial({ color: 0x8ff0ff, emissive: 0x3fc8ff, emissiveIntensity: 1.2, roughness: 0.3 });

/** Where a map's orbs go: the middle-lane waypoint closest to the center, and its mirrored twin. */
export function orbSpots(nav) {
  const mid = nav.nodes.filter((n) => n.lane === 'M' && n.y < 0.5 && !n.id.startsWith('spawn') && !n.id.startsWith('door'));
  const best = mid.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).find((n) => Math.hypot(n.x, n.z) > 2);
  if (!best) return [];
  const twin = nav.byId.get(best.id.slice(0, -1) + (best.id.endsWith('a') ? 'e' : 'a'));
  return [best, twin].filter(Boolean).map((n) => ({ x: n.x, y: n.y, z: n.z }));
}

export class Orbs {
  constructor(scene, events) {
    this.scene = scene;
    this.events = events;
    this.list = [];
    this.time = 0;
  }

  /** Put fresh orbs on these spots. */
  reset(spots) {
    for (const o of this.list) o.mesh.removeFromParent();
    this.list = spots.map((p) => {
      const mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(geometry, material), new THREE.Mesh(ringGeometry, material));
      mesh.position.set(p.x, p.y + 1.0, p.z);
      this.scene?.add(mesh);
      return { x: p.x, y: p.y, z: p.z, taken: false, mesh };
    });
  }

  get active() {
    return this.list.filter((o) => !o.taken);
  }

  /** Anyone alive standing on an orb takes it. */
  tick(dt, characters) {
    this.time += dt;
    for (const o of this.list) {
      if (o.taken) continue;
      for (const c of characters) {
        if (!c.isCharacter || !c.alive || !c.abilities?.slots.x) continue;
        if (Math.hypot(c.pos.x - o.x, c.pos.z - o.z) < ORBS.radius && Math.abs(c.pos.y - o.y) < 1.5) {
          o.taken = true;
          o.mesh.visible = false;
          this.events.emit('orbTaken', { who: c, orb: o });
          break;
        }
      }
    }
  }

  /** Spin and bob (per rendered frame). */
  update(dt) {
    for (const o of this.list) {
      if (o.taken) continue;
      o.mesh.rotation.y += dt * 1.8;
      o.mesh.children[1].rotation.x = Math.PI / 2 + Math.sin(this.time * 2) * 0.3;
      o.mesh.position.y = o.y + 1.0 + Math.sin(this.time * 2.4) * 0.08;
    }
  }
}
