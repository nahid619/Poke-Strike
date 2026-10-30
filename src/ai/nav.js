// Waypoint navigation: a graph of points and straight links, searched with A*.
/**
 * The floor height a character would stand on at (x, z): the top of the
 * highest box under that point that has headroom above it (so platforms and
 * stairs count, and the inside of a wall doesn't). Maps keep walkable areas
 * free of overhangs, so each (x, z) has one floor.
 */
export function standHeight(boxes, x, z, headroom = 1.8) {
  const under = boxes.filter((b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2);
  let best = 0;
  for (const b of under) {
    const top = b.y + b.h;
    if (top <= best || top > 4.5) continue;
    const blocked = under.some((o) => o !== b && o.y < top + headroom && o.y + o.h > top + 0.01);
    if (!blocked) best = top;
  }
  return best;
}

export class NavGraph {
  constructor(map) {
    // Waypoints get their floor height (y) from the map, unless they set one.
    this.nodes = map.waypoints.map((w) => ({ ...w, y: w.y ?? standHeight(map.boxes, w.x, w.z), links: [] }));
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    for (const [a, b] of map.links) {
      const na = this.byId.get(a);
      const nb = this.byId.get(b);
      if (!na || !nb) throw new Error(`Bad nav link ${a} - ${b}`);
      const cost = Math.hypot(na.x - nb.x, na.z - nb.z);
      na.links.push({ node: nb, cost });
      nb.links.push({ node: na, cost });
    }
  }

  /**
   * Closest waypoint to a position (optionally one that `visible(node)`
   * accepts). Pass `y` to prefer waypoints on the same level (a platform
   * right above you is not "close").
   */
  nearest(x, z, visible = null, y = null) {
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2 + (y === null ? 0 : (4 * (n.y - y)) ** 2);
      if (d < bestD && (!visible || visible(n))) {
        bestD = d;
        best = n;
      }
    }
    return best ?? (visible ? this.nearest(x, z, null, y) : null);
  }

  random() {
    return this.nodes[Math.floor(Math.random() * this.nodes.length)];
  }

  /**
   * A* from node to node. Returns the list of nodes (including both ends), or null.
   * avoidLane: make paths through that lane cost more (a preference, not a wall).
   */
  path(start, goal, { avoidLane = null, penalty = 4 } = {}) {
    if (start === goal) return [start];
    const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z);
    const open = new Set([start]);
    const came = new Map();
    const g = new Map([[start, 0]]);
    const f = new Map([[start, h(start)]]);
    while (open.size) {
      let current = null;
      let bestF = Infinity;
      for (const n of open) {
        const fn = f.get(n);
        if (fn < bestF) {
          bestF = fn;
          current = n;
        }
      }
      if (current === goal) {
        const out = [current];
        while (came.has(out[0])) out.unshift(came.get(out[0]));
        return out;
      }
      open.delete(current);
      for (const { node, cost } of current.links) {
        const extra = avoidLane && node !== goal && node.lane === avoidLane ? cost * (penalty - 1) : 0;
        const tentative = g.get(current) + cost + extra;
        if (tentative < (g.get(node) ?? Infinity)) {
          came.set(node, current);
          g.set(node, tentative);
          f.set(node, tentative + h(node));
          open.add(node);
        }
      }
    }
    return null;
  }
}
