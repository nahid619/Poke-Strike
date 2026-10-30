// Collision for characters against the map.
//
// The map is a list of axis-aligned boxes. A character is an upright cylinder
// (radius + height), which slides smoothly along walls and around corners.
// Vertical and horizontal movement are resolved separately each step:
//   1. move on Y  -> land on floors / bump heads on ceilings
//   2. move on XZ -> push out of walls, or step up onto low ledges (stairs)

const EPS = 1e-4;
const SKIN = 1e-3;
const MAX_SUBSTEP = 0.2; // meters; larger moves are split so nothing tunnels

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function yOverlap(b, y, h) {
  return y < b.maxY - EPS && y + h > b.minY + EPS;
}

function circleRectDist2(x, z, b) {
  const dx = x - clamp(x, b.minX, b.maxX);
  const dz = z - clamp(z, b.minZ, b.maxZ);
  return dx * dx + dz * dz;
}

/** How to push a circle out of a rectangle, or null if they don't touch. */
function circleRectPush(x, z, r, b) {
  const cx = clamp(x, b.minX, b.maxX);
  const cz = clamp(z, b.minZ, b.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return null;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: r - d };
  }
  // Center is inside the rectangle: leave through the nearest edge.
  const left = x - b.minX;
  const right = b.maxX - x;
  const back = z - b.minZ;
  const front = b.maxZ - z;
  const m = Math.min(left, right, back, front);
  if (m === left) return { nx: -1, nz: 0, depth: left + r };
  if (m === right) return { nx: 1, nz: 0, depth: right + r };
  if (m === back) return { nx: 0, nz: -1, depth: back + r };
  return { nx: 0, nz: 1, depth: front + r };
}

export class World {
  constructor() {
    this.boxes = [];
    this.smokes = []; // active smoke spheres { x, y, z, r } (managed by Zones)
  }

