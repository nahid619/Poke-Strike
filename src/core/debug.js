// Debug overlay (F3): performance numbers, player state, and collision boxes.
import * as THREE from 'three';

const REFRESH = 0.25; // seconds between text updates

export class DebugOverlay {
  constructor() {
    this.el = document.getElementById('debug');
    this.visible = false;
    this.colliders = null;

    this.time = 0;
    this.frames = 0;
    this.ticks = 0;
    this.worst = 0;
  }

  /** Show collision boxes (and the bot waypoint graph, if any) for a scene. */
  attach(scene, world, nav = null) {
    // Free the previous session's outlines and labels before building new ones.
    disposeTree(this.colliders);
    disposeTree(this.botLayer);
    this.colliders?.removeFromParent();
    this.botLayer?.removeFromParent();
    this.labels = new Map();
    this.colliders = new THREE.Group();
    this.colliders.visible = this.visible;
    if (nav) this.colliders.add(navGraphLines(nav));
    // Bot paths and labels live in their own layer, rebuilt as bots move.
    this.botLayer = new THREE.Group();
    this.botLayer.visible = this.visible;
    this.pathGeometry = new THREE.BufferGeometry();
    this.pathGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(600 * 6), 3));
    this.pathGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(600 * 6), 3));
    this.pathGeometry.setDrawRange(0, 0);
    const paths = new THREE.LineSegments(this.pathGeometry, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
    paths.renderOrder = 997;
    paths.frustumCulled = false;
    this.botLayer.add(paths);
    this.botScene = scene;
    scene.add(this.botLayer);
    for (const b of world.boxes) {
      const box = new THREE.Box3(
        new THREE.Vector3(b.minX, b.minY, b.minZ),
        new THREE.Vector3(b.maxX, b.maxY, b.maxZ)
      );
      this.colliders.add(new THREE.Box3Helper(box, 0x22e3a1));
    }
    scene.add(this.colliders);
  }

  toggle() {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    if (this.colliders) this.colliders.visible = this.visible;
    if (this.botLayer) this.botLayer.visible = this.visible;
  }

  /** Draw each bot's current path and a "state / role" label above it. */
  updateBots(bots) {
    if (!this.visible || !this.botLayer) return;
    const pos = this.pathGeometry.attributes.position;
    const col = this.pathGeometry.attributes.color;
    let v = 0;
    const max = pos.count;
    for (const b of bots) {
      const ctl = b.controller;
      // Label
      let label = this.labels.get(b);
      if (!label) {
        label = makeLabel();
        this.labels.set(b, label);
        this.botLayer.add(label.sprite);
      }
      const text = !b.alive ? 'dead' : ctl.state ? `${ctl.state} / ${ctl.role}` : 'you';
      if (label.text !== text) setLabel(label, text, b.team);
      label.sprite.position.set(b.pos.x, b.pos.y + 2.55, b.pos.z);
      label.sprite.visible = true;

      // Path: from the bot through the rest of its waypoints
      if (!b.alive || !ctl.path) continue;
      const color = b.team === 'ally' ? [0.35, 0.7, 1] : [1, 0.45, 0.45];
      let px = b.pos.x;
      let pz = b.pos.z;
      for (let i = ctl.pathIndex; i < ctl.path.length && v + 2 <= max; i++) {
        const n = ctl.path[i];
        pos.setXYZ(v, px, 0.15, pz); col.setXYZ(v++, ...color);
        pos.setXYZ(v, n.x, 0.15, n.z); col.setXYZ(v++, ...color);
        px = n.x;
        pz = n.z;
      }
    }
    for (const [b, label] of this.labels) if (!bots.includes(b)) label.sprite.visible = false;
    this.pathGeometry.setDrawRange(0, v);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  update(dt, ticksThisFrame, info) {
    this.time += dt;
    this.frames++;
    this.ticks += ticksThisFrame;
    this.worst = Math.max(this.worst, dt);
    if (this.time < REFRESH) return;

    if (this.visible) {
      const p = info.player;
      const speed = Math.hypot(p.vel.x, p.vel.z);
      this.el.textContent = [
        `fps      ${Math.round(this.frames / this.time)}   worst ${(this.worst * 1000).toFixed(1)} ms`,
        `ticks/s  ${Math.round(this.ticks / this.time)}`,
        `state    ${info.state}`,
        `raw input ${info.rawInput ? 'on' : 'off'}`,
        ``,
        `pos      ${p.pos.x.toFixed(2)}  ${p.pos.y.toFixed(2)}  ${p.pos.z.toFixed(2)}`,
        `speed    ${speed.toFixed(2)} m/s`,
        `vel y    ${p.vel.y.toFixed(2)}`,
        `ground   ${p.onGround ? 'yes' : 'no'}`,
        `yaw      ${THREE.MathUtils.radToDeg(p.yaw).toFixed(1)}   pitch ${THREE.MathUtils.radToDeg(p.pitch).toFixed(1)}`,
        ...(p.loadout ? [
          ``,
          `weapon   ${p.loadout.current.def.name}`,
          `spread   ${p.loadout.lastSpread.toFixed(2)}\u00b0`,
          `spray    ${p.loadout.spray.toFixed(1)}`,
          `recoil   ${THREE.MathUtils.radToDeg(p.recoilPitch).toFixed(2)}\u00b0 up  ${THREE.MathUtils.radToDeg(p.recoilYaw).toFixed(2)}\u00b0 side`,
        ] : []),
      ].join('\n');
    }

    this.time = 0;
    this.frames = 0;
    this.ticks = 0;
    this.worst = 0;
  }
}

function navGraphLines(nav) {
  const points = [];
  for (const n of nav.nodes) {
    for (const { node } of n.links) {
      if (node.id < n.id) continue; // each link once
      points.push(n.x, 0.1, n.z, node.x, 0.1, node.z);
    }
    // Hold spots: a short line toward the angle they watch.
    if (n.hold) {
      const dx = n.hold.x - n.x;
      const dz = n.hold.z - n.z;
      const len = Math.hypot(dx, dz) || 1;
      points.push(n.x, 0.12, n.z, n.x + (dx / len) * 2.5, 0.12, n.z + (dz / len) * 2.5);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffcf3a, transparent: true, opacity: 0.6 }));
}

function makeLabel() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 40;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, sizeAttenuation: false }));
  sprite.scale.set(0.2, 0.031, 1);
  sprite.renderOrder = 999;
  return { canvas, texture, sprite, text: '' };
}

function setLabel(label, text, team) {
  const g = label.canvas.getContext('2d');
  g.clearRect(0, 0, 256, 40);
  g.fillStyle = 'rgba(0, 0, 0, 0.6)';
  g.fillRect(0, 0, 256, 40);
  g.font = 'bold 24px ui-monospace, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = team === 'ally' ? '#9fd0ff' : '#ffb0b3';
  g.fillText(text, 128, 21);
  label.texture.needsUpdate = true;
  label.text = text;
}

/** Release the GPU memory held by everything under `root`. */
function disposeTree(root) {
  root?.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      mat.map?.dispose();
      mat.dispose();
    }
  });
}
