// Map 3: "Foundry". Tight corridors and tall cover.
//
//   Enemy spawn (north)
//   +------------------------------------------+
//   |##| west  |##|  mid  |##| east  |##|
//   |##| corr. |##| corr. |##| corr. |##|      solid blocks between corridors
//   |  site A room  ]  mid hall  [  site B room |
//   +------------------------------------------+
//   Ally spawn (south)
//
// Three narrow corridors run between solid blocks. The sites are enclosed
// rooms with a doorway into the mid hall, which is broken up by a center
// pillar and tall crate stacks. Fights are close and sudden.
import { B, pair, mirroredNav } from './mapkit.js';

const boxes = [
  B(0, -1, 0, 54, 1, 74, 'floor'),
  B(0, 0, -36.5, 54, 7, 1), B(0, 0, 36.5, 54, 7, 1),
  B(-26.5, 0, 0, 1, 7, 74), B(26.5, 0, 0, 1, 7, 74),

  // Spawn walls with three exits (x = -23.5, 0, 23.5)
  ...pair(-11.5, 0, 29, 19, 6, 1),
  ...pair(11.5, 0, 29, 19, 6, 1),

  // Solid blocks between the corridors
  ...pair(-12, 0, 19.25, 18, 6, 18.5),
  ...pair(12, 0, 19.25, 18, 6, 18.5),

  // Site rooms: walls above and below, and a side wall with a doorway into mid
  ...pair(-17, 0, 6, 8, 6, 0.5),
  ...pair(17, 0, 6, 8, 6, 0.5),
  ...pair(-12.75, 0, 3.75, 0.5, 6, 4.5),
  ...pair(12.75, 0, 3.75, 0.5, 6, 4.5),

  // Mid hall: a center pillar and tall crate stacks
  B(0, 0, 0, 1.5, 6, 1.5, 'dark'),
  ...pair(-5, 0, 2.5, 2, 2.6, 2, 'crate'),
  ...pair(5, 0, 2.5, 2, 2.6, 2, 'crate'),

  // Sites
  ...pair(-19.5, 0, 0, 7, 0.3, 6, 'site'),
  ...pair(-17, 0.3, 1.8, 1.2, 2.4, 1.2, 'crate'),
  ...pair(-22.5, 0.3, -2, 1.2, 1.2, 1.2, 'crate'),

  // Corridor cover
  ...pair(-24.5, 0, 18, 1.4, 2.4, 1.5, 'dark'),
  ...pair(-2, 0, 20, 1.2, 1.2, 1.2, 'crate'),
];

const nav = mirroredNav({
  half: [
    ['spawn', 0, 32.5], ['spawnW', -23.5, 32.5], ['spawnE', 23.5, 32.5],
    ['doorW', -23.5, 29, { tags: ['choke'] }], ['doorM', 0, 29, { tags: ['choke'] }], ['doorE', 23.5, 29, { tags: ['choke'] }],
    // west corridor to site A
    ['wA1', -22.4, 25], ['wA2', -22.4, 12], ['wA3', -22.4, 8], ['wA4', -22.4, 4, { hold: [-22.4, -10] }],
    ['siteA', -19.5, 0, { tags: ['site'] }],
    ['bandW', -17, 8, { tags: ['choke'] }],
    // mid corridor and hall
    ['mC1', 0.5, 24], ['mC2', 0.5, 12], ['mHall', 0, 8, { tags: ['choke'] }],
    ['hN', 0, 5], ['hNW', -7.5, 5.5], ['hNE', 7.5, 5.5], ['hW', -8.5, 0],
    ['dA', -12.75, 0, { tags: ['choke'] }],
    // east corridor toward site B
    ['eB1', 23.5, 25], ['eB2', 23.5, 12], ['eB3', 23.5, 8], ['eB4', 21, 4.5, { hold: [21, -8] }],
    ['bandE', 17, 8, { tags: ['choke'] }],
    // hold spots
    ['aHold', -22.6, 19.4, { hold: [-22.4, 6], tags: ['cover'] }],
    ['midHold', -2, 21.5, { hold: [0, 8], tags: ['cover'] }],
    ['bHold', 23.5, 14, { hold: [23.5, 4] }],
  ],
  halfLinks: [
    ['spawn', 'spawnW'], ['spawn', 'spawnE'],
    ['spawnW', 'doorW'], ['spawn', 'doorM'], ['spawnE', 'doorE'],
    ['doorW', 'wA1'], ['doorM', 'mC1'], ['doorE', 'eB1'],
    ['wA1', 'wA2'], ['wA2', 'wA3'], ['wA3', 'wA4'], ['wA4', 'siteA'], ['wA3', 'bandW'],
    ['bandW', 'mHall'],
    ['mC1', 'mC2'], ['mC2', 'mHall'],
    ['mHall', 'hN'], ['hN', 'hNW'], ['hN', 'hNE'], ['hNW', 'hW'], ['hW', 'dA'], ['dA', 'siteA'],
    ['eB1', 'eB2'], ['eB2', 'eB3'], ['eB3', 'eB4'], ['eB3', 'bandE'], ['bandE', 'mHall'],
    ['aHold', 'wA1'], ['aHold', 'wA2'], ['midHold', 'mC1'], ['bHold', 'eB2'], ['bHold', 'eB3'],
  ],
  crossLinks: [
    ['hWa', 'hNEe'], ['hWe', 'hNEa'],     // around the center pillar
    ['siteAa', 'eB4e'], ['eB4a', 'siteAe'], // into each site from the far corridor
  ],
  routes: {
    A: ['wA1a', 'wA2a', 'wA3a', 'wA4a', 'siteAa', 'eB4e', 'eB3e', 'eB2e', 'eB1e'],
    M: ['mC1a', 'mC2a', 'mHalla', 'hNa', 'hNWa', 'hWa', 'hNEe', 'hNe', 'mHalle', 'mC2e', 'mC1e'],
    B: ['eB1a', 'eB2a', 'eB3a', 'eB4a', 'siteAe', 'wA4e', 'wA3e', 'wA2e', 'wA1e'],
  },
  holdLanes: { aHold: 'A', wA4: 'A', midHold: 'M', bHold: 'B', eB4: 'B' },
  laneSplit: 12,
});

export default {
  id: 'foundry',
  name: 'Foundry',
  about: 'Tight corridors between solid blocks, enclosed site rooms, and tall cover. Close fights.',
  sky: 0x8a9bb0,
  fogNear: 50,
  fogFar: 120,
  light: { hemi: 1.15, sun: 1.4, shadowSize: 40 },
  palette: {
    floor: 0x7d776c,
    wall: 0xa49d90,
    dark: 0x555b68,
    crate: 0xa36f35,
    site: 0xc9a24a,
  },
  spawn: { x: 0, z: 32.5, yaw: 0 },
  teamSpawns: {
    ally: { yaw: 0, points: [[0, 32.5], [-4, 32.5], [4, 32.5], [-8, 33.5], [8, 33.5]] },
    enemy: { yaw: Math.PI, points: [[0, -32.5], [4, -32.5], [-4, -32.5], [8, -33.5], [-8, -33.5]] },
  },
  sites: {
    A: { x: -19.5, z: 0, radius: 4 },
    B: { x: 19.5, z: 0, radius: 4 },
  },
  ...nav,
  boxes,
};