  /** `surface` is what the top of the box sounds like to walk on (see mapkit.js). */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, surface = 'concrete') {
    const box = { minX, minY, minZ, maxX, maxY, maxZ, surface };
    this.boxes.push(box);
    return box;
  }

  /**
   * What a character standing at (x, y, z) is standing on: the surface of the
   * highest box top under its feet, or 'concrete' if there is none.
   */
  surfaceAt(x, y, z, r = 0.2) {
    const r2 = r * r;
    let best = null;
    for (const b of this.boxes) {
      if (Math.abs(b.maxY - y) > 0.06) continue;
      if (circleRectDist2(x, z, b) >= r2) continue;
      if (!best || b.maxY > best.maxY) best = b;
    }
    return best?.surface ?? 'concrete';
  }

  overlapsCylinder(x, y, z, r, h) {
    const r2 = r * r;
    for (const b of this.boxes) {
      if (yOverlap(b, y, h) && circleRectDist2(x, z, b) < r2) return true;
    }
    return false;
  }

  /**
   * Move a character by (dx, dy, dz), resolving collisions.
   * Updates c.pos, c.vel (blocked components are removed), c.onGround,
   * and c.stepOffset (used to smooth the camera when stepping).
   */
  moveCharacter(c, dx, dy, dz, wasGrounded) {
    const longest = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(longest / MAX_SUBSTEP));
    for (let i = 0; i < steps; i++) {
      this._moveY(c, dy / steps);
      this._moveXZ(c, dx / steps, dz / steps, wasGrounded || c.onGround, c.stepHeight);
    }
  }

  _moveY(c, dy) {
    const oldY = c.pos.y;
    c.pos.y += dy;
    const r = c.radius - SKIN;
    const r2 = r * r;
    for (const b of this.boxes) {
      if (!yOverlap(b, c.pos.y, c.height)) continue;
      if (circleRectDist2(c.pos.x, c.pos.z, b) >= r2) continue;
      if (dy <= 0 && b.maxY <= oldY + EPS) {
        c.pos.y = b.maxY; // landed
        if (c.vel.y < 0) c.vel.y = 0;
        c.onGround = true;
      } else if (dy > 0 && b.minY >= oldY + c.height - EPS) {
        c.pos.y = b.minY - c.height; // head bump
        if (c.vel.y > 0) c.vel.y = 0;
      }
    }
  }

  _moveXZ(c, dx, dz, canStep, stepHeight) {
    c.pos.x += dx;
    c.pos.z += dz;
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      for (const b of this.boxes) {
        if (!yOverlap(b, c.pos.y, c.height)) continue;
        const hit = circleRectPush(c.pos.x, c.pos.z, c.radius, b);
        if (!hit) continue;

        // Low ledge: step up onto it instead of stopping.
        const rise = b.maxY - c.pos.y;
        if (
          canStep && rise > 0 && rise <= stepHeight &&
          !this.overlapsCylinder(c.pos.x, b.maxY, c.pos.z, c.radius - SKIN, c.height)
        ) {
          c.pos.y = b.maxY;
          c.stepOffset -= rise;
          moved = true;
          continue;
        }

        // Wall: push out and remove the velocity going into it (sliding).
        c.pos.x += hit.nx * (hit.depth + 1e-5);
        c.pos.z += hit.nz * (hit.depth + 1e-5);
        const into = c.vel.x * hit.nx + c.vel.z * hit.nz;
        if (into < 0) {
          c.vel.x -= hit.nx * into;
          c.vel.z -= hit.nz * into;
        }
        moved = true;
      }
      if (!moved) break;
    }
  }

  /**
   * Keep a grounded character glued to the floor when walking down stairs
   * or off small ledges, instead of briefly falling.
   */
  snapToGround(c, maxDrop) {
    const r = c.radius - SKIN;
    const r2 = r * r;
    let best = -Infinity;
    for (const b of this.boxes) {
      if (b.maxY > c.pos.y + EPS || b.maxY < c.pos.y - maxDrop) continue;
      if (circleRectDist2(c.pos.x, c.pos.z, b) >= r2) continue;
      if (b.maxY > best) best = b.maxY;
    }
    if (best === -Infinity) return false;
    const drop = c.pos.y - best;
    c.pos.y = best;
    c.stepOffset += drop;
    c.vel.y = 0;
    c.onGround = true;
    return true;
  }

  /**
   * Can a point `a` see point `b`? Walls always block. Smoke blocks too unless
   * useSmoke is false (abilities that only care about walls pass false).
   * Bots will use this for their vision.
   */
  lineOfSight(a, b, useSmoke = true) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    if (this.raycast(a, d, len - 1e-3)) return false;
    if (useSmoke) {
      for (const s of this.smokes) {
        if (segmentHitsSphere(a, d, len, s, s.r ?? s.radius)) return false;
      }
    }
    return true;
  }

  /**
   * Push overlapping characters apart (they are solid to each other).
   * Movement goes through moveCharacter, so nobody gets pushed into a wall.
   */
  separateCharacters(list) {
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (Math.abs(a.pos.y - b.pos.y) >= Math.min(a.height, b.height)) continue;
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        let d = Math.hypot(dx, dz);
        if (d >= min) continue;
        if (d < 1e-6) {
          const ang = Math.random() * Math.PI * 2;
          dx = Math.cos(ang);
          dz = Math.sin(ang);
          d = 1;
        }
        const push = (min - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        this.moveCharacter(a, -nx * push, 0, -nz * push, a.onGround);
        this.moveCharacter(b, nx * push, 0, nz * push, b.onGround);
      }
    }
  }

  /**
   * Could a character of this size walk in a straight line from a to b
   * (allowing small step-ups)? Used by bots to skip unneeded waypoints.
   */
  walkable(a, b, y, radius, height, stepHeight = 0.4) {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    for (let i = 1; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const z = a.z + ((b.z - a.z) * i) / steps;
      if (this.overlapsCylinder(x, y, z, radius, height) && this.overlapsCylinder(x, y + stepHeight, z, radius, height)) {
        return false;
      }
    }
    return true;
  }

  /** Is this point inside any smoke? */
  inSmoke(p) {
    for (const s of this.smokes) {
      const r = s.r ?? s.radius;
      if ((p.x - s.x) ** 2 + (p.y - s.y) ** 2 + (p.z - s.z) ** 2 < r * r) return true;
    }
    return false;
  }

  /** Nearest map hit along a ray: { t, nx, ny, nz } or null. */
  raycast(o, d, maxT) {
    let best = null;
    let bestT = maxT;
    for (const b of this.boxes) {
      const hit = rayBox(o, d, b, bestT);
      if (hit && hit.t < bestT) {
        bestT = hit.t;
        best = hit;
      }
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Raycasts (used for hitscan bullets, and later for bot line of sight).
// Rays use an origin `o` and a normalized direction `d` (any {x, y, z}).
// ---------------------------------------------------------------------------

const AXES = [
  ['x', 'minX', 'maxX'],
  ['y', 'minY', 'maxY'],
  ['z', 'minZ', 'maxZ'],
];

function segmentHitsSphere(a, d, len, c, r) {
  if (r <= 0) return false;
  const ox = c.x - a.x;
  const oy = c.y - a.y;
  const oz = c.z - a.z;
  const t = Math.max(0, Math.min(len, ox * d.x + oy * d.y + oz * d.z));
  const px = ox - d.x * t;
  const py = oy - d.y * t;
  const pz = oz - d.z * t;
  return px * px + py * py + pz * pz <= r * r;
}

/** Ray vs one box. Returns { t, nx, ny, nz } or null. */
export function rayBox(o, d, b, maxT) {
  let tmin = 0;
  let tmax = maxT;
  let hitAxis = -1;
  let hitSign = 0;
  for (let a = 0; a < 3; a++) {
    const [k, mn, mx] = AXES[a];
    const oa = o[k];
    const da = d[k];
    if (Math.abs(da) < 1e-12) {
      if (oa < b[mn] || oa > b[mx]) return null;
      continue;
    }
    const inv = 1 / da;
    let t1 = (b[mn] - oa) * inv;
    let t2 = (b[mx] - oa) * inv;
    let sign = -1; // entering through the min face: normal points to -axis
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp;
      sign = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      hitAxis = a;
      hitSign = sign;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (hitAxis === -1) return null; // ray starts inside the box
  return {
    t: tmin,
    nx: hitAxis === 0 ? hitSign : 0,
    ny: hitAxis === 1 ? hitSign : 0,
    nz: hitAxis === 2 ? hitSign : 0,
  };
}

/** Ray vs sphere. Returns distance t or null. */
export function raySphere(o, d, cx, cy, cz, r, maxT) {
  const ox = o.x - cx;
  const oy = o.y - cy;
  const oz = o.z - cz;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  let t = -b - s;
  if (t < 0) t = -b + s;
  return t >= 0 && t <= maxT ? t : null;
}

/** Ray vs upright cylinder (sides and caps). Returns distance t or null. */
export function rayCylinder(o, d, cx, cz, r, y0, y1, maxT) {
  let best = Infinity;
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-12) {
    const b = ox * d.x + oz * d.z;
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      for (const t of [(-b - s) / a, (-b + s) / a]) {
        if (t < 0) continue;
        const y = o.y + d.y * t;
        if (y >= y0 && y <= y1) {
          best = t;
          break;
        }
      }
    }
  }
  if (Math.abs(d.y) > 1e-12) {
    for (const yc of [y0, y1]) {
      const t = (yc - o.y) / d.y;
      if (t < 0 || t >= best) continue;
      const px = ox + d.x * t;
      const pz = oz + d.z * t;
      if (px * px + pz * pz <= r * r) best = t;
    }
  }
  return best <= maxT ? best : null;
}
