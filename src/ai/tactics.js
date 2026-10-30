// Team tactics: each round a bot team picks a plan, and it remembers what
// happened in earlier rounds so it can change things up and adapt to you.
//
// Attack plans (plant and defuse)
//   default  group up out of sight of the site, then go in together; one bot lurks
//   rush     everyone runs straight onto the site, no waiting, no pauses
//   split    three come through the site's lane and two through mid, at the same time
//   fake     two bots make noise and use utility on one site, then rotate; the
//            rest sneak (Shift) to the other site and hit it once defenders rotate
//   slow     sneak into position, hold map control, and hit late; one bot lurks
//            in the other lane to catch rotations
// Defense plans
//   standard two on each site, one in mid
//   stack    four on the site the attackers have hit most, one on the other
//   push     standard, but one bot pushes up early for a pick, then falls back
// Elimination plans
//   spread   lanes split between entries, supports, and anchors
//   rush     everyone takes the same lane, fast
//   hold     everyone holds an angle on their own half, then pushes late
//
// Memory: when one of a team's bots dies, the team remembers where the killer
// stood. A spot where they keep dying (two of your kills from the same place
// is enough) becomes "hot": bots pre-aim it, and on Medium and Hard they throw
// utility at it. Kills fade from memory over a couple of rounds. Attackers
// also avoid the site where they keep dying, and defenders stack the site
// attackers keep hitting.

export const PLANS = {
  attack: { default: 1, rush: 0.8, split: 0.9, fake: 0.7, slow: 0.9 },
  defend: { standard: 1, stack: 0.6, push: 0.6 },
  elimination: { spread: 1, rush: 0.8, hold: 0.7 },
};

// Easy bots only use the simplest plans.
const BASIC = { attack: ['default', 'rush'], defend: ['standard'], elimination: ['spread', 'rush'] };

export const TACTICS = {
  heatCell: 4,         // meters: kills from within 4 m of each other count as one spot
  heatDecay: 0.55,     // each new round, old kills count this much
  hotAt: 1.6,          // a spot this hot gets pre-aimed and hit with utility
  humanWeight: 1.5,    // your kills count extra: the bots are adapting to you
  repeatLast: 0.25,    // the plan used last round is this likely to be picked again
  repeatBefore: 0.6,   // ...and the one before that
  siteDecay: 0.7,      // how quickly defenders forget which site attackers hit
  deathAvoid: 0.6,     // attackers pick a site less the more they die in its lane
};

/** What one team remembers across the rounds of a match. */
export class TeamMemory {
  constructor() {
    this.reset();
  }

  reset() {
    this.heat = new Map();          // id -> { x, y, z, w }: where enemies killed us from
    this.plans = { attack: [], defend: [], elimination: [] }; // recent plans, newest last
    this.sites = [];                // recent attack sites we picked, newest last
    this.siteHits = { A: 0, B: 0 }; // where the other team planted (when we defended)
    this.laneDeaths = { A: 0, M: 0, B: 0 };
    this.hot = [];
  }

  /** One of ours died. `from` is where the killer stood (eye height y). */
  recordDeath(from, lane, byHuman = false) {
    const w = byHuman ? TACTICS.humanWeight : 1;
    // Join the closest remembered spot within heatCell meters, or start a new one.
    let key = null;
    let best = TACTICS.heatCell;
    for (const [k, c] of this.heat) {
      const d = Math.hypot(c.x - from.x, c.z - from.z);
      if (d < best) {
        best = d;
        key = k;
      }
    }
    key ??= this._nextKey = (this._nextKey ?? 0) + 1;
    const cell = this.heat.get(key) ?? { x: 0, y: 0, z: 0, w: 0 };
    // Weighted average, so the spot follows where the kills actually came from.
    cell.x = (cell.x * cell.w + from.x * w) / (cell.w + w);
    cell.y = (cell.y * cell.w + (from.y ?? 1.5) * w) / (cell.w + w);
    cell.z = (cell.z * cell.w + from.z * w) / (cell.w + w);
    cell.w += w;
    this.heat.set(key, cell);
    if (lane && lane in this.laneDeaths) this.laneDeaths[lane] += 1;
    this._refreshHot();
  }

  /** The other team planted on this site while we defended. */
  recordSiteHit(site) {
    if (site in this.siteHits) this.siteHits[site] += 1;
  }

