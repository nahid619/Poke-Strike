// Map authoring kit, and the map data format.
//
// A map is a plain object:
//   id, name, about          identity and a one-line description for the picker
//   sky, fogNear, fogFar     background color and fog distances
//   light                    { hemi, sun, shadowSize } lighting strength and shadow area
//   palette                  material name -> color, used by the boxes
//   boxes                    [{ x, y, z, w, h, d, color }] solid geometry; (x, z) is the
//                            center, y is the bottom, color is a palette name
//   spawn                    { x, z, yaw } where you stand outside a match
//   teamSpawns               { ally: { yaw, points: [[x, z], ...] }, enemy: { ... } }
//   sites                    { A: { x, z, radius }, B: { ... } } bomb sites (for later)
//   waypoints                [{ id, x, z, tags, hold, lane }] bot navigation points.
//                            tags: 'choke', 'site', 'cover'. hold: point a hold spot
//                            watches. lane: 'A', 'M', or 'B'.
//   links                    [[idA, idB]] straight, walkable connections
//   routes                   { A: [ids], M: [ids], B: [ids] } lanes from the ally side
//                            to the enemy side; the enemy walks them in reverse
//
// Maps are point-symmetric for fairness: everything at (x, z) has a twin at
// (-x, -z). The helpers below let you write the south (ally) half and get the
// north half for free. `npm run test:maps` checks every map.

export const B = (x, y, z, w, h, d, color = 'wall') => ({ x, y, z, w, h, d, color });

/** A box and its point-symmetric twin. */
export const pair = (x, y, z, w, h, d, color) => [B(x, y, z, w, h, d, color), B(-x, y, -z, w, h, d, color)];

/**
 * Build the waypoint graph from the south half.
 *   half:       [[id, x, z, { tags, hold: [x, z] }], ...]  (ids get "a"; twins get "e")
 *   halfLinks:  [[id, id], ...]                             (twinned automatically)
 *   crossLinks: [[fullId, fullId], ...]                     (links across the middle)
 *   routes:     { A: [fullIds], M: [...], B: [...] }
 *   holdLanes:  { id: 'A' | 'M' | 'B' }                      lane of each south-half hold spot
 *   laneSplit:  x beyond which a point counts as lane A (west) or B (east)
 */
export function mirroredNav({ half, halfLinks, crossLinks = [], routes, holdLanes = {}, laneSplit = 10 }) {
  const waypoints = [];
  for (const [id, x, z, extra = {}] of half) {
    const { tags = [], hold = null } = extra;
    waypoints.push({ id: id + 'a', x, z, tags, hold: hold && { x: hold[0], z: hold[1] } });
    waypoints.push({ id: id + 'e', x: -x, z: -z, tags, hold: hold && { x: -hold[0], z: -hold[1] } });
  }
  const links = [];
  for (const [a, b] of halfLinks) {
    links.push([a + 'a', b + 'a']);
    links.push([a + 'e', b + 'e']);
  }
  links.push(...crossLinks);

  // Lanes: hold spots first, then route membership, then by position.
  const flip = { A: 'B', B: 'A', M: 'M' };
  for (const w of waypoints) {
    const base = w.id.slice(0, -1);
    if (holdLanes[base]) w.lane = w.id.endsWith('e') ? flip[holdLanes[base]] : holdLanes[base];
  }
  for (const [lane, ids] of Object.entries(routes)) {
    for (const id of ids) {
      const w = waypoints.find((p) => p.id === id);
      if (w && !w.lane) w.lane = lane;
    }
  }
  for (const w of waypoints) if (!w.lane) w.lane = w.x < -laneSplit ? 'A' : w.x > laneSplit ? 'B' : 'M';
  return { waypoints, links, routes };
}
