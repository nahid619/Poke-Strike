// Waypoint navigation: a graph of points and straight links, searched with A*.
export class NavGraph {
  constructor(map) {
    this.nodes = map.waypoints.map((w) => ({ ...w, links: [] }));
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

  /** Closest waypoint to a position (optionally one that `visible(node)` accepts). */
  nearest(x, z, visible = null) {
    let best = null;
    let bestD = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bestD && (!visible || visible(n))) {
        bestD = d;
        best = n;
      }
    }
    return best ?? (visible ? this.nearest(x, z) : null);
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
