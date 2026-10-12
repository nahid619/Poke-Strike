// Visuals for plant-and-defuse: site letters, the spike itself, a beacon you
// can see through walls (dropped: attackers only; planted: everyone), a pack
// on the carrier's back, and the blast when it detonates.
import * as THREE from 'three';
import { SPIKE } from './spike.js';

function textSprite(text, { color = '#ffffff', size = 0.05, bg = null, font = 'bold 80px' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(28, 22, 200, 84, 18);
    g.fill();
  }
  g.font = `${font} "Segoe UI", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 10;
  g.strokeStyle = 'rgba(8, 12, 20, 0.8)';
  g.strokeText(text, 128, 66);
  g.fillStyle = color;
  g.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false,
  }));
  sprite.scale.set(size * 2, size, 1);
  sprite.renderOrder = 996;
  return sprite;
}

export class SpikeFx {
  constructor(scene, spike, events, abilityFx) {
    this.spike = spike;
    this.abilityFx = abilityFx;
    this.time = 0;

    this.labels = [];
    for (const [id, site] of Object.entries(spike.sites)) {
      const label = textSprite(id, { color: '#ffd76a', size: 0.07 });
      label.position.set(site.x, 3.6, site.z);
      label.visible = false;
      scene.add(label);
      this.labels.push(label);
    }

    // The spike: a dark case with a glowing core.
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.24, 0.34), new THREE.MeshStandardMaterial({ color: 0x2b2f38, roughness: 0.5 }));
    body.position.y = 0.12;
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xff4a4a });
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.36), this.coreMat);
    core.position.y = 0.2;
    this.mesh.add(body, core);
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.beacon = textSprite('Spike', { color: '#ffffff', bg: 'rgba(214, 52, 58, 0.9)', size: 0.05, font: 'bold 52px' });
    this.beacon.visible = false;
    scene.add(this.beacon);

    // Pack worn by the carrier.
    this.pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.18), new THREE.MeshStandardMaterial({ color: 0x2b2f38, emissive: 0x551010 }));
    this.pack.position.set(0, 1.05, 0.36);
    this.pack.visible = false;

    events.on('spikeDetonated', ({ pos }) => {
      const at = { x: pos.x, y: pos.y + 1, z: pos.z };
      abilityFx.burst(at, 0xffa040, 14, 1.1, 0.5);
      abilityFx.ring(pos, 0xff6a2a, 16, 1.0);
    });
  }

  update(dt, session) {
    this.time += dt;
    const s = this.spike;
    const on = !!s.attackers;
    for (const l of this.labels) l.visible = on;

    const viewer = session.viewTarget?.() ?? session.player;
    const spot = s.planted ?? s.dropped;
    this.mesh.visible = on && !!spot && !s.detonated;
    if (spot) this.mesh.position.set(spot.x, spot.y, spot.z);
    this.beacon.visible = this.mesh.visible && (!!s.planted || viewer.team === s.attackers);
    if (spot) this.beacon.position.set(spot.x, spot.y + 1.2, spot.z);

    // The core blinks with the beeps once planted.
    if (s.planted && !s.defused) {
      const flash = (session.beepTimer ?? 1) > (0.12 + 0.88 * (s.fuseLeft / SPIKE.fuse)) - 0.08;
      this.coreMat.color.setHex(flash ? 0xffffff : 0xff3030);
    } else {
      this.coreMat.color.setHex(s.defused ? 0x4fd16a : 0xff4a4a);
    }

    // Move the pack to whoever carries the spike.
    const carrier = on ? s.carrier : null;
    if (carrier) {
      if (this.pack.parent !== carrier.mesh) carrier.mesh.add(this.pack);
      this.pack.visible = true;
    } else {
      this.pack.visible = false;
    }
  }
}
