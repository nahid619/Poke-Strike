// Map 1: "Crossroads". A symmetric three-lane map for 5v5.
//
//   Enemy spawn (north, z = -35)
//   +------------------------------------------+
//   |  A lane       |    Mid     |    B lane    |
//   |  (west)       |  center    |    (east)    |
//   |  site A       |  block     |    site B    |
//   +------------------------------------------+
//   Ally spawn (south, z = +35)
//
// The layout is point-symmetric: every object at (x, z) has a twin at
// (-x, -z), so neither team has an advantage. Lanes are split by long walls
// with connectors to mid. Sites A and B are marked for the plant mode later.
import { B, pair, mirroredNav } from './mapkit.js';

const boxes = [
  B(0, -1, 0, 64, 1, 84, 'floor'),
  // Outer walls
  B(0, 0, -40.5, 62, 6, 1),
  B(0, 0, 40.5, 62, 6, 1),
  B(-30.5, 0, 0, 1, 6, 80),
  B(30.5, 0, 0, 1, 6, 80),

  // Spawn walls with three 4 m doors (x = -20, 0, 20)
  ...pair(-26, 0, 30, 8, 5, 1),
  ...pair(-10, 0, 30, 16, 5, 1),
  ...pair(10, 0, 30, 16, 5, 1),
  ...pair(26, 0, 30, 8, 5, 1),

  // Lane dividers at x = -10 and x = 10, with 4 m connectors at z = +-12
  ...pair(-10, 0, -21.75, 1, 5, 15.5),
  ...pair(-10, 0, 0, 1, 5, 20),
  ...pair(-10, 0, 21.75, 1, 5, 15.5),

  // Mid
  B(0, 0, 0, 4, 2.5, 4, 'dark'),            // center block
  ...pair(-5, 0, 6, 3, 1, 0.6, 'dark'),     // low cover walls
  ...pair(4, 0, 9, 1.2, 1.2, 1.2, 'crate'), // crates

  // A lane (west) and its twin, B lane (east)
  ...pair(-20, 0, 0, 8, 0.3, 8, 'site'),            // site platform
  ...pair(-22, 0.3, -1, 1.4, 1.4, 1.4, 'crate'),    // site cover
  ...pair(-17, 0.3, 2, 1.2, 1.2, 1.2, 'crate'),
  ...pair(-20, 0, 18, 4, 1.2, 1, 'dark'),           // low wall
  ...pair(-25, 0, 10, 2, 2.4, 2),                   // pillars
  ...pair(-15, 0, -20, 2, 2.4, 2),

  // Heaven: a raised platform over each site, against the outer wall, with
  // a railing to peek over and stairs down to the site (twin over site A).
  ...pair(28.25, 0, 9, 3.5, 2.0, 6, 'plate'),        // x 26.5..30, z 6..12, top 2 m
  ...pair(26.65, 2.0, 9.5, 0.3, 0.75, 5, 'dark'),    // railing on the lane side (crouch behind it)
  ...[1.7, 1.4, 1.1, 0.8, 0.5, 0.2].flatMap((h, i) => pair(28.25, 0, 5.75 - i * 0.5, 2.5, h, 0.5, 'plate')),
];

// ---------------------------------------------------------------------------
// Bot navigation (see mapkit.js). Points on the south half are listed once and
// mirrored to the north half; ids end in "a" (south) or "e" (north).
// ---------------------------------------------------------------------------
const half = [
  // id         x     z     extra: tags, and for hold spots the point to watch
  ['spawn',     0,    35],
  ['spawnW',  -20,    35],
  ['spawnE',   20,    35],
  ['doorW',   -20,    30,  { tags: ['choke'] }],
  ['doorM',     0,    30,  { tags: ['choke'] }],
  ['doorE',    20,    30,  { tags: ['choke'] }],
  ['midEntry',  0,    26],
  ['mid',       0,    12,  { tags: ['choke'] }],
  ['conW',    -10,    12,  { tags: ['choke'] }],
  ['conE',     10,    12,  { tags: ['choke'] }],
  ['ringN',     0,     6],
  ['ringW',    -6,     0],
  ['aLane1',  -20,    26],
  ['aLane2',  -14,    20],
  ['aLane3',  -14,    12,  { tags: ['choke'] }],
  ['aLane4',  -20,     6,  { hold: [-20, -10] }],
  ['siteA',   -20,     0,  { tags: ['site'] }],
  ['bLane1',   20,    26],
  ['bLane2',   21,    20],
  ['bLane3',   14,    12,  { tags: ['choke'] }],
  ['bLane4',   20,     7,  { hold: [20, -10] }],
  // Hold spots behind cover, each watching an approach
  ['aHold',   -20,  19.6,  { hold: [-20, 2], tags: ['cover'] }], // behind the low wall in the west lane
  ['midHold',  -5,   7.2,  { hold: [0, -12], tags: ['cover'] }], // behind the low wall in mid
  ['bHold',    17,  21.5,  { hold: [20, 4], tags: ['cover'] }],  // beside the pillar in the east lane
  // Heaven over site B (its twin is over site A): stairs at the bottom, the spot on top
  ['bStairs', 28.25, 1.8],
  ['bHeaven',  28.4,  10,  { hold: [20, 0], tags: ['cover'] }],
];

