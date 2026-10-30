// Map 2: "Plaza". A wide open middle with long sightlines.
//
//   Enemy spawn (north)
//   +---------------------------------------------------+
//   | west   |                                 |  east  |
//   | street |     wide plaza: tall pillars,   | street |
//   | site A |     a low fountain, planters    | site B |
//   +---------------------------------------------------+
//   Ally spawn (south)
//
// The plaza is big and open, so fights there are long-range and pillars are
// the only safe cover. Narrow streets on each side hold the sites, joined to
// the plaza by archways.
import { B, pair, mirroredNav } from './mapkit.js';

const boxes = [
  B(0, -1, 0, 70, 1, 86, 'floor'),
  B(0, 0, -42.5, 70, 6, 1), B(0, 0, 42.5, 70, 6, 1),
  B(-34.5, 0, 0, 1, 6, 86), B(34.5, 0, 0, 1, 6, 86),

  // Spawn walls with four exits: two to the streets, two to the plaza
  ...pair(-32, 0, 30, 4, 5, 1),
  ...pair(-18.5, 0, 30, 13, 5, 1),
  ...pair(0, 0, 30, 14, 5, 1),
  ...pair(18.5, 0, 30, 13, 5, 1),
  ...pair(32, 0, 30, 4, 5, 1),

  // Buildings between the plaza and the streets, with archways at z = +-12
  ...pair(-19, 0, -21.75, 4, 5, 15.5),
  ...pair(-19, 0, 0, 4, 5, 20),
  ...pair(-19, 0, 21.75, 4, 5, 15.5),

  // Plaza: low fountain, four tall pillars, planters, kiosks
  B(0, 0, 0, 6, 0.9, 6, 'dark'),
  ...pair(8, 0, 6, 2, 4.5, 2),
  ...pair(-8, 0, 6, 2, 4.5, 2),
  ...pair(0, 0, 16, 6, 1.1, 1, 'dark'),
  ...pair(-12, 0, 20, 3, 3, 3, 'crate'),

  // West street with site A (and its twin, the east street with site B)
  ...pair(-27.5, 0, 0, 8, 0.3, 10, 'site'),
  ...pair(-29, 0.3, -2, 1.4, 1.4, 1.4, 'crate'),
  ...pair(-25.5, 0.3, 3, 1.2, 1.2, 1.2, 'crate'),
  ...pair(-27, 0, 17, 4, 1.2, 1, 'dark'),
  ...pair(-30.5, 0, -14, 2, 2.4, 2),
  // Balconies on the plaza side of the buildings: high ground over mid, with
  // a railing to peek over and stairs at both ends (twin on the east side).
  ...pair(-15.75, 0, 0, 2.5, 1.8, 16, 'plate'),        // x -17..-14.5, z -8..8, top 1.8 m
  ...pair(-14.65, 1.8, 0, 0.3, 0.8, 12, 'dark'),       // railing facing the plaza
  ...[1.5, 1.2, 0.9, 0.6, 0.3].flatMap((h, i) => pair(-15.75, 0, 8.25 + i * 0.5, 2, h, 0.5, 'plate')),
  ...[1.5, 1.2, 0.9, 0.6, 0.3].flatMap((h, i) => pair(15.75, 0, 8.25 + i * 0.5, 2, h, 0.5, 'plate')),
];

