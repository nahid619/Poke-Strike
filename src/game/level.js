// Turns map data into meshes (for rendering) and boxes (for collision).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// A light prototype grid: one tile per meter, with a faint half-meter line.
function makeGridTexture(renderer) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#f1f1f1';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#dcdcdc';
  g.fillRect(size / 2 - 1, 0, 2, size);
  g.fillRect(0, size / 2 - 1, size, 2);
  g.fillStyle = '#ababab';
  g.fillRect(0, 0, size, 4);
  g.fillRect(0, 0, 4, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

// Box geometry whose UVs are in meters, so the grid stays 1 m on every size.
function metricBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const scale = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * scale[face][0], uv.getY(i) * scale[face][1]);
    }
  }
  return geo;
}

/**
 * Build the map. All boxes that share a material are merged into one mesh, so
 * a whole map draws in a handful of calls instead of one per box.
 */
export function buildLevel(map, { scene, world, renderer }) {
  const group = new THREE.Group();
  group.name = map.id;
  const texture = makeGridTexture(renderer);
  const byMaterial = new Map();

  for (const b of map.boxes) {
    const geo = metricBox(b.w, b.h, b.d);
    geo.translate(b.x, b.y + b.h / 2, b.z);
    if (!byMaterial.has(b.color)) byMaterial.set(b.color, []);
    byMaterial.get(b.color).push(geo);
    world.addBox(b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2);
  }

  for (const [key, geos] of byMaterial) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      color: map.palette[key] ?? 0xff00ff,
      map: texture,
      roughness: 0.9,
    }));
    mesh.castShadow = key !== 'floor';
    mesh.receiveShadow = true;
    mesh.name = `${map.id}-${key}`;
    group.add(mesh);
  }

  scene.add(group);
  return group;
}

/** Yaw that makes a character at `from` face the point `to`. */
export function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
