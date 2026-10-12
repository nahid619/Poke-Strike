// 5v5 match against bots: you and four bot teammates against five bots.
// Rounds are won by eliminating the other team (or by having more players
// alive when the timer runs out). First team to `roundsToWin` takes the match.
import { Session } from '../game/session.js';
import { Character } from '../game/character.js';
import { Loadout } from '../game/weapons.js';
import { AbilityKit } from '../game/abilities.js';
import { attachNameTag } from '../game/nametag.js';
import { BotController } from '../ai/bot.js';
import { NavGraph } from '../ai/nav.js';
import { Senses } from '../ai/senses.js';
import { skillFor, DIFFICULTY } from '../ai/difficulty.js';
import { Spike, SPIKE } from '../game/spike.js';
import { SpikeFx } from '../game/spikefx.js';
import { AGENTS } from '../data/agents.js';
import { DEFAULT_LOADOUT } from '../data/weapons.js';
import map1 from '../data/maps/map1.js';

export const MATCH_TIMES = {
  buy: 5,      // pre-round countdown (frozen in spawn)
  round: 100,  // round length
  end: 4,      // pause after a round is decided
};
const ASSIST_WINDOW = 10; // damage within this many seconds before a kill counts as an assist
const SPECTATE_DELAY = 2; // seconds of death cam before spectating a teammate
export const TAKEOVER = {
  deathCam: 1.2,  // seconds looking at how you died
  glide: 0.5,     // seconds for the camera to move to the teammate you take over
};

const smooth = (k) => k * k * (3 - 2 * k);
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