// Links within the south half; each gets a twin on the north half.
const halfLinks = [
  ['spawn', 'spawnW'], ['spawn', 'spawnE'],
  ['spawnW', 'doorW'], ['spawn', 'doorM'], ['spawnE', 'doorE'],
  ['doorW', 'aLane1'], ['doorM', 'midEntry'], ['doorE', 'bLane1'],
  ['midEntry', 'mid'], ['mid', 'ringN'], ['mid', 'conW'], ['mid', 'conE'],
  ['ringN', 'ringW'],
  ['conW', 'aLane3'], ['conE', 'bLane3'],
  ['aLane1', 'aLane2'], ['aLane2', 'aLane3'], ['aLane3', 'aLane4'], ['aLane4', 'siteA'],
  ['bLane1', 'bLane2'], ['bLane2', 'bLane3'], ['bLane3', 'bLane4'],
  ['aHold', 'aLane1'], ['aHold', 'aLane2'],
  ['midHold', 'mid'],
  ['bHold', 'bLane1'], ['bHold', 'bLane2'],
  ['bStairs', 'bHeaven'], ['bStairs', 'bLane4'],
];

// Lane routes, from the south (ally) spawn side to the north (enemy) side.
// The enemy team walks them in reverse. Bots push a lane node by node.
const routes = {
  A: ['aLane1a', 'aLane2a', 'aLane3a', 'aLane4a', 'siteAa', 'bLane4e', 'bLane3e', 'bLane2e', 'bLane1e'],
  M: ['midEntrya', 'mida', 'ringNa', 'ringWa', 'ringNe', 'mide', 'midEntrye'],
  B: ['bLane1a', 'bLane2a', 'bLane3a', 'bLane4a', 'siteAe', 'aLane4e', 'aLane3e', 'aLane2e', 'aLane1e'],
};

const nav = mirroredNav({
  half,
  halfLinks,
  crossLinks: [
    ['siteAa', 'bLane4e'], // site A (-20, 0) -> north part of the west lane
    ['bLane4a', 'siteAe'], // east lane -> site B (20, 0)
    ['ringWa', 'ringNe'],  // around the center block
    ['ringWe', 'ringNa'],
  ],
  routes,
  holdLanes: { aHold: 'A', aLane4: 'A', midHold: 'M', bHold: 'B', bLane4: 'B', bHeaven: 'B' },
  laneSplit: 10,
});

export default {
  id: 'crossroads',
  name: 'Crossroads',
  about: 'Three even lanes split by long walls, with connectors to a mid area around a center block.',
  // Clear midday.
  sky: 0xcfe3f2,
  skyTop: 0x5f9cdc,
  fogNear: 70,
  fogFar: 170,
  light: { hemi: 0.9, sun: 1.85, shadowSize: 46, sunColor: 0xfff3df, sunDir: [14, 28, 10], skyColor: 0xdcecff, groundColor: 0x6a5e4a },
  // Medium-sized lanes: a medium echo.
  acoustics: { time: 1.2, wet: 0.3, damping: 0.6 },
  palette: {
    floor: 0xbdb3a0,
    wall: 0xd9d3c6,
    dark: 0x7a8091,
    crate: 0xc8913f,
    site: 0xd6b25e,
    plate: 0x8d97a6,
  },
  spawn: { x: 0, z: 35, yaw: 0 },
  teamSpawns: {
    ally: { yaw: 0, points: [[0, 35], [-4, 35], [4, 35], [-8, 36], [8, 36]] },
    enemy: { yaw: Math.PI, points: [[0, -35], [4, -35], [-4, -35], [8, -36], [-8, -36]] },
  },
  sites: {
    A: { x: -20, z: 0, radius: 4 },
    B: { x: 20, z: 0, radius: 4 },
  },
  ...nav,
  boxes,
};
