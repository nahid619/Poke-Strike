// 5v5 match against bots: you and four bot teammates against five bots.
// Rounds are won by eliminating the other team (or by having more players
// alive when the timer runs out). First team to `roundsToWin` takes the match.
import { Session, savedPrimary } from '../game/session.js';
import { Character } from '../game/character.js';
import { Loadout } from '../game/weapons.js';
import { AbilityKit } from '../game/abilities.js';
import { attachNameTag } from '../game/nametag.js';
import { BotController } from '../ai/bot.js';
import { NavGraph } from '../ai/nav.js';
import { Senses } from '../ai/senses.js';
import { TeamMemory, pickPlan, pickSite, stackSite, planCallout } from '../ai/tactics.js';
import { ECONOMY, addCredits, roundIncome, startingLoadout, purchase, teamBuy, botShopping } from '../game/economy.js';
import { Orbs, orbSpots, ORBS } from '../game/orbs.js';
import { addUltPoints } from '../game/abilities.js';
import { recordMatch } from '../game/history.js';

// Team deathmatch: respawns, first team to the kill target wins (or the most kills when time runs out).
export const DEATHMATCH = {
  respawn: 3,                          // seconds dead before you come back
  time: 360,                           // seconds in a match
  target: { 3: 25, 5: 40, 7: 50 },     // kills to win, by the "first to" setting
  primaries: { rifle: 3, carbine: 3, smg: 2, marksman: 2, shotgun: 1, sniper: 1 }, // what bots spawn with
};
import { skillFor, DIFFICULTY } from '../ai/difficulty.js';
import { Spike, SPIKE } from '../game/spike.js';
import { SpikeFx } from '../game/spikefx.js';
import { AGENTS } from '../data/agents.js';
import { DEFAULT_LOADOUT } from '../data/weapons.js';
import map1 from '../data/maps/map1.js';

