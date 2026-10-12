// Aim Range: a dark, uncluttered hall for the aim trainer.
// You stand in a small booth at the south end; targets appear to the north.
const B = (x, y, z, w, h, d, color = 'wall') => ({ x, y, z, w, h, d, color });

export default {
  id: 'aimrange',
  name: 'Aim Range',
  sky: 0x1a2130,
  fogNear: 60,
  fogFar: 160,
  light: { hemi: 1.4, sun: 1.2, shadowSize: 30 },
  palette: {
    floor: 0x46506a,
    wall: 0x4f5b76,
    booth: 0x5c6a86,
    stripe: 0x4fd1ff,
  },

  spawn: { x: 0, z: 0, yaw: 0 },

  // Where targets can appear (used by the drills).
  zones: {
    floor: { minX: -9, maxX: 9, minZ: -22, maxZ: -10 },
    strafe: { minX: -7, maxX: 7, minZ: -22, maxZ: -14 },
    tracking: { minX: -8, maxX: 8, minY: 1.0, maxY: 4.2, z: -16 },
  },

  boxes: [
    B(0, -1, -20, 44, 1, 54, 'floor'),
    // Hall walls
    B(0, 0, -46.5, 44, 10, 1),
    B(0, 0, 6.5, 44, 10, 1),
    B(-21.5, 0, -20, 1, 10, 52),
    B(21.5, 0, -20, 1, 10, 52),
    // Booth: a low front rail so it stays out of your view
    B(0, 0, -2.35, 4.4, 0.45, 0.3, 'booth'),
    B(0, 0, 2.35, 4.4, 1.1, 0.3, 'booth'),
    B(-2.35, 0, 0, 0.3, 1.1, 5, 'booth'),
    B(2.35, 0, 0, 0.3, 1.1, 5, 'booth'),
    // Distance markers on the floor: 10, 20, 30 m
    B(0, 0, -10, 30, 0.02, 0.12, 'stripe'),
    B(0, 0, -20, 30, 0.02, 0.12, 'stripe'),
    B(0, 0, -30, 30, 0.02, 0.12, 'stripe'),
  ],
};
