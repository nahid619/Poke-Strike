// Test Room: a 40 x 40 m space for movement testing.
// Box format: B(x, y, z, width, height, depth, material)
//   (x, z) is the center on the ground plane, y is the bottom of the box.
// North is -Z. You spawn in the south half facing north.
const B = (x, y, z, w, h, d, color = 'wall') => ({ x, y, z, w, h, d, color });

const stairs = [];
for (let i = 0; i < 4; i++) {
  // Four 0.3 m steps going east, then a platform at 1.5 m.
  stairs.push(B(8.25 + i * 0.5, 0, 10, 0.5, 0.3 * (i + 1), 3, 'accent'));
}

export default {
  id: 'testmap',
  name: 'Test Room',
  sky: 0x9fc7e8,
  acoustics: { time: 1.0, wet: 0.3, damping: 0.55 },
  palette: {
    floor: 0xbdb3a0,
    wall: 0xd9d3c6,
    crate: 0xc8913f,
    accent: 0x6e9fe0,
    dark: 0x7a8091,
  },

  spawn: { x: 0, z: 15, yaw: 0 },

  // Practice targets. They respawn 2.5 s after dying.
  //   strafe: moves left and right at random (practice counter-strafing and tracking)
  //   ally:   a teammate; bullets pass through it (no friendly fire)
  dummies: [
    { x: 5, z: 3, team: 'enemy' },                    // ~13 m from spawn
    { x: -5, z: 1, team: 'enemy' },
    { x: -3, z: -13, team: 'enemy', move: 'strafe' }, // ~28 m, through the door
    { x: 3, z: -13, team: 'enemy', move: 'strafe' },
    { x: 0, z: -17, team: 'enemy' },
    { x: -14, z: -14, team: 'enemy' },
    { x: -5, z: 13, team: 'ally' },
  ],

  boxes: [
    // Floor, top surface at y = 0.
    B(0, -1, 0, 44, 1, 44, 'floor'),

    // Outer walls.
    B(0, 0, -20.5, 42, 5, 1),
    B(0, 0, 20.5, 42, 5, 1),
    B(-20.5, 0, 0, 1, 5, 40),
    B(20.5, 0, 0, 1, 5, 40),

    // Dividing wall with a 3 m doorway. The lintel is low enough that
    // jumping in the doorway bumps your head (tests ceiling collision).
    B(-10.75, 0, -4, 18.5, 4, 0.6),
    B(10.75, 0, -4, 18.5, 4, 0.6),
    B(0, 2.6, -4, 3, 1.4, 0.6),

    // South half: low cover you can jump onto.
    B(0, 0, 6, 4, 1, 0.6, 'dark'),

    // Crates: jump onto the small one, then onto the tall one.
    B(-8, 0, 10, 1, 1, 1, 'crate'),
    B(-9.2, 0, 10, 1.4, 2, 1.4, 'crate'),
    B(-12, 0, 6, 1.2, 1, 1.2, 'crate'),

    // Stairs up to a platform.
    ...stairs,
    B(12, 0, 10, 4, 1.5, 3, 'accent'),

    // North half: pillars and a tight 2 m corridor.
    B(-8, 0, -12, 1.5, 4, 1.5),
    B(8, 0, -12, 1.5, 4, 1.5),
    B(13, 0, -13, 0.4, 3, 8, 'dark'),
    B(15.4, 0, -13, 0.4, 3, 8, 'dark'),
  ],
};
