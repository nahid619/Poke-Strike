// Turns map data into meshes (for rendering) and boxes (for collision).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { surfaceOf } from '../data/maps/mapkit.js';

// ---------------------------------------------------------------------------
// Textures, drawn in code (no image files). Each is a light grayscale
// pattern that the map's palette color tints, so one texture works for any
// color. Sizes are in meters: the pattern repeats every `size` meters.
// ---------------------------------------------------------------------------
const TEXTURES = {
  concrete: { size: 4, draw: drawConcrete },  // floors: big tiles with grout lines
  blocks: { size: 2, draw: drawBlocks },      // walls: staggered blocks
  metal: { size: 2, draw: drawMetal },        // dark cover: panels and rivets
  wood: { size: 1.5, draw: drawWood },        // crates: planks with grain
  plate: { size: 1, draw: drawPlate },        // platforms, stairs, sites: diamond plate
};
// Which texture each palette material uses (anything else: blocks).
const KIND = { floor: 'concrete', wall: 'blocks', dark: 'metal', crate: 'wood', site: 'plate', plate: 'plate',
  accent: 'metal', booth: 'metal', stripe: 'metal' };
const ROUGH = { concrete: 0.95, blocks: 0.9, metal: 0.55, wood: 0.85, plate: 0.5 };
const METAL = { metal: 0.25, plate: 0.35 };

// A small seeded random generator, so textures look the same every time.
function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
function speckle(g, size, r, count, light = 0.06, dark = 0.08) {
  for (let i = 0; i < count; i++) {
    const v = r() < 0.5 ? `rgba(255,255,255,${light * r()})` : `rgba(0,0,0,${dark * r()})`;
    g.fillStyle = v;
    const w = 1 + r() * 3;
    g.fillRect(r() * size, r() * size, w, w);
  }
}
function drawConcrete(g, n, r) {
  g.fillStyle = '#eeeeee';
  g.fillRect(0, 0, n, n);
  const t = n / 2; // 2 x 2 tiles of 2 m
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
    g.fillRect(x * t, y * t, t, t);
  }
  speckle(g, n, r, 2600);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  for (let i = 0; i <= 2; i++) {
    g.fillRect(i * t - 2, 0, 4, n);
    g.fillRect(0, i * t - 2, n, 4);
  }
}
function drawBlocks(g, n, r) {
  g.fillStyle = '#efefef';
  g.fillRect(0, 0, n, n);
  const rows = 4; // blocks 1 m x 0.5 m
  const h = n / rows;
  for (let y = 0; y < rows; y++) {
    const shift = y % 2 ? n / 4 : 0;
    for (let x = -1; x < 2; x++) {
      g.fillStyle = `rgba(0,0,0,${0.015 + r() * 0.05})`;
      g.fillRect(x * (n / 2) + shift, y * h, n / 2, h);
    }
  }
  speckle(g, n, r, 1800, 0.05, 0.06);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y <= rows; y++) g.fillRect(0, y * h - 1.5, n, 3);
  for (let y = 0; y < rows; y++) {
    const shift = y % 2 ? n / 4 : 0;
    for (let x = 0; x <= 2; x++) g.fillRect(x * (n / 2) + shift - 1.5, y * h, 3, h);
  }
}
function drawMetal(g, n, r) {
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 160; i++) { // brushed streaks
    g.fillStyle = `rgba(255,255,255,${0.05 * r()})`;
    g.fillRect(0, r() * n, n, 1);
  }
  const p = n / 2; // 1 m panels
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let i = 0; i <= 2; i++) {
    g.fillRect(i * p - 1.5, 0, 3, n);
    g.fillRect(0, i * p - 1.5, n, 3);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    for (const [dx, dy] of [[10, 10], [p - 10, 10], [10, p - 10], [p - 10, p - 10]]) {
      g.beginPath();
      g.arc(x * p + dx, y * p + dy, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}
function drawWood(g, n, r) {
  g.fillStyle = '#e9e9e9';
  g.fillRect(0, 0, n, n);
  const planks = 6; // 25 cm planks
  const w = n / planks;
  for (let i = 0; i < planks; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.08})`;
    g.fillRect(i * w, 0, w, n);
    for (let k = 0; k < 14; k++) { // grain
      g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.07})`;
      g.fillRect(i * w + r() * w, 0, 1, n);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i <= planks; i++) g.fillRect(i * w - 1.5, 0, 3, n);
}
function drawPlate(g, n, r) {
  g.fillStyle = '#e2e2e2';
  g.fillRect(0, 0, n, n);
  speckle(g, n, r, 900, 0.04, 0.05);
  const cell = n / 8; // diamond tread
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = (x + 0.5) * cell;
    const cy = (y + 0.5) * cell;
    const flip = (x + y) % 2;
    g.save();
    g.translate(cx, cy);
    g.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(-cell * 0.32, -2.5, cell * 0.64, 5);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(-cell * 0.32, -2.5, cell * 0.64, 2);
    g.restore();
  }
}