const nav = mirroredNav({
  half: [
    ['spawn', 0, 36], ['spawnW', -9.5, 36], ['spawnE', 9.5, 36], ['spawnFW', -27.5, 36], ['spawnFE', 27.5, 36],
    ['doorPW', -9.5, 30, { tags: ['choke'] }], ['doorPE', 9.5, 30, { tags: ['choke'] }],
    ['doorSW', -27.5, 30, { tags: ['choke'] }], ['doorSE', 27.5, 30, { tags: ['choke'] }],
    // plaza
    ['pW1', -9.5, 25], ['pW2', -6, 16], ['pE1', 9.5, 25], ['pE2', 6, 16],
    ['fN', 0, 7.5], ['fW', -7.5, 0],
    ['archW', -19, 12, { tags: ['choke'] }], ['archE', 19, 12, { tags: ['choke'] }],
    // west street, south part (to site A)
    ['sW1', -27.5, 25], ['sW2', -24, 17], ['sW3', -24, 12], ['sW4', -27.5, 6, { hold: [-27.5, -12] }],
    ['siteA', -27.5, 0, { tags: ['site'] }],
    // east street, south part
    ['bS1', 27.5, 25], ['bS2', 26, 18], ['bS3', 24, 12], ['bS4', 27.5, 7, { hold: [27.5, -12] }],
    // hold spots behind cover
    ['aHold', -27, 18.6, { hold: [-27.5, 2], tags: ['cover'] }],
    ['midHold', -1.5, 17.6, { hold: [0, -10], tags: ['cover'] }],
    ['bHold', 28.4, 15.8, { hold: [27.5, 2], tags: ['cover'] }],
    // balconies: stairs at the south end, a spot on top watching the plaza
    ['stairW', -15.75, 11.4], ['balcW', -15.75, 4, { hold: [0, -14], tags: ['cover'] }],
    ['stairE', 15.75, 11.4], ['balcE', 15.75, 4, { hold: [0, -14], tags: ['cover'] }],
  ],
  halfLinks: [
    ['spawn', 'spawnW'], ['spawnW', 'spawnFW'], ['spawn', 'spawnE'], ['spawnE', 'spawnFE'],
    ['spawnW', 'doorPW'], ['spawnE', 'doorPE'], ['spawnFW', 'doorSW'], ['spawnFE', 'doorSE'],
    ['doorPW', 'pW1'], ['doorPE', 'pE1'], ['doorSW', 'sW1'], ['doorSE', 'bS1'],
    ['pW1', 'pW2'], ['pE1', 'pE2'], ['pW2', 'fN'], ['pE2', 'fN'], ['fN', 'fW'],
    ['pW2', 'archW'], ['pE2', 'archE'],
    ['sW1', 'sW2'], ['sW2', 'sW3'], ['sW3', 'archW'], ['sW3', 'sW4'], ['sW4', 'siteA'],
    ['bS1', 'bS2'], ['bS2', 'bS3'], ['bS3', 'archE'], ['bS3', 'bS4'],
    ['aHold', 'sW1'], ['midHold', 'pW2'], ['bHold', 'bS1'], ['bHold', 'bS2'],
    ['stairW', 'balcW'], ['stairW', 'pW2'], ['stairW', 'archW'],
    ['stairE', 'balcE'], ['stairE', 'pE2'], ['stairE', 'archE'],
  ],
  crossLinks: [
    ['siteAa', 'bS4e'], ['bS4a', 'siteAe'], // through the sites
    ['fWa', 'fNe'], ['fWe', 'fNa'],         // around the fountain
    ['balcWa', 'balcEe'], ['balcWe', 'balcEa'], // along each balcony
  ],
  routes: {
    A: ['sW1a', 'sW2a', 'sW3a', 'sW4a', 'siteAa', 'bS4e', 'bS3e', 'bS2e', 'bS1e'],
    M: ['pW1a', 'pW2a', 'fNa', 'fWa', 'fNe', 'pW2e', 'pW1e'],
    B: ['bS1a', 'bS2a', 'bS3a', 'bS4a', 'siteAe', 'sW4e', 'sW3e', 'sW2e', 'sW1e'],
  },
  holdLanes: { aHold: 'A', sW4: 'A', midHold: 'M', bHold: 'B', bS4: 'B', balcW: 'M', balcE: 'M' },
  laneSplit: 17,
});

export default {
  id: 'plaza',
  name: 'Plaza',
  about: 'A wide open middle with long sightlines and tall pillars. Sites sit in narrow side streets.',
  // Golden late afternoon: a low warm sun and long shadows.
  sky: 0xf3d7ae,
  skyTop: 0x6d9bd4,
  fogNear: 80,
  fogFar: 190,
  light: { hemi: 0.75, sun: 2.0, shadowSize: 50, sunColor: 0xffd49a, sunDir: [-30, 17, 12], skyColor: 0xffe6c8, groundColor: 0x6e5a40 },
  // Wide open middle: a long, dark, outdoor echo.
  acoustics: { time: 1.7, wet: 0.24, damping: 0.8 },
  palette: {
    floor: 0xc9bfa8,
    wall: 0xe2d8c3,
    dark: 0x7f8796,
    crate: 0xb98a4a,
    site: 0xd6b25e,
    plate: 0xa69a86,
  },
  spawn: { x: 0, z: 36, yaw: 0 },
  teamSpawns: {
    ally: { yaw: 0, points: [[0, 36], [-4, 36], [4, 36], [-8, 37.5], [8, 37.5]] },
    enemy: { yaw: Math.PI, points: [[0, -36], [4, -36], [-4, -36], [8, -37.5], [-8, -37.5]] },
  },
  sites: {
    A: { x: -27.5, z: 0, radius: 5 },
    B: { x: 27.5, z: 0, radius: 5 },
  },
  ...nav,
  boxes,
};