const shuffle = (list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Balanced teams: one of each role first, then anyone left.
const ROLE_ORDER = ['Controller', 'Duelist', 'Initiator', 'Sentinel', 'Support'];

/** A team of `size` agents that starts from `fixed` and fills missing roles first. */
export function balancedTeam(size, fixed = []) {
  const team = [...fixed];
  const pool = shuffle(AGENTS.filter((a) => !team.includes(a)));
  for (const role of ROLE_ORDER) {
    if (team.length >= size) break;
    if (team.some((a) => a.role === role)) continue;
    const pick = pool.find((a) => a.role === role);
    if (pick) {
      team.push(pick);
      pool.splice(pool.indexOf(pick), 1);
    }
  }
  while (team.length < size && pool.length) team.push(pool.shift());
  return team;
}

/** Duelists enter, sentinels anchor, everyone else supports. */
function roleFor(agent) {
  if (agent.role === 'Duelist') return 'entry';
  if (agent.role === 'Sentinel') return 'anchor';
  return 'support';
}

/** Make sure a team has at least one entry, and an anchor if it has 3+ bots. */
function balanceRoles(bots) {
  const count = (r) => bots.filter((b) => b.controller.role === r).length;
  if (!count('entry')) {
    const pick = bots.find((b) => b.controller.role === 'support') ?? bots[0];
    if (pick) pick.controller.role = 'entry';
  }
  if (bots.length >= 3 && !count('anchor')) {
    const pick = bots.find((b) => b.controller.role === 'support');
    if (pick) pick.controller.role = 'anchor';
  }
}

export class MatchMode extends Session {
  constructor(shared, map = map1) {
    super({ ...shared, map });
    this.isMatch = true;
    this.nav = new NavGraph(map);
    this.spike = new Spike(this.events, map.sites);
    this.spikeFx = new SpikeFx(this.scene, this.spike, this.events, this.abilityFx);
    this.siteNodes = {};
    for (const [id, site] of Object.entries(map.sites)) this.siteNodes[id] = this.nav.nearest(site.x, site.z);
    // How far out the title-screen camera orbits.
    this.mapRadius = Math.max(...map.boxes.map((b) => Math.hypot(Math.abs(b.x) + b.w / 2, Math.abs(b.z) + b.d / 2) * 0.62));
    this.senses = new Senses(this.events);
    this.ctx.ai = {
      senses: this.senses, timeLeft: MATCH_TIMES.round, nav: this.nav,
      objective: { mode: 'elimination', spike: this.spike, siteNodes: this.siteNodes, sites: map.sites },
    };
    // Lane routes as node lists, for each team's direction of travel.
    this.routes = { ally: {}, enemy: {} };
    for (const [lane, ids] of Object.entries(map.routes)) {
      const nodes = ids.map((id) => this.nav.byId.get(id));
      this.routes.ally[lane] = nodes;
      this.routes.enemy[lane] = [...nodes].reverse();
    }
    this.bots = [];
    this.phase = 'idle'; // idle -> buy -> live -> end -> ... -> over
    this.stats = new Map();
    this.recentDamage = new Map(); // victim -> Map(attacker -> time)
    this.spectating = null;
    this.killedBy = null;
    this.controlledChar = null; // set when you take over a teammate
    this.takeover = null;       // { phase: 'deathcam' | 'glide', candidate, until, from }

    this.events.on('hit', (h) => this._onHit(h));
    this.events.on('kill', (k) => this._onKill(k));
    this.events.on('spikePlanted', () => (this.beepTimer = 0));
  }

  get finished() {
    return this.phase === 'over';
  }

  get controlled() {
    return this.controlledChar ?? this.player;
  }

  get players() {
    return this.ctx.characters.filter((c) => c.isCharacter);
  }

  team(name) {
    return this.players.filter((c) => c.team === name);
  }

  alive(name) {
    return this.team(name).filter((c) => c.alive).length;
  }

  // ---- setup ----

  /**
   * difficulty applies to the enemy team. Your teammates always play at
   * Medium, so the difficulty changes what you are up against.
   */
  /**
   * mode: 'spike' (plant and defuse, sides swap at halftime) or 'elimination'.
   */
  start({ agent, roundsToWin = 7, botMode = 'fight', difficulty = 'medium', takeover = true, allies = null, enemies = null, mode = 'spike' }) {
    for (const b of this.bots) this.remove(b);
    this.bots = [];
    this.abilityFx.clear();
    this.effects.clear();
    // Teams: yours is balanced around your pick; the enemy builds its own.
    allies = allies ?? balancedTeam(5, [agent]).slice(1);
    enemies = enemies ?? balancedTeam(5);
    this.options = { agent, roundsToWin, botMode, difficulty, takeover, allies, enemies, mode };
    this.ctx.ai.objective.mode = mode;
    // Plant and defuse: random sides for the first half, swap after roundsToWin - 1 rounds.
    this.attackers = Math.random() < 0.5 ? 'ally' : 'enemy';
    this.halftimeAfter = mode === 'spike' ? roundsToWin - 1 : 0;

    this.setAgent(agent);
    this.player.name = 'You';

    for (const [team, picks] of [['ally', allies], ['enemy', enemies]]) {
      for (const a of picks) {
        const bot = new Character({ name: a.name, team });
        bot.agent = a;
        bot.loadout = new Loadout(DEFAULT_LOADOUT);
        bot.abilities = new AbilityKit(a); // bots start using abilities in Phase 7
        const level = team === 'enemy' ? difficulty : 'medium';
        bot.damageScale = DIFFICULTY[level].damageScale;
        bot.brain = new BotController({
          nav: this.nav, ctx: this.ctx, mode: botMode, role: roleFor(a), skill: skillFor(level),
        });
        bot.setController(bot.brain);
        if (team === 'ally') attachNameTag(bot);
        this.bots.push(bot);
        this.add(bot);
      }
    }

    for (const team of ['ally', 'enemy']) balanceRoles(this.bots.filter((b) => b.team === team));

    this.stats.clear();
    for (const c of this.players) {
      this.stats.set(c, { kills: 0, deaths: 0, assists: 0, damage: 0, hits: 0, heads: 0 });
    }
    // Your own numbers, across every body you control.
    this.you = { kills: 0, killsAfterTakeover: 0, deaths: 0, assists: 0, damage: 0, hits: 0, heads: 0, takeovers: 0 };
    this.yourRecentDamage = new Map(); // victim -> time you last damaged them
    this.score = { ally: 0, enemy: 0 };
    this.history = []; // winner of each round: 'ally', 'enemy', or null for a draw
    this.round = 0;
    this.lastRound = null;
    this._startRound();
  }

  /** Same agents and options, new match. */
  restart() {
    this.start(this.options);
  }

  get spikeMode() {
    return this.options?.mode === 'spike';
  }

  /** 'attack' or 'defend' for a team, in plant-and-defuse rounds. */
  sideOf(team) {
    return team === this.attackers ? 'attack' : 'defend';
  }

  /** Empty map for the title screen background. */
  showcase() {
    for (const b of this.bots) this.remove(b);
    this.bots = [];
    this.zones.clear();
    this.abilityFx.clear();
    this.effects.clear();
    this.spike.reset(null, null);
    this.ctx.objective = null;
    this.phase = 'idle';
    this.takeover = null;
    this.controlledChar = null;
    this.player.setController(this.human);
    this.player.revive(this.map.spawn.x, 0, this.map.spawn.z, this.map.spawn.yaw);
    this.player.mesh.visible = false;
  }

  /** Most valuable player: most kills, then most damage. */
  mvp() {
    let best = null;
    for (const [c, s] of this.stats) {
      if (!best || s.kills > best.s.kills || (s.kills === best.s.kills && s.damage > best.s.damage)) best = { c, s };
    }
    return best;
  }

  _startRound() {
    if (this.swapSides) {
      this.attackers = this.attackers === 'ally' ? 'enemy' : 'ally';
      this.swapSides = false;
      this.events.emit('sidesSwapped', { attackers: this.attackers });
    }
    this.round++;
    this.phase = 'buy';
    this.timer = MATCH_TIMES.buy;
    this.zones.clear();
    this.recentDamage.clear();
    this.senses.reset();
    this.ctx.ai.timeLeft = MATCH_TIMES.round;
    this.spectating = null;
    this.killedBy = null;
    this.yourRecentDamage.clear();
    // Everyone gets their own controller back.
    this.takeover = null;
    this.controlledChar = null;
    for (const b of this.bots) if (b.controller !== b.brain) b.setController(b.brain);
    this.player.setController(this.human);

    for (const team of ['ally', 'enemy']) {
      const spawn = this.map.teamSpawns[team];
      const members = this.team(team);
      let points = shuffle(spawn.points);
      if (team === 'ally') {
        // You always start on the first ally spawn point; bots take the rest.
        const first = spawn.points[0];
        points = [first, ...shuffle(spawn.points.slice(1))];
        members.sort((a, b) => (a === this.player ? -1 : b === this.player ? 1 : 0));
      }
      members.forEach((c, i) => {
        const [x, z] = points[i % points.length];
        c.revive(x, 0, z, spawn.yaw);
        c.frozen = true;
        c.controller?.reset?.();
      });
    }

    // The spike goes to a random attacker, preferably not an entry (they lead
    // the push and die first).
    if (this.spikeMode) {
      const attackers = this.team(this.attackers);
      const safe = attackers.filter((c) => c.controller?.role !== 'entry');
      const pool = safe.length ? safe : attackers;
      this.spike.reset(this.attackers, pool[Math.floor(Math.random() * pool.length)]);
      this.ctx.objective = this.spike;
    } else {
      this.spike.reset(null, null);
      this.ctx.objective = null;
    }
    this.liveTime = 0;
    for (const team of ['ally', 'enemy']) {
      if (this.spikeMode) this._issueSpikeOrders(team);
      else this._issueOrders(team);
    }
    this.events.emit('roundStart', { round: this.round });
  }

  // ---- round flow ----

  onTick(dt) {
    if (this.phase === 'idle' || this.phase === 'over') return;
    this.timer -= dt;

    if (this.phase === 'buy') {
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = MATCH_TIMES.round;
        // In plant-and-defuse rounds attackers wait behind a barrier for a few seconds.
        for (const c of this.players) c.frozen = this.spikeMode && c.team === this.attackers;
        this.spike.active = this.spikeMode;
        this.events.emit('roundLive', { round: this.round });
      }
      return;
    }

    if (this.phase === 'live') {
      this.liveTime += dt;
      if (this.spikeMode && this.liveTime >= SPIKE.attackerBarrier && this.liveTime - dt < SPIKE.attackerBarrier) {
        for (const c of this.team(this.attackers)) c.frozen = false;
        this.events.emit('barrierDown', {});
      }
      this._tickTakeover();
      this.ctx.ai.timeLeft = this.timer;
      this.senses.tick(dt, this.ctx.characters);
      if (this.spikeMode) this._tickSpikeRound(dt);
      else {
        const a = this.alive('ally');
        const e = this.alive('enemy');
        if (a === 0 || e === 0) this._endRound(a > 0 ? 'ally' : e > 0 ? 'enemy' : null, 'elimination');
        else if (this.timer <= 0) this._endRound(a > e ? 'ally' : e > a ? 'enemy' : null, 'time');
      }
      return;
    }

    if (this.phase === 'end' && this.timer <= 0) {
      const won = Math.max(this.score.ally, this.score.enemy) >= this.options.roundsToWin;
      if (won) {
        this.phase = 'over';
        this.events.emit('matchEnd', { winner: this.score.ally > this.score.enemy ? 'ally' : 'enemy' });
      } else {
        this._startRound();
      }
    }
  }

  /** Plant-and-defuse win conditions. */
  _tickSpikeRound(dt) {
    const spike = this.spike;
    spike.tick(dt, this.ctx.characters);
    const atk = this.alive(this.attackers);
    const def = this.alive(spike.defenders);

    if (spike.planted && !spike.detonated && !spike.defused) {
      // Beeps speed up as the fuse runs down.
      this.beepTimer = (this.beepTimer ?? 0) - dt;
      if (this.beepTimer <= 0) {
        const k = spike.fuseLeft / SPIKE.fuse;
        this.beepTimer = 0.12 + 0.88 * k;
        this.events.emit('spikeBeep', { pos: spike.planted });
      }
    }

    if (spike.detonated) return this._endRound(this.attackers, 'detonated');
    if (spike.defused) return this._endRound(spike.defenders, 'defused');
    if (!spike.planted) {
      if (atk === 0) return this._endRound(spike.defenders, 'elimination');
      if (def === 0) return this._endRound(this.attackers, 'elimination');
      if (this.timer <= 0) return this._endRound(spike.defenders, 'time');
    } else if (def === 0) {
      // After the plant, killing every attacker is not enough: defenders must defuse.
      return this._endRound(this.attackers, 'elimination');
    }
  }

  _endRound(winner, reason) {
    this.phase = 'end';
    this.timer = MATCH_TIMES.end;
    this.spike.active = false;
    if (winner) this.score[winner]++;
    this.history.push(winner);
    const halftime = this.spikeMode && this.round === this.halftimeAfter &&
      Math.max(this.score.ally, this.score.enemy) < this.options.roundsToWin;
    if (halftime) this.swapSides = true;
    this.lastRound = { winner, reason, halftime, winnerSide: winner ? this.sideOf(winner) : null };
    for (const c of this.players) c.frozen = true; // the round is decided; everyone holds still
    this.events.emit('roundEnd', { round: this.round, winner, reason });
  }

  // ---- team plan ----

  /**
   * Each round, a team picks a lane to push. Entries lead it, supports trail
   * an entry (one may take another lane), and anchors hold a spot on their own
   * half, preferably watching a different lane.
   */
  _issueOrders(team) {
    const bots = this.bots.filter((b) => b.team === team);
    const lanes = shuffle(['A', 'M', 'B']);
    const main = lanes[0];
    const routes = this.routes[team];
    const half = team === 'ally' ? 'a' : 'e';
    const holds = shuffle(this.nav.nodes.filter((n) => n.hold && n.id.endsWith(half)));

    const entries = bots.filter((b) => b.controller.role === 'entry');
    const supports = bots.filter((b) => b.controller.role === 'support');
    const anchors = bots.filter((b) => b.controller.role === 'anchor');

    entries.forEach((b, i) => b.controller.setOrders({ kind: 'entry', route: routes[i === 0 ? main : lanes[1]] }));
    supports.forEach((b, i) => {
      // Every second support takes another lane on its own, to spread out.
      const flank = i % 2 === 1;
      const lane = flank ? lanes[1 + (i % 2)] : main;
      const leader = flank ? null : entries[0] ?? null;
      b.controller.setOrders({ kind: 'support', route: routes[lane], leader });
    });
    anchors.forEach((b, i) => {
      const preferred = holds.filter((h) => h.lane !== main);
      const holdNode = (preferred[i] ?? holds[i] ?? holds[0]) || null;
      b.controller.setOrders({ kind: 'anchor', route: routes[holdNode?.lane ?? lanes[2]], holdNode });
    });
  }

  /**
   * Plant and defuse. Attackers pick a site and push its lane; one lurks mid.
   * Defenders split across both sites and mid, watching each site.
   */
  _issueSpikeOrders(team) {
    const bots = this.bots.filter((b) => b.team === team);
    const routes = this.routes[team];
    if (team === this.attackers) {
      const target = Math.random() < 0.5 ? 'A' : 'B';
      // Spots defenders usually watch this site from: attackers check them on the way in.
      const checkSpots = this._defenseSpots(team === 'ally' ? 'enemy' : 'ally')[target].slice(0, 6);
      const siteNode = this.siteNodes[target];
      const full = routes[target];
      const route = full.slice(0, full.indexOf(siteNode) + 1);
      // Stage at the last waypoint before the site that can't see it (so
      // defenders watching the site can't pick off attackers who are waiting).
      const site = this.map.sites[target];
      const center = { x: site.x, y: 1.0, z: site.z };
      let stageIndex = Math.max(0, route.length - 2);
      for (let i = route.length - 2; i >= 0; i--) {
        stageIndex = i;
        if (!this.world.lineOfSight({ x: route[i].x, y: 1.6, z: route[i].z }, center, false)) break;
      }
      const entries = bots.filter((b) => b.controller.role === 'entry');
      const leader = entries[0] ?? null;
      // Everyone commits to the site together (the attackers' main advantage
      // over a defense split across both sites).
      const lurker = null;
      for (const b of bots) {
        const lurk = b === lurker;
        b.controller.setOrders({
          kind: 'attack', target, siteNode, fullRoute: full, stageIndex, checkSpots,
          route: lurk ? routes.M : route,
          leader: lurk || b === leader ? null : leader,
          lurk,
        });
      }
      return;
    }
    const spots = this._defenseSpots(team);
    const order = ['A', 'B', 'A', 'B', 'M'];
    const used = new Set();
    bots
      .sort((a, b) => (a.controller.role === 'anchor' ? -1 : 0) - (b.controller.role === 'anchor' ? -1 : 0))
      .forEach((b, i) => {
        const where = order[i % order.length];
        const node = spots[where].find((n) => !used.has(n)) ?? spots[where][0];
        used.add(node);
        const site = this.map.sites[where];
        b.controller.setOrders({
          kind: 'defend', site: where, holdNode: node,
          holdLook: site ? { x: site.x, z: site.z } : node.hold,
          route: routes[where === 'M' ? 'M' : where],
        });
      });
  }

  /** Good places for defenders to watch each site from (and mid). */
  _defenseSpots(team) {
    const half = team === 'ally' ? 'a' : 'e';
    const world = this.world;
    const out = {};
    for (const [id, site] of Object.entries(this.map.sites)) {
      const center = { x: site.x, y: 1.0, z: site.z };
      const scored = this.nav.nodes
        .filter((n) => !n.id.startsWith('spawn') && !n.id.startsWith('door'))
        .map((n) => ({ n, d: Math.hypot(n.x - site.x, n.z - site.z) }))
        .filter(({ n, d }) => d >= 3 && d <= 15 && world.lineOfSight({ x: n.x, y: 1.4, z: n.z }, center, false))
        .sort((a, b) => Math.abs(a.d - 8) - Math.abs(b.d - 8));
      // Stay on your own half when there are enough spots there.
      const own = scored.filter(({ n }) => n.id.endsWith(half)).map((s) => s.n);
      out[id] = own.length >= 2 ? own : scored.map((s) => s.n);
      if (!out[id].length) out[id] = [this.siteNodes[id]];
    }
    const mid = this.nav.nodes.filter((n) => n.hold && n.lane === 'M' && n.id.endsWith(half));
    out.M = mid.length ? mid : this.nav.nodes.filter((n) => n.lane === 'M' && n.id.endsWith(half));
    return out;
  }

  // ---- stats and kill feed ----

  _onHit({ attacker, victim, damage, dealt, part, ability }) {
    if (!attacker || attacker === victim) return;
    if (attacker === this.controlled && attacker.team !== victim.team) {
      this.you.damage += dealt ?? damage;
      if (!ability) {
        this.you.hits++;
        if (part === 'head') this.you.heads++;
      }
      this.yourRecentDamage.set(victim, this.ctx.time);
    }
    const st = this.stats.get(attacker);
    if (st) {
      st.damage += dealt ?? damage; // damage actually dealt, not overkill
      if (!ability) {
        st.hits++;
        if (part === 'head') st.heads++;
      }
    }
    if (!this.recentDamage.has(victim)) this.recentDamage.set(victim, new Map());
    this.recentDamage.get(victim).set(attacker, this.ctx.time);
    victim.controller?.notifyDamaged?.(attacker);
  }

  _onKill({ attacker, victim, part, ability, weapon }) {
    if (victim === this.spike.carrier) this.spike.drop(victim);
    if (!attacker) return;
    const ks = this.stats.get(attacker);
    const vs = this.stats.get(victim);
    if (ks && attacker.team !== victim.team) ks.kills++;
    if (vs) vs.deaths++;
    const helpers = this.recentDamage.get(victim);
    if (helpers) {
      for (const [who, at] of helpers) {
        if (who !== attacker && who.team !== victim.team && this.ctx.time - at <= ASSIST_WINDOW) {
          const st = this.stats.get(who);
          if (st) st.assists++;
        }
      }
    }
    const me = this.controlled;
    if (attacker === me && victim.team !== me.team) {
      this.you.kills++;
      if (me !== this.player) this.you.killsAfterTakeover++;
    } else if (victim.team !== me.team && this.ctx.time - (this.yourRecentDamage.get(victim) ?? -Infinity) <= ASSIST_WINDOW) {
      this.you.assists++;
    }
    if (victim === me) {
      this.killedBy = attacker;
      this.you.deaths++;
      if (this.options.takeover) this._beginTakeover(victim);
    }
    // Teammates nearby try to trade the kill.
    for (const mate of this.team(victim.team)) {
      if (mate !== victim && mate.alive) mate.controller?.notifyTeammateDown?.(attacker, victim.pos);
    }
    this.events.emit('feed', {
      you: me,
      killer: attacker,
      victim,
      how: ability ?? weapon?.name ?? '',
      headshot: !ability && part === 'head',
    });
  }

  // ---- takeover and spectating ----

  /** Living teammates you could take over, nearest to `from` first. */
  _candidates(from) {
    return this.team('ally')
      .filter((c) => c.alive && c !== this.controlled)
      .sort((a, b) => Math.hypot(a.pos.x - from.x, a.pos.z - from.z) - Math.hypot(b.pos.x - from.x, b.pos.z - from.z));
  }

  _beginTakeover(deadBody) {
    const candidate = this._candidates(deadBody.pos)[0];
    if (!candidate) {
      this.takeover = null; // nobody left; the round is about to end
      return;
    }
    this.takeover = { phase: 'deathcam', candidate, until: this.ctx.time + TAKEOVER.deathCam, from: null };
  }

  _tickTakeover() {
    const t = this.takeover;
    if (!t) return;
    // The chosen teammate died before we got there: pick the next one.
    if (!t.candidate.alive) {
      const next = this._candidates(this.controlled.pos)[0];
      if (!next) {
        this.takeover = null;
        return;
      }
      t.candidate = next;
      if (t.phase === 'glide') this._startGlide();
    }
    if (this.ctx.time < t.until) return;
    if (t.phase === 'deathcam') this._startGlide();
    else this._takeControl(t.candidate);
  }

  _startGlide() {
    const t = this.takeover;
    const dead = this.controlled;
    const from = dead.eyePosition(1, dead.pos.clone());
    t.phase = 'glide';
    t.from = { pos: from, yaw: dead.viewYaw, pitch: dead.viewPitch };
    t.start = this.ctx.time;
    t.until = this.ctx.time + TAKEOVER.glide;
  }

  _takeControl(body) {
    body.setController(this.human);
    this.human.input?.pressed.clear(); // don't carry a click into the new body
    this.controlledChar = body;
    this.takeover = null;
    this.you.takeovers++;
    this.events.emit('takeover', { body });
  }

  /**
   * During the glide, where the camera should be (between your body and the
   * teammate you are taking over). Null the rest of the time.
   */
  cameraPose(alpha) {
    const t = this.takeover;
    if (!t || t.phase !== 'glide' || !t.from) return null;
    const now = this.ctx.time + alpha / 60;
    const k = smooth(Math.min(1, Math.max(0, (now - t.start) / TAKEOVER.glide)));
    const to = t.candidate.eyePosition(alpha, t.candidate.pos.clone());
    return {
      pos: t.from.pos.clone().lerp(to, k),
      yaw: lerpAngle(t.from.yaw, t.candidate.viewYaw, k),
      pitch: t.from.pitch + (t.candidate.viewPitch - t.from.pitch) * k,
    };
  }

  /** Who the camera follows: whoever you control, your takeover target, or a teammate you spectate. */
  viewTarget() {
    const me = this.controlled;
    if (me.alive) return me;
    if (this.takeover) return this.takeover.phase === 'glide' ? this.takeover.candidate : me;
    if (this.options?.takeover || me.deathTime < SPECTATE_DELAY) return me;
    if (!this.spectating?.alive) this.spectating = this.team('ally').find((c) => c.alive && c !== me) ?? null;
    return this.spectating ?? me;
  }

  /** Click while dead: choose a different teammate to take over (or to watch). */
  cycleSpectate() {
    const mates = this.team('ally').filter((c) => c.alive && c !== this.controlled);
    if (!mates.length) return;
    if (this.takeover) {
      const i = mates.indexOf(this.takeover.candidate);
      this.takeover.candidate = mates[(i + 1) % mates.length];
      if (this.takeover.phase === 'glide') this._startGlide();
      return;
    }
    const i = mates.indexOf(this.spectating);
    this.spectating = mates[(i + 1) % mates.length];
  }
}
