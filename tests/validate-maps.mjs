// Checks every map's bot waypoints: nodes are standable, every link can be
// walked in a straight line (step-ups allowed), and all nodes are connected.
// Links that change level (stairs) are walked by a real character with the
// game's physics, so a staircase that can't be climbed fails here.
// Run with: npm run test:maps
import { World } from '../src/core/physics.js';
import { NavGraph, standHeight } from '../src/ai/nav.js';
import { Character, MOVE } from '../src/game/character.js';
import { Events } from '../src/core/events.js';
import { readdirSync } from 'node:fs';

/** Walk a character from A to B with the real movement code. Returns where it ended up. */
function walk(world, A, B) {
  const c = new Character({ team: 'ally' });
  const ctx = { world, characters: [c], events: new Events(), time: 0 };
  c.teleport(A.x, A.y, A.z, 0);
  c.setController({
    getIntent: (ch) => {
      ch.yaw = Math.atan2(-(B.x - ch.pos.x), -(B.z - ch.pos.z));
      return { forward: 1, right: 0, walk: false, jump: false, fireHeld: false, firePressed: false, reload: false,
        switchTo: null, switchDelta: 0, abilityQ: false, abilityE: false, interact: false, crouch: false,
        adsPressed: false, adsHeld: false, adsHold: false };
    },
  });
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  let arrived = false;
  for (let t = 0; t < len / MOVE.runSpeed + 3 && !arrived; t += 1 / 60) {
    c.tick(1 / 60, ctx);
    arrived = Math.hypot(c.pos.x - B.x, c.pos.z - B.z) < 0.4;
  }
  // Let it settle (stepping off the last stair takes a moment).
  c.setController({ getIntent: () => ({ forward: 0, right: 0 }) });
  for (let t = 0; t < 0.4; t += 1 / 60) c.tick(1 / 60, ctx);
  return c.pos;
}

const STEP = 0.4;
const RADIUS = 0.42;
const HEIGHT = 1.8;
let failures = 0;

for (const file of readdirSync(new URL('../src/data/maps/', import.meta.url))) {
  const map = (await import(`../src/data/maps/${file}`)).default;
  if (!map?.waypoints) continue; // skip helper modules
  const world = new World();
  for (const b of map.boxes) world.addBox(b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2);
  const blocked = (x, z, y = standHeight(map.boxes, x, z)) =>
    world.overlapsCylinder(x, y, z, RADIUS, HEIGHT) && world.overlapsCylinder(x, y + STEP, z, RADIUS, HEIGHT);
  const nav = new NavGraph(map);
  const problems = [];
  for (const n of nav.nodes) if (blocked(n.x, n.z, n.y)) problems.push(`node ${n.id} is inside geometry`);
  let stairs = 0;
  for (const [a, b] of map.links) {
    const A = nav.byId.get(a);
    const B = nav.byId.get(b);
    const len = Math.hypot(A.x - B.x, A.z - B.z);
    if (Math.abs(A.y - B.y) > 0.2) {
      // Stairs: walk it for real, both ways.
      stairs++;
      for (const [from, to] of [[A, B], [B, A]]) {
        const end = walk(world, from, to);
        if (Math.hypot(end.x - to.x, end.z - to.z) > 0.6 || Math.abs(end.y - to.y) > 0.2) {
          problems.push(`link ${from.id} -> ${to.id} can't be walked (got to ${end.x.toFixed(1)}, ${end.y.toFixed(1)}, ${end.z.toFixed(1)})`);
        }
      }
      continue;
    }
    for (let t = 0; t <= len; t += 0.2) {
      const x = A.x + ((B.x - A.x) * t) / len;
      const z = A.z + ((B.z - A.z) * t) / len;
      if (blocked(x, z)) {
        problems.push(`link ${a} - ${b} is blocked near (${x.toFixed(1)}, ${z.toFixed(1)})`);
        break;
      }
    }
  }
  const first = nav.nodes[0];
  for (const n of nav.nodes) if (!nav.path(first, n)) problems.push(`node ${n.id} can't be reached`);
  // Routes must be continuous chains of links.
  const linked = new Set(map.links.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  for (const [lane, ids] of Object.entries(map.routes ?? {})) {
    for (let i = 0; i < ids.length - 1; i++) {
      if (!linked.has(`${ids[i]}|${ids[i + 1]}`)) problems.push(`route ${lane} has a gap: ${ids[i]} -> ${ids[i + 1]}`);
    }
  }
  if (map.routes && Object.keys(map.routes).sort().join() !== 'A,B,M') problems.push('needs routes A, M, and B');
  for (const n of nav.nodes) if (!n.lane) problems.push(`node ${n.id} has no lane`);
  for (const half of ['a', 'e']) {
    if (!nav.nodes.some((n) => n.hold && n.id.endsWith(half))) problems.push(`no hold spots on half "${half}"`);
  }
  for (const team of ['ally', 'enemy']) {
    if ((map.teamSpawns?.[team]?.points.length ?? 0) < 5) problems.push(`${team} needs 5 spawn points`);
  }
  if (!map.sites?.A || !map.sites?.B) problems.push('needs sites A and B');
  // Point symmetry
  const key = (b) => [b.x, b.y, b.z, b.w, b.h, b.d].map((v) => Math.round(v * 100)).join();
  const boxSet = new Set(map.boxes.map(key));
  const asym = map.boxes.filter((b) => !boxSet.has(key({ ...b, x: -b.x, z: -b.z }))).length;
  if (asym) problems.push(`${asym} boxes have no mirrored twin`);

  for (const team of Object.keys(map.teamSpawns ?? {})) {
    for (const [x, z] of map.teamSpawns[team].points) if (blocked(x, z)) problems.push(`${team} spawn (${x}, ${z}) is blocked`);
  }
  const raised = nav.nodes.filter((n) => n.y > 0.5).length;
  console.log(`${map.name}: ${nav.nodes.length} waypoints (${raised} raised), ${map.links.length} links (${stairs} with stairs), ${problems.length ? problems.length + ' problems' : 'OK'}`);
  for (const p of problems) console.log('  - ' + p);
  failures += problems.length;
}
process.exit(failures ? 1 : 0);
