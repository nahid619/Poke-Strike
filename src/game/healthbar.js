// Floating health and shield bar above a character (used for practice targets).
import * as THREE from 'three';

export function attachHealthBar(character) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 20;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set(0.8, 0.125, 1);
  sprite.position.y = 2.05;
  character.mesh.add(sprite);

  function draw() {
    g.clearRect(0, 0, 128, 20);
    g.fillStyle = 'rgba(10, 14, 22, 0.75)';
    g.fillRect(0, 0, 128, 20);
    const w = 124;
    const hp = character.health / character.maxHealth;
    const sh = character.maxShield > 0 ? character.shield / character.maxShield : 0;
    g.fillStyle = '#9fd8ff';
    g.fillRect(2, 2, w * sh, 5);
    g.fillStyle = hp > 0.5 ? '#5ee08a' : hp > 0.25 ? '#ffcf3a' : '#ff5a5f';
    g.fillRect(2, 9, w * hp, 9);
    texture.needsUpdate = true;
    sprite.visible = character.alive;
  }

  character.onHealthChange = draw;
  draw();
  return sprite;
}