const textureCache = new Map();
function texture(kind, renderer) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const def = TEXTURES[kind];
  const n = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  def.draw(canvas.getContext('2d'), n, rng(kind.length * 977 + 13));
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / def.size, 1 / def.size);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textureCache.set(kind, tex);
  return tex;
}

/**
 * A box in world space with UVs in world meters (so textures line up
 * across neighboring boxes) and vertex colors that darken the bottom of
 * walls a little, like soft shadow where they meet the floor.
 */
function texturedBox(b) {
  const segs = Math.max(1, Math.min(8, Math.ceil(b.h / 0.5)));
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d, 1, segs, 1);
  geo.translate(b.x, b.y + b.h / 2, b.z);
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const grounded = b.y <= 0.35; // sits on the floor (or a site platform)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    if (ny > 0.5) uv.setXY(i, x, z);
    else if (nx > 0.5) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
    let shade = 1;
    if (ny < 0.5 && grounded) {
      const above = Math.max(0, y - b.y); // (rounding can make this a hair below zero)
      shade = 0.62 + 0.38 * Math.min(1, above / 1.1) ** 0.8;
    }
    colors.set([shade, shade, shade], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/**
 * Build the map. All boxes that share a material are merged into one mesh, so
 * a whole map draws in a handful of calls instead of one per box.
 */
export function buildLevel(map, { scene, world, renderer }) {
  const group = new THREE.Group();
  group.name = map.id;
  const byMaterial = new Map();

  for (const b of map.boxes) {
    if (!byMaterial.has(b.color)) byMaterial.set(b.color, []);
    byMaterial.get(b.color).push(texturedBox(b));
    world.addBox(b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2, surfaceOf(map, b.color));
  }

  for (const [key, geos] of byMaterial) {
    const kind = KIND[key] ?? 'blocks';
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      color: map.palette[key] ?? 0xff00ff,
      map: texture(kind, renderer),
      vertexColors: true,
      roughness: ROUGH[kind],
      metalness: METAL[kind] ?? 0,
    }));
    mesh.castShadow = key !== 'floor';
    mesh.receiveShadow = true;
    mesh.name = `${map.id}-${key}`;
    group.add(mesh);
  }

  // A sky dome that fades from the horizon color to the sky color overhead.
  if (map.skyTop !== undefined) {
    const dome = new THREE.SphereGeometry(240, 24, 12);
    const top = new THREE.Color(map.skyTop);
    const horizon = new THREE.Color(map.sky);
    const p = dome.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const k = Math.max(0, p.getY(i) / 240) ** 0.6;
      c.copy(horizon).lerp(top, k);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const sky = new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.name = `${map.id}-sky`;
    sky.renderOrder = -1;
    group.add(sky);
  }

  scene.add(group);
  return group;
}

/** Yaw that makes a character at `from` face the point `to`. */
export function yawToward(from, to) {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