export const MATCH_TIMES = {
  buy: 7,      // pre-round countdown (frozen in spawn; press B to pick a gun)
  round: 100,  // round length
  end: 4,      // pause after a round is decided
};
const BOT_SNIPER_CHANCE = 0.35; // chance per team per round that one bot takes the sniper
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
    // Ultimate orbs (see game/orbs.js).
    this.orbs = new Orbs(this.scene, this.events);
    this.orbSpots = orbSpots(this.nav);
    this.events.on('orbTaken', ({ who }) => this._ult(who, 1));
    // What each team remembers across rounds (see ai/tactics.js).
    this.memory = { ally: new TeamMemory(), enemy: new TeamMemory() };
    this.ctx.ai = {
      senses: this.senses, timeLeft: MATCH_TIMES.round, nav: this.nav,
      hot: { ally: this.memory.ally.hot, enemy: this.memory.enemy.hot }, // spots each team keeps dying to
      plans: { ally: null, enemy: null },
      orbs: this.orbs,
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
    this.events.on('spikeDefused', ({ who }) => this._ult(who, 1));
    this.events.on('spikePlanted', ({ site, who }) => {
      this._ult(who, 1);
      this.beepTimer = 0;
      this.memory[this.spike.defenders]?.recordSiteHit(site); // defenders remember where they got hit
      for (const c of this.team(this.attackers)) addCredits(c, ECONOMY.plant);
    });
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
    this.deathmatch = mode === 'deathmatch';
    this.dmTarget = DEATHMATCH.target[roundsToWin] ?? 40;
    this.lastRecord = null;

    this.setAgent(agent);
    this.player.name = 'You';
    // Everyone starts with 800 credits and the free sidearm (see game/economy.js).
    this.player.loadout = startingLoadout();

    for (const [team, picks] of [['ally', allies], ['enemy', enemies]]) {
      for (const a of picks) {
        const bot = new Character({ name: a.name, team });
        bot.agent = a;
        bot.loadout = startingLoadout();
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

    for (const team of ['ally', 'enemy']) this.memory[team].reset();
    this._syncHot();
    this._resetEconomy();
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

  /** End of a round: win or loss credits, and who keeps their gear. */
  _payRound(winner) {
    for (const team of ['ally', 'enemy']) {
      const won = team === winner;
      this.lossStreak[team] = won ? 0 : this.lossStreak[team] + 1;
      const income = roundIncome(won, this.lossStreak[team]);
      for (const c of this.team(team)) {
        addCredits(c, income);
        c.lastIncome = income;
        c.keepGear = c.alive;
        c.keptShield = c.alive ? c.shield : 0;
      }
    }
    this.lastWinner = winner;
  }

  /** A new half: 800 credits each, no gear, no streaks. */
  _resetEconomy() {
    this.lossStreak = { ally: 0, enemy: 0 };
    this.lastWinner = null;
    this.buyTier = { ally: null, enemy: null };
    for (const c of this.players) {
      c.credits = ECONOMY.start;
      c.keepGear = false;
      c.keptShield = 0;
      c.lastIncome = 0;
    }
  }

  _startRound() {
    let pistolRound = this.round === 0;
    if (this.swapSides) {
      this.attackers = this.attackers === 'ally' ? 'enemy' : 'ally';
      this.swapSides = false;
      this.events.emit('sidesSwapped', { attackers: this.attackers });
      this._resetEconomy();
      pistolRound = true;
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
        // Survivors keep their guns and what's left of their shield; everyone else starts over.
        if (c.keepGear && c.loadout) {
          c.loadout.refill();
          c.shield = c.keptShield;
        } else {
          c.loadout = startingLoadout();
          c.shield = 0;
        }
        c.bought = new Map();
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
    this.orbs.reset(this.orbSpots);
    this.orbClock = 0;
    if (this.deathmatch) this._deathmatchLoadouts();
    else this._botBuys(pistolRound);
    this.liveTime = 0;
    for (const team of ['ally', 'enemy']) {
      if (this.spikeMode) this._issueSpikeOrders(team);
      else this._issueOrders(team);
    }
    this.events.emit('roundStart', { round: this.round });
  }


  /** Buy (or sell back) from the buy menu during the countdown, with your credits. */
  buy(id) {
    if (!this.canBuy()) return null;
    const c = this.player;
    const result = purchase(c, id, { free: this.deathmatch, bought: (c.bought ??= new Map()), ctx: this.ctx });
    if (this.deathmatch && result.ok && c.loadout.weapons[0]) c.dmPrimary = c.loadout.weapons[0].def.id; // respawn with it
    return result;
  }

  /**
   * Bots buy with their own credits, by a team decision (see economy.js):
   * full buy, force, bonus, eco, or the pistol round. At most one bot per
   * team takes the sniper (usually an anchor, who holds long angles).
   */
  _botBuys(pistolRound = false) {
    for (const team of ['ally', 'enemy']) {
      const bots = this.bots.filter((b) => b.team === team);
      const tier = teamBuy(this.team(team).map((c) => c.credits ?? 0), {
        pistolRound,
        lostLast: !!this.lastWinner && this.lastWinner !== team,
        wonLast: this.lastWinner === team,
        lossStreak: this.lossStreak[team],
      });
      this.buyTier[team] = tier;
      const sniper = Math.random() < BOT_SNIPER_CHANCE
        ? bots.find((b) => b.brain?.role === 'anchor') ?? bots.find((b) => b.brain?.role === 'support')
        : null;
      for (const b of bots) {
        b.bought = new Map();
        for (const id of botShopping(b, tier, { sniper: b === sniper })) purchase(b, id, { bought: b.bought });
      }
      this.events.emit('teamBuy', { team, tier });
    }
  }

  // ---- round flow ----

  onTick(dt) {
    if (this.phase === 'idle' || this.phase === 'over') return;
    this.timer -= dt;

    if (this.phase === 'buy') {
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = MATCH_TIMES.round;
        if (this.deathmatch) this.timer = DEATHMATCH.time;
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
      this.senses.tick(dt);
      this.orbs.tick(dt, this.ctx.characters);
      if (this.deathmatch) this._tickDeathmatch(dt);
      else if (this.spikeMode) this._tickSpikeRound(dt);
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
        this._finish(this.score.ally > this.score.enemy ? 'ally' : 'enemy');
      } else {
        this._startRound();
      }
    }
  }

  /** The match is over: save it to your history (see game/history.js). */
  _finish(winner) {
    this.phase = 'over';
    const you = this.you;
    this.lastRecord = recordMatch({
      map: this.map.name, mapId: this.map.id, mode: this.options.mode, difficulty: this.options.difficulty,
      agent: this.player.agent?.name ?? '', won: winner === 'ally', draw: !winner,
      us: this.score.ally, them: this.score.enemy, kills: you.kills, deaths: you.deaths, assists: you.assists,
    });
    this.events.emit('matchEnd', { winner });
  }

  /** Ultimate points; tells everyone when someone's ultimate becomes ready. */
  _ult(c, n) {
    if (c && addUltPoints(c, n)) this.events.emit('ultReady', { who: c });
  }

  /** Deathmatch: everyone spawns with a gun and full shield, and nothing costs anything. */
  _deathmatchLoadouts() {
    const pick = () => {
      const entries = Object.entries(DEATHMATCH.primaries);
      let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
      for (const [id, w] of entries) if ((r -= w) < 0) return id;
      return 'rifle';
    };
    for (const c of this.players) {
      c.loadout = startingLoadout();
      c.loadout.setSlot(0, c === this.player ? savedPrimary() : pick(), c);
      c.dmPrimary = c.loadout.weapons[0].def.id;
      c.shield = 50;
    }
    for (const b of this.bots) this._deathmatchOrders(b);
  }

  _deathmatchOrders(b) {
    const lane = ['A', 'M', 'B'][Math.floor(Math.random() * 3)];
    b.brain?.setOrders({ kind: 'entry', route: this.routes[b.team][lane], rush: Math.random() < 0.5,
      plan: { name: 'deathmatch', members: [], ready: new Set(), go: true } });
  }

  /** Deathmatch: respawns, orbs coming back, and the win check. */
  _tickDeathmatch(dt) {
    for (const c of this.players) {
      if (c.alive || c.deathTime < DEATHMATCH.respawn) continue;
      const spawn = this.map.teamSpawns[c.team];
      const [x, z] = spawn.points[Math.floor(Math.random() * spawn.points.length)];
      c.revive(x, 0, z, spawn.yaw);
      c.loadout = startingLoadout();
      c.loadout.setSlot(0, c.dmPrimary ?? 'rifle', c);
      c.shield = 50;
      c.frozen = false;
      if (c === this.player) {
        this.spectating = null;
        this.killedBy = null;
        this.events.emit('respawn', { who: c });
      } else {
        c.brain?.reset?.();
        this._deathmatchOrders(c);
      }
    }
    this.orbClock += dt;
    if (this.orbClock >= ORBS.respawn) {
      this.orbClock = 0;
      this.orbs.reset(this.orbSpots);
    }
    const { ally, enemy } = this.score;
    if (ally >= this.dmTarget || enemy >= this.dmTarget || this.timer <= 0) {
      this._finish(ally > enemy ? 'ally' : enemy > ally ? 'enemy' : null);
    }
  }

  /** Deathmatch: buy any time you're alive, for free. */
  canBuy() {
    if (this.deathmatch) return this.phase !== 'over' && Session.prototype.canBuy.call(this);
    return this.phase === 'buy' && Session.prototype.canBuy.call(this);
  }

  updateVisuals(dt, camera) {
    super.updateVisuals(dt, camera);
    this.orbs.update(dt);
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
    for (const team of ['ally', 'enemy']) this.memory[team].endRound();
    this._syncHot();
    this._payRound(winner);
    for (const c of this.players) c.frozen = true; // the round is decided; everyone holds still
    this.events.emit('roundEnd', { round: this.round, winner, reason });
  }

  // ---- team plan ----

  _syncHot() {
    for (const team of ['ally', 'enemy']) this.ctx.ai.hot[team] = this.memory[team].hot;
  }

  /** The bots on a team that play the round (not you, not switched off). */
  _planBots(team) {
    return this.bots.filter((b) => b.team === team && b.controller === b.brain);
  }

  _announcePlan(team, kind, plan, extra) {
    this.ctx.ai.plans[team] = { kind, plan, ...extra };
    const text = planCallout(kind, plan, extra);
    if (text) this.events.emit('teamPlan', { team, kind, plan, text, ...extra });
  }

  /** Basic plans only for Easy enemies. */
  _basic(team) {
    return team === 'enemy' && this.options.difficulty === 'easy';
  }

  /**
   * Elimination: each round a team picks a plan (see ai/tactics.js). Entries
   * lead, supports trail an entry (one may flank), anchors hold their half.
   */
  _issueOrders(team) {
    const bots = this._planBots(team);
    const plan = pickPlan('elimination', this.memory[team], { basic: this._basic(team) });
    const lanes = shuffle(['A', 'M', 'B']);
    const main = lanes[0];
    const routes = this.routes[team];
    const half = team === 'ally' ? 'a' : 'e';
    const holds = shuffle(this.nav.nodes.filter((n) => n.hold && n.id.endsWith(half)));
    const shared = { name: plan, members: bots, ready: new Set(), go: true };
    this._announcePlan(team, 'elimination', plan, { site: main });

    if (plan === 'rush') {
      const leader = bots.find((b) => b.controller.role === 'entry') ?? bots[0];
      for (const b of bots) {
        b.controller.setOrders({ kind: 'entry', route: routes[main], leader: b === leader ? null : leader, rush: true, plan: shared });
      }
      return;
    }
    if (plan === 'hold') {
      // Everyone holds a spot, then pushes once the clock passes pushAt.
      const pushAt = 55 + Math.random() * 20;
      bots.forEach((b, i) => {
        const holdNode = holds[i % Math.max(1, holds.length)] ?? null;
        b.controller.setOrders({ kind: 'anchor', route: routes[holdNode?.lane ?? lanes[i % 3]], holdNode, pushAt, plan: shared });
      });
      return;
    }

    const entries = bots.filter((b) => b.controller.role === 'entry');
    const supports = bots.filter((b) => b.controller.role === 'support');
    const anchors = bots.filter((b) => b.controller.role === 'anchor');
    entries.forEach((b, i) => b.controller.setOrders({ kind: 'entry', route: routes[i === 0 ? main : lanes[1]], plan: shared }));
    supports.forEach((b, i) => {
      // Every second support takes another lane on its own, to spread out.
      const flank = i % 2 === 1;
      const lane = flank ? lanes[1 + (i % 2)] : main;
      const leader = flank ? null : entries[0] ?? null;
      b.controller.setOrders({ kind: 'support', route: routes[lane], leader, sneak: flank, plan: shared });
    });
    anchors.forEach((b, i) => {
      const preferred = holds.filter((h) => h.lane !== main);
      const holdNode = (preferred[i] ?? holds[i] ?? holds[0]) || null;
      b.controller.setOrders({ kind: 'anchor', route: routes[holdNode?.lane ?? lanes[2]], holdNode, plan: shared });
    });
  }

  /**
   * Plant and defuse. Attackers pick a plan and a site (see ai/tactics.js);
   * defenders pick a setup.
   */
  _issueSpikeOrders(team) {
    if (team === this.attackers) return this._attackOrders(team);
    return this._defendOrders(team);
  }

  /** Index on `route` of the last waypoint before the site that can't see it (where attackers wait). */
  _stageIndex(route, siteId) {
    const site = this.map.sites[siteId];
    const center = { x: site.x, y: 1.0, z: site.z };
    let stageIndex = Math.max(0, route.length - 2);
    for (let i = route.length - 2; i >= 0; i--) {
      stageIndex = i;
      if (!this.world.lineOfSight({ x: route[i].x, y: route[i].y + 1.6, z: route[i].z }, center, false)) break;
    }
    return stageIndex;
  }

  /** The team's own lane route up to the site node (the full route continues past it). */
  _toSite(team, siteId) {
    const full = this.routes[team][siteId];
    const siteNode = this.siteNodes[siteId];
    return full.slice(0, full.indexOf(siteNode) + 1);
  }

  /** A route through mid that turns off toward a site (for split pushes). */
  _viaMid(team, siteId) {
    const mid = this.routes[team].M;
    const siteNode = this.siteNodes[siteId];
    // Leave the mid route at the node closest to the site, in the first two thirds of it.
    const limit = Math.max(1, Math.floor(mid.length * 0.67));
    let best = 0;
    for (let i = 1; i < limit; i++) {
      if (Math.hypot(mid[i].x - siteNode.x, mid[i].z - siteNode.z) < Math.hypot(mid[best].x - siteNode.x, mid[best].z - siteNode.z)) best = i;
    }
    const tail = this.nav.path(mid[best], siteNode);
    return tail ? [...mid.slice(0, best), ...tail] : this._toSite(team, siteId);
  }

  _attackOrders(team) {
    const bots = this._planBots(team);
    const memory = this.memory[team];
    const plan = pickPlan('attack', memory, { basic: this._basic(team), eco: ['eco', 'pistol'].includes(this.buyTier?.[team]) });
    const target = pickSite(memory);
    const other = target === 'A' ? 'B' : 'A';
    const defenders = team === 'ally' ? 'enemy' : 'ally';
    const checkSpots = this._defenseSpots(defenders)[target].slice(0, 6);
    const siteNode = this.siteNodes[target];
    const fullRoute = this.routes[team][target];
    const route = this._toSite(team, target);
    const stageIndex = this._stageIndex(route, target);
    const now = this.ctx.time;

    // Shared by the team's bots: who has reached the waiting point, and when to go.
    const shared = {
      name: plan, members: bots, ready: new Set(), go: false, firstReady: null,
      wait: plan !== 'rush', stageTimeout: 8, goBy: null, fakeDone: plan !== 'fake', fakeDoneAt: null,
    };
    if (plan === 'split') shared.stageTimeout = 11;
    if (plan === 'slow') {
      shared.stageTimeout = 30;
      shared.goBy = 40 + Math.random() * 20; // round clock (seconds left) when the hit goes in
    }
    if (plan === 'fake') shared.stageTimeout = 16;

    const base = { kind: 'attack', target, siteNode, fullRoute, checkSpots, plan: shared };
    const carrier = this.spike.carrier;
    // Roles in the plan. The spike carrier is never a faker or the lurker.
    const order = [...bots].sort((a, b) => (a === carrier) - (b === carrier) || (a.controller.role === 'entry' ? -1 : 0));
    const leader = bots.find((b) => b.controller.role === 'entry') ?? bots[0] ?? null;

    if (plan === 'rush') {
      for (const b of bots) {
        b.controller.setOrders({ ...base, route, stageIndex, leader: null, rush: true });
      }
    } else if (plan === 'split') {
      const viaMid = this._viaMid(team, target);
      const midStage = this._stageIndex(viaMid, target);
      // Two through mid (not the carrier), the rest through the lane.
      const midGroup = new Set(order.filter((b) => b !== carrier).slice(0, Math.min(2, bots.length - 1)));
      for (const b of bots) {
        const mid = midGroup.has(b);
        b.controller.setOrders({ ...base, route: mid ? viaMid : route, stageIndex: mid ? midStage : stageIndex, leader: null });
      }
    } else if (plan === 'fake') {
      // Two make noise on the other site, then rotate; the rest sneak to the real one.
      const fakeRoute = this._toSite(team, other);
      const fakeStage = this._stageIndex(fakeRoute, other);
      const fakers = new Set(order.filter((b) => b !== carrier).slice(0, Math.min(2, bots.length - 1)));
      for (const b of bots) {
        if (fakers.has(b)) {
          b.controller.setOrders({ ...base, route: fakeRoute.slice(0, fakeStage + 2), stageIndex: fakeStage, leader: null, fake: true });
        } else {
          b.controller.setOrders({ ...base, route, stageIndex, leader: null, sneak: true });
        }
      }
    } else {
      // default and slow: group up and go together; one bot lurks in the other lane.
      const lurker = bots.length >= 4 ? order.find((b) => b !== carrier && b !== leader && b.controller.role !== 'entry') ?? null : null;
      const lurkRoute = this._toSite(team, other);
      const lurkStage = this._stageIndex(lurkRoute, other);
      for (const b of bots) {
        if (b === lurker) {
          b.controller.setOrders({ ...base, route: lurkRoute.slice(0, lurkStage + 1), stageIndex: lurkStage, leader: null, lurk: true, sneak: true,
            lurkLook: this.map.sites[other] });
        } else {
          b.controller.setOrders({ ...base, route, stageIndex, leader: b === leader ? null : leader, sneak: plan === 'slow' });
        }
      }
    }
    shared.createdAt = now;
    this._announcePlan(team, 'attack', plan, { site: target, other });
  }

  _defendOrders(team) {
    const bots = this._planBots(team);
    const routes = this.routes[team];
    const plan = pickPlan('defend', this.memory[team], { basic: this._basic(team) });
    const stack = stackSite(this.memory[team]);
    const other = stack === 'A' ? 'B' : 'A';
    const spots = this._defenseSpots(team);
    const order = plan === 'stack' ? [stack, stack, other, stack, stack] : ['A', 'B', 'A', 'B', 'M'];
    const used = new Set();
    const shared = { name: plan, members: bots, ready: new Set(), go: true };
    // Pushers: one bot (a duelist if there is one) takes space early, then falls back.
    const pusher = plan === 'push'
      ? bots.find((b) => b.controller.role === 'entry') ?? bots[Math.floor(Math.random() * bots.length)]
      : null;
    bots
      .sort((a, b) => (a.controller.role === 'anchor' ? -1 : 0) - (b.controller.role === 'anchor' ? -1 : 0))
      .forEach((b, i) => {
        const where = order[i % order.length];
        const node = spots[where].find((n) => !used.has(n)) ?? spots[where][0];
        used.add(node);
        const site = this.map.sites[where];
        const route = routes[where === 'M' ? 'M' : where];
        const orders = {
          kind: 'defend', site: where, holdNode: node,
          holdLook: site ? { x: site.x, z: site.z } : node.hold,
          route, plan: shared,
        };
        if (b === pusher) {
          const k = Math.min(route.length - 2, Math.max(1, Math.round(route.length * 0.6)));
          orders.push = { node: route[k], look: route[k + 1], holdFor: 7 + Math.random() * 7 };
        }
        b.controller.setOrders(orders);
      });
    this._announcePlan(team, 'defend', plan, { site: stack, other });
  }

  /** Good places for defenders to watch each site from (and mid). */
  _defenseSpots(team) {
    const half = team === 'ally' ? 'a' : 'e';
    const world = this.world;
    const out = {};
    for (const [id, site] of Object.entries(this.map.sites)) {
      const center = { x: site.x, y: 1.0, z: site.z };
      // The center and four points around it: a spot that sees any of them sees part of the site.
      const looks = [center, ...[[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].map(([dx, dz]) => ({ x: site.x + dx, y: 1.0, z: site.z + dz }))];
      // Best about 8 m from the site; high ground counts extra; a little
      // randomness each round so the same spots aren't always taken.
      const score = ({ n, d }) => Math.abs(d - 8) - (n.y > 0.5 ? 4.5 : 0) + Math.random() * 2.5;
      const scored = this.nav.nodes
        .filter((n) => !n.id.startsWith('spawn') && !n.id.startsWith('door'))
        .map((n) => ({ n, d: Math.hypot(n.x - site.x, n.z - site.z) }))
        .filter(({ n, d }) => d >= 3 && d <= 15 && looks.some((p) => world.lineOfSight({ x: n.x, y: n.y + 1.6, z: n.z }, p, false))) // sees part of the site
        .map((s) => ({ ...s, score: score(s) }))
        .sort((a, b) => a.score - b.score);
      // Stay on your own half when there are enough spots there (high ground is open to both teams).
      const own = scored.filter(({ n }) => n.id.endsWith(half) || n.y > 0.5).map((s) => s.n);
      out[id] = own.length >= 2 ? own : scored.map((s) => s.n);
      if (!out[id].length) out[id] = [this.siteNodes[id]];
    }
    const mid = shuffle(this.nav.nodes.filter((n) => n.hold && n.lane === 'M' && n.id.endsWith(half)))
      .sort((a, b) => (b.y > 0.5) - (a.y > 0.5) || 0);
    if (mid.length > 1 && Math.random() < 0.4) mid.push(mid.shift()); // not always the high spot
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
    if (attacker.team !== victim.team && this.phase === 'live') {
      addCredits(attacker, ECONOMY.kill);
      this._ult(attacker, 1);
      this._ult(victim, 1);
      if (this.deathmatch) this.score[attacker.team]++;
      // The victim's team remembers where the shot came from (see ai/tactics.js).
      const human = attacker.controller === this.human;
      const from = { x: attacker.pos.x, y: attacker.pos.y + attacker.eyeHeight, z: attacker.pos.z };
      this.memory[victim.team].recordDeath(from, this.nav.nearest(victim.pos.x, victim.pos.z)?.lane, human);
      this._syncHot();
    }
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
      if (this.options.takeover && !this.deathmatch) this._beginTakeover(victim);
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