  /** Called when a round ends: old memories fade. */
  endRound() {
    for (const [key, cell] of this.heat) {
      cell.w *= TACTICS.heatDecay;
      if (cell.w < 0.2) this.heat.delete(key);
    }
    for (const k of Object.keys(this.siteHits)) this.siteHits[k] *= TACTICS.siteDecay;
    for (const k of Object.keys(this.laneDeaths)) this.laneDeaths[k] *= TACTICS.heatDecay;
    this._refreshHot();
  }

  _refreshHot() {
    this.hot = [...this.heat.values()]
      .filter((c) => c.w >= TACTICS.hotAt)
      .sort((a, b) => b.w - a.w)
      .map((c) => ({ x: c.x, y: c.y, z: c.z, heat: c.w }));
  }
}

/** Pick from { name: weight } with a random number in [0, 1). */
function weighted(weights, rng) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = rng() * total;
  for (const [name, w] of entries) {
    r -= w;
    if (r < 0) return name;
  }
  return entries.at(-1)?.[0] ?? null;
}

/**
 * This round's plan. kind: 'attack', 'defend', or 'elimination'. basic: only
 * the simplest plans (Easy). Recent plans are less likely, so rounds vary.
 */
export function pickPlan(kind, memory, { basic = false, eco = false, rng = Math.random } = {}) {
  const weights = { ...PLANS[kind] };
  if (eco && weights.rush) weights.rush *= 2.5; // with cheap guns, rushing together is the best bet
  if (basic) for (const name of Object.keys(weights)) if (!BASIC[kind].includes(name)) weights[name] = 0;
  const recent = memory?.plans[kind] ?? [];
  const last = recent.at(-1);
  const before = recent.at(-2);
  if (last && weights[last]) weights[last] *= TACTICS.repeatLast;
  if (before && before !== last && weights[before]) weights[before] *= TACTICS.repeatBefore;
  // Defenders who have seen attackers favor one site lean toward stacking it.
  if (kind === 'defend' && memory && weights.stack) {
    const { A, B } = memory.siteHits;
    if (Math.abs(A - B) >= 1) weights.stack *= 2.2;
  }
  const plan = weighted(weights, rng);
  memory?.plans[kind].push(plan);
  if (memory && memory.plans[kind].length > 6) memory.plans[kind].shift();
  return plan;
}

/** Which site to attack: away from where we keep dying, and not always the same. */
export function pickSite(memory, sites = ['A', 'B'], rng = Math.random) {
  const weights = {};
  for (const s of sites) {
    weights[s] = 1 / (1 + TACTICS.deathAvoid * (memory?.laneDeaths[s] ?? 0));
    if (memory?.sites.at(-1) === s) weights[s] *= 0.7;
  }
  const site = weighted(weights, rng);
  memory?.sites.push(site);
  if (memory && memory.sites.length > 6) memory.sites.shift();
  return site;
}

/** The site defenders should stack: the one attackers have hit most (random on a tie). */
export function stackSite(memory, rng = Math.random) {
  const { A, B } = memory?.siteHits ?? { A: 0, B: 0 };
  if (Math.abs(A - B) < 0.3) return rng() < 0.5 ? 'A' : 'B';
  return A > B ? 'A' : 'B';
}

/** What a team's plan sounds like as a callout to you. */
export function planCallout(kind, plan, { site = null, other = null } = {}) {
  switch (`${kind}:${plan}`) {
    case 'attack:default': return `Default, then we hit ${site} together`;
    case 'attack:rush': return `Rush ${site}! Go fast`;
    case 'attack:split': return `Split ${site}: three from the lane, two from mid`;
    case 'attack:fake': return `Fake ${other}, then hit ${site}`;
    case 'attack:slow': return `Play slow and quiet, hit ${site} late. Lurker in ${other}`;
    case 'defend:standard': return 'Standard setup: two A, two B, one mid';
    case 'defend:stack': return `Stacking ${site}, one on ${other}`;
    case 'defend:push': return 'Standard setup, one of us pushes up early';
    case 'elimination:spread': return 'Spread out across the lanes';
    case 'elimination:rush': return `Everyone rush ${site === 'M' ? 'mid' : `${site} lane`}`;
    case 'elimination:hold': return 'Hold angles, then push late';
    default: return null;
  }
}
