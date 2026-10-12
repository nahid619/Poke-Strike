// Floating name above teammates, visible through walls (like Valorant).
import * as THREE from 'three';

export function attachNameTag(character, color = '#9fd0ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 48;
  const g = canvas.getContext('2d');
  g.font = 'bold 28px "Segoe UI", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(8, 12, 20, 0.85)';
  g.strokeText(character.name, 128, 24);
  g.fillStyle = color;
  g.fillText(character.name, 128, 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation off: the tag stays the same size on screen at any distance.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false,
  }));
  sprite.scale.set(0.22, 0.041, 1);
  sprite.position.y = 2.15;
  sprite.renderOrder = 998;
  character.mesh.add(sprite);
  character.mesh.userData.nameTag = sprite;
  return sprite;
}
