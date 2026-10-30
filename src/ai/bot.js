// Bot brain: a state machine driven by role, senses, and the round clock.
//
// States
//   HOLD     stand at a spot and watch an angle (anchors; also after a retreat)
//   PUSH     advance along a lane route, node by node, pausing at chokes
//   ROTATE   run to another lane where teammates spotted enemies
//   FIGHT    engage a visible enemy: react, aim, burst, strafe between bursts
//   RETREAT  low on health: back off out of the enemy's sight and reload
//   SEARCH   hunt toward the last known enemy position
//
// Roles (from the agent's class)
//   entry    (duelists) pushes the team's chosen lane first
//   support  (controllers, initiators, supports) trails an entry and trades
//   anchor   (sentinels) holds a spot on its own half and rotates to help
//
// Senses: sight (range, field of view, walls and smoke block it), hearing
// (running, gunshots, abilities; walking is silent), and team intel (what
// teammates spotted). Difficulty levels tune BOT_SKILL in Phase 7.
//
// Each round the team picks a plan (see tactics.js) and hands out orders:
// rushers never stop, fakers make noise on one site and then rotate, lurkers
// sneak to the other lane and wait, and sneakers walk (Shift) once past the
// middle of the map until the hit goes in. Bots jiggle-peek corners (tap
// left and right) when they lose sight of someone or hear footsteps close,
// and pre-aim the spots where their team keeps getting killed.
import { MOVE } from '../game/character.js';
import { botAbilities } from './botabilities.js';
import { SPIKE } from '../game/spike.js';

const DEG = Math.PI / 180;

export const BOT_SKILL = {
  reaction: [0.45, 0.7],   // seconds before the first shot at a new target
  aimError: 2.5,           // degrees of initial aim error...
  aimSettle: 0.9,          // ...which shrinks with this time constant (s)
  turnRate: 300,           // degrees per second
  headChance: 0.2,         // chance to aim at the head for an engagement
  burst: [3, 5],           // bullets per burst
  burstPause: [0.25, 0.45],
  strafeChance: 0.5,       // chance to strafe during a pause between bursts
  recoilControl: 0.6,      // how much of their own recoil they pull down
  viewDistance: 60,
  fov: 110,                // degrees
  nearSense: 4,            // notices anyone this close, whatever the angle
  perceiveEvery: 0.1,
  retreatHealth: 35,       // back off below this health (if teammates are alive); 0 = never
  abilityUse: 0.6,         // see src/ai/difficulty.js
  teamwork: 1,
  peek: 0.5,               // chance to jiggle-peek instead of standing still (0 = never)
  adapt: 1,                // 0 = ignore, 1 = pre-aim spots the team keeps dying to, 2 = also always utility them
};

export const STATE = {
  HOLD: 'hold', PUSH: 'push', ROTATE: 'rotate', FIGHT: 'fight', RETREAT: 'retreat', SEARCH: 'search',
  // plant and defuse
  PLANT: 'plant', DEFUSE: 'defuse', FETCH: 'fetch', GUARD: 'guard', RETAKE: 'retake',
};

const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const dist2d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const blankIntent = () => ({
  forward: 0, right: 0, walk: false, jump: false,
  fireHeld: false, firePressed: false, reload: false, switchTo: null, switchDelta: 0,
  abilityQ: false, abilityE: false, abilityX: false, interact: false, crouch: false,
  adsPressed: false, adsHeld: false, adsHold: true,
});

export class BotController {
  /**
   * mode: 'idle' (stand still), 'wander' (walk around, never shoot), or
   * 'fight' (play the round with the full brain).
   */
  constructor({ nav, ctx, mode = 'fight', skill = BOT_SKILL, role = 'support' }) {
    this.nav = nav;
    this.ctx = ctx;
    this.mode = mode;
    this.skill = skill;
    this.role = role;
    this.orders = null;
    this.seed = Math.random() * 10;
    this.reset();
  }

  attach(character) {
    this.c = character;
  }

  /** Fresh state for a new round. */
  reset() {
    this.state = this.orders?.kind === 'anchor' ? STATE.HOLD : STATE.PUSH;
    this.path = null;
    this.pathIndex = 0;
    this.goalNode = null;
    this.arrivedAt = null;
    this.stuckClock = 0;
    this.stuckFrom = null;
    this.stuck = this.stuck ?? 0;
    this.sidestep = 0;
    this.target = null;
    this.targetVisible = false;
    this.lastSeen = null;
    this.lostTimer = 0;
    this.reaction = 0;
    this.aimErr = { yaw: 0, pitch: 0 };
    this.aimHead = false;
    this.burstTimer = 0;
    this.burstPause = 0;
    this.strafeDir = 0;
    this.alertYaw = null;
    this.alertTimer = 0;
    this.lastHeardTime = -Infinity;
    this.heardEnemyAt = -Infinity;
    this.heardDistance = Infinity;
    this.perceiveTimer = Math.random() * this.skill.perceiveEvery;
    this.routeIndex = null;
    this.pauseTimer = 0;
    this.waited = 0;
    this.holdSpot = null;
    this.holdUntil = 0;
    this.retreatNode = null;
    this.retreatUntil = 0;
    this.retreated = false;
    this.lastRotate = -Infinity;
    this.searchPoint = null;
    this.guardNode = null;
    this.guardFor = null;
    this.staged = false;
    this.stageStart = null;
    this.endHold = null;     // lurk or fake: waiting at the end of the route
    this.danger = null;      // a spot the team keeps dying to, in view right now
    this.dangerSince = null;
    this.pastMiddle = false;
    this.peeking = false;    // jiggle the corner where a target just disappeared
    this.peekPause = false;  // jiggle while pausing at a choke
    this.peekHeard = false;  // jiggle toward footsteps heard close by
    this.jiggleTimer = 0;
    this.jiggleDir = 1;
  }

  /** Per-round instructions from the team: { kind, route, leader, holdNode }. */
  setOrders(orders) {
    this.orders = orders;
    this.state = orders.kind === 'anchor' || orders.kind === 'defend' ? STATE.HOLD : STATE.PUSH;
    this.routeIndex = null;
    this.staged = false;
    this.endHold = null;
    if (orders.push) {
      // An early push: hold an aggressive spot for a while, then fall back.
      this.holdSpot = { node: orders.push.node, look: orders.push.look, push: true };
      this.holdUntil = 0;
    }
  }

  /** A teammate just died: trade by rushing the killer if close enough. */
  notifyTeammateDown(killer, where) {
    const tw = this.skill.teamwork ?? 1;
    if (!tw || !killer?.alive || this.target || !this.c?.alive) return;
    const range = this.orders?.kind === 'defend' ? 8 : tw >= 2 ? 25 : 12;
    if (dist2d(this.c.pos, where) > range) return;
    this.searchPoint = { x: killer.pos.x, z: killer.pos.z, time: this.time };
    this.state = STATE.SEARCH;
    this.path = null;
    this.goalNode = null;
  }

  /** Called when this bot takes damage. */
  notifyDamaged(attacker) {
    if (!attacker || this.target) return;
    this.alertYaw = yawTo(this.c.pos, attacker.pos);
    this.alertTimer = 1.5;
  }

  get time() {
    return this.ctx.time;
  }

  getIntent(c, dt) {
    const intent = blankIntent();
    if (c.asleep || this.mode === 'idle' || c.frozen) return intent;
    if (this.mode === 'wander') {
      this._wander(c, dt, intent);
      return intent;
    }

    this.perceiveTimer -= dt;
    if (this.perceiveTimer <= 0) {
      this.perceiveTimer = this.skill.perceiveEvery;
      this._perceive(c);
      this._listen(c);
    }
    if (this.alertTimer > 0) this.alertTimer -= dt;

    const late = this.ctx.ai?.timeLeft ?? 99;
    // The spike objective comes first whenever no enemy is in view.
    if (this._objective(c, dt, intent, late)) {
      botAbilities(this, c, dt, intent);
      return intent;
    }
    if (this.target && this.state !== STATE.RETREAT) this.state = STATE.FIGHT;
    if ([STATE.PLANT, STATE.DEFUSE, STATE.FETCH, STATE.GUARD, STATE.RETAKE].includes(this.state)) this.state = this._planState();

    switch (this.state) {
      case STATE.FIGHT: this._fight(c, dt, intent); break;
      case STATE.RETREAT: this._retreat(c, dt, intent); break;
      case STATE.HOLD: this._hold(c, dt, intent, late); break;
      case STATE.PUSH: this._push(c, dt, intent, late); break;
      case STATE.ROTATE: this._rotate(c, dt, intent); break;
      case STATE.SEARCH: this._search(c, dt, intent); break;
    }
    botAbilities(this, c, dt, intent);

    const pick = chooseWeapon(c.loadout, !!this.target);
    if (pick !== null) intent.switchTo = pick;

    // Snipers scope in as soon as they have someone to shoot at.
    intent.adsHeld = !!this.target && this.state === STATE.FIGHT && c.loadout?.current.def.ads?.scope === 'sniper';

    // Top up the magazine whenever not shooting at someone.
    const w = c.loadout?.current;
    if (!this.target && w && w.ammo < w.def.magSize * 0.4 && w.reserve > 0) intent.reload = true;
    return intent;
  }

  // ------------------------------------------------------------------ senses

  _perceive(c) {
    const s = this.skill;
    const world = this.ctx.world;
    const eye = { x: c.pos.x, y: c.pos.y + c.eyeHeight, z: c.pos.z };
    const intel = this.ctx.ai?.senses.intel[c.team];
    const shares = (s.teamwork ?? 1) >= 1;
    let best = null;
    let bestD = Infinity;
    for (const e of this.ctx.characters) {
      if (!e.isCharacter || !e.alive || e.team === c.team) continue;
      // Revealed enemies (recon, traps) are known to the whole team, even through walls.
      if (e.revealed && intel) intel.spotted(e, this.time, this.nav.nearest(e.pos.x, e.pos.z)?.lane);
      if (c.blinded) continue; // flashed: can't see anyone
      const d = dist2d(e.pos, eye);
      if (d > s.viewDistance || d >= bestD) continue;
      const off = Math.abs(wrap(yawTo(eye, e.pos) - c.yaw));
      if (off > (s.fov * DEG) / 2 && d > s.nearSense) continue;
      const k = e.bodyScale ?? 1; // crouching behind cover hides you better
      const head = { x: e.pos.x, y: e.pos.y + 1.58 * k, z: e.pos.z };
      const chest = { x: e.pos.x, y: e.pos.y + 1.1 * k, z: e.pos.z };
      if (!world.lineOfSight(eye, head) && !world.lineOfSight(eye, chest)) continue;
      best = e;
      bestD = d;
    }

    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.reaction = rand(...s.reaction);
        const err = s.aimError * DEG;
        this.aimErr = { yaw: rand(-err, err), pitch: rand(-err, err) * 0.6 };
        this.aimHead = Math.random() < s.headChance;
        this.burstTimer = 0;
        this.burstPause = 0;
      }
      this.targetVisible = true;
      this.lostTimer = 0;
      this.lastSeen = { x: best.pos.x, z: best.pos.z, time: this.time };
      if (shares && intel) {
        const lane = this.nav.nearest(best.pos.x, best.pos.z)?.lane;
        const known = intel.sightings.get(best);
        if (!known || this.time - known.time > 5) this.ctx.events.emit('callout', { from: c, enemy: best, lane });
        intel.spotted(best, this.time, lane);
      }
    } else {
      if (this.targetVisible && this.target) this.peeking = Math.random() < (s.peek ?? 0); // just lost sight
      this.targetVisible = false;
      if (this.target) {
        this.lostTimer += s.perceiveEvery;
        if (this.lostTimer > 1.5 || !this.target.alive) this._loseTarget();
      }
    }

    // Spots the team keeps dying to: pre-aim the closest one in view.
    const hot = (s.adapt ?? 0) > 0 ? this.ctx.ai?.hot?.[c.team] : null;
    let danger = null;
    if (hot?.length) {
      let bestHot = 30;
      for (const h of hot) {
        const d = dist2d(h, c.pos);
        if (d < bestHot && d > 3 && world.lineOfSight(eye, h, false)) {
          bestHot = d;
          danger = h;
        }
      }
    }
    if (danger !== this.danger) {
      this.danger = danger;
      this.dangerSince = danger ? this.time : null;
    }
    const enemyHalf = c.team === 'ally' ? 'e' : 'a';
    this.pastMiddle = !!this.nav.nearest(c.pos.x, c.pos.z)?.id.endsWith(enemyHalf);
  }

  _loseTarget() {
    const wasAlive = this.target?.alive;
    this.target = null;
    this.path = null;
    this.goalNode = null;
    if (this.state === STATE.FIGHT) {
      // Defenders keep holding the angle where the enemy was last seen.
      if (this.orders?.kind === 'defend' && this.lastSeen) {
        this.holdSpot = { node: this.nav.nearest(this.c.pos.x, this.c.pos.z), look: this.lastSeen };
        this.holdUntil = this.time + 3;
        this.state = STATE.HOLD;
        return;
      }
      // Chase where it was last seen if it got away; otherwise back to the plan.
      if (wasAlive && this.lastSeen) {
        this.searchPoint = this.lastSeen;
        this.state = STATE.SEARCH;
      } else {
        this.state = this._planState();
      }
    }
  }

  _listen(c) {
    const senses = this.ctx.ai?.senses;
    if (!senses) return;
    const n = senses.hear(c, this.lastHeardTime);
    if (!n) return;
    this.lastHeardTime = n.time;
    this.heardEnemyAt = this.time;
    this.heardDistance = n.distance;
    if (!this.target) {
      this.alertYaw = yawTo(c.pos, n);
      this.alertTimer = 1.6;
      this.peekHeard = n.distance < 15 && Math.random() < (this.skill.peek ?? 0) * 0.6;
    }
  }

  /**
   * Move quietly (Shift)? When enemies were heard close by, or when the plan
   * says sneak and the bot is past the middle of the map (until the hit).
   */
  _quiet() {
    const o = this.orders;
    if (o?.rush) return false;
    if (this._shouldWalk()) return true;
    if (!o?.sneak) return false;
    if (o.plan?.go && !o.lurk) return false; // the hit is on: speed over stealth
    return this.pastMiddle;
  }

  /** Jiggle-peek: tap left and right around a corner to look without committing. */
  _jiggle(c, dt, intent, yaw) {
    this.jiggleTimer -= dt;
    if (this.jiggleTimer <= 0) {
      this.jiggleTimer = rand(0.18, 0.3);
      this.jiggleDir = -this.jiggleDir;
    }
    this._strafe(c, intent, this.jiggleDir, yaw);
    intent.walk = false;
  }

  /** Take an ultimate orb if one is close, on this level, and nobody is in sight. */
  _grabOrb(c, dt, intent) {
    const x = c.abilities?.slots.x;
    if (this.target || !x || (c.ultPoints ?? 0) >= x.ult) return false;
    const orb = this.ctx.ai?.orbs?.active.find((o) => dist2d(o, c.pos) < 9 && Math.abs(o.y - c.pos.y) < 0.5);
    if (!orb) return false;
    this._goToPoint(c, dt, intent, orb);
    return true;
  }

  /** Should the waiting attackers go in now? */
  _planGo(plan, timeLeft) {
    if (timeLeft < 40) return true;
    if (plan.firstReady !== null && this.time - plan.firstReady > plan.stageTimeout) return true;
    const bot = (m) => m.alive && m.controller === m.brain;
    // A fake: wait until the fakers are done (or dead), then a moment for defenders to rotate.
    if (!plan.fakeDone && plan.members.some((m) => bot(m) && m.brain.orders?.fake)) return false;
    if (plan.fakeDoneAt !== null && this.time - plan.fakeDoneAt < 2) return false;
    if (plan.goBy !== null && timeLeft > plan.goBy) return false; // slow: hit late
    const waiting = plan.members.filter((m) => bot(m) && !m.brain.orders?.lurk && !m.brain.orders?.fake);
    const ready = waiting.filter((m) => plan.ready.has(m)).length;
    const need = plan.name === 'default' ? Math.min(waiting.length, 3) : waiting.length;
    return ready >= need;
  }

  /** Recently heard an enemy close by: move quietly. */
  _shouldWalk() {
    return this.time - this.heardEnemyAt < 3 && this.heardDistance < 25;
  }

  _planState() {
    if (this.orders?.kind === 'anchor' || this.orders?.kind === 'defend') return STATE.HOLD;
    if (this.orders?.route && this.routeIndex !== null && this.routeIndex >= this.orders.route.length) return STATE.SEARCH;
    return STATE.PUSH;
  }

  // ------------------------------------------------------------------ states

  _fight(c, dt, intent) {
    const s = this.skill;
    const t = this.target;
    if (!t || !t.alive) {
      this._loseTarget();
      return;
    }

    // Low health and a teammate still alive: back off instead of trading badly.
    if (!this.retreated && s.retreatHealth > 0 && c.health < s.retreatHealth && this.targetVisible && this._teammatesAlive(c) > 0) {
      const node = this._retreatNode(c, t);
      if (node) {
        this.retreated = true;
        this.retreatNode = node;
        this.retreatUntil = this.time + 3.5;
        this.state = STATE.RETREAT;
        this.path = null;
        this.goalNode = null;
        return;
      }
    }

    const ey = c.pos.y + c.eyeHeight;
    const aimY = t.pos.y + (this.aimHead ? 1.58 : 1.15) * (t.bodyScale ?? 1); // lower if they crouch
    const flat = dist2d(t.pos, c.pos);
    const trueYaw = yawTo(c.pos, t.pos);
    const truePitch = Math.atan2(aimY - ey, flat);

    // Aim error shrinks while the bot keeps aiming at the same target.
    const k = Math.exp(-dt / s.aimSettle);
    this.aimErr.yaw *= k;
    this.aimErr.pitch *= k;
    this._turn(c, dt, trueYaw + this.aimErr.yaw - c.recoilYaw * s.recoilControl,
      truePitch + this.aimErr.pitch - c.recoilPitch * s.recoilControl, 1);

    if (!this.targetVisible) {
      // Hold the angle where it was last seen, jiggling the corner if peeking.
      if (this.peeking && this.lostTimer > 0.15) this._jiggle(c, dt, intent, trueYaw);
      return;
    }
    if (this.reaction > 0) {
      this.reaction -= dt;
      return;
    }
    const onTarget = Math.abs(wrap(c.viewYaw - trueYaw)) < 4 * DEG && Math.abs(c.viewPitch - truePitch) < 4 * DEG;

    // Between bursts: sometimes strafe, then stop before shooting again.
    if (this.burstPause > 0) {
      this.burstPause -= dt;
      if (this.strafeDir) this._strafe(c, intent, this.strafeDir, trueYaw);
      return;
    }
    if (!onTarget) return;
    if (Math.hypot(c.vel.x, c.vel.z) > 1.5) return; // let friction stop us (counter-strafe)

    // A sniper only fires fully scoped, standing still, with the shot lined up on the body.
    const def = c.loadout?.current.def;
    if (def?.ads?.scope === 'sniper') {
      if (!c.loadout.scoped || Math.hypot(c.vel.x, c.vel.z) > 0.8) return;
      const tight = Math.atan2(0.22, Math.max(1, flat));
      if (Math.abs(wrap(c.aimYaw - trueYaw)) > tight || Math.abs(c.aimPitch - truePitch) > tight) return;
      intent.fireHeld = true;
      intent.firePressed = true;
      return;
    }

    if (this.burstTimer <= 0) {
      const interval = c.loadout ? c.loadout.current.interval : 0.1;
      this.burstTimer = Math.round(rand(...s.burst)) * interval;
    }
    intent.fireHeld = true;
    // Semi-automatic weapons (the pistol) need a fresh press for every shot.
    intent.firePressed = c.loadout?.current.def.mode === 'semi';
    this.burstTimer -= dt;
    if (this.burstTimer <= 0) {
      this.burstPause = rand(...s.burstPause);
      this.strafeDir = Math.random() < s.strafeChance ? (Math.random() < 0.5 ? 1 : -1) : 0;
    }
  }

  _retreat(c, dt, intent) {
    const threat = this.lastSeen ?? this.target?.pos;
    const arrived = this._goTo(c, dt, intent, this.retreatNode, { lookAt: threat });
    intent.reload = true;
    if (arrived || this.time > this.retreatUntil) {
      this.target = null;
      this.holdSpot = { node: this.retreatNode, look: threat ?? null };
      this.holdUntil = this.time + 3;
      this.state = STATE.HOLD;
    }
  }

  _hold(c, dt, intent, timeLeft) {
    const spot = this.holdSpot ?? (this.orders?.holdNode
      ? { node: this.orders.holdNode, look: this.orders.holdLook ?? this.orders.holdNode.hold }
      : null);
    if (!spot) {
      this.state = STATE.PUSH;
      return;
    }
    // Site defenders take their own lane to their spot instead of all crossing mid.
    const avoidLane = this.orders?.kind === 'defend' && this.orders.site !== 'M' && !this.holdSpot ? 'M' : null;
    const arrived = this._goTo(c, dt, intent, spot.node, { walk: this._quiet(), avoidLane });
    this.holdArrived = arrived ? this.time : null; // when it got to the spot (traps go down then)
    this.holdLook = spot.look ?? null;
    if (arrived) {
      if (spot.push && !this.holdUntil) this.holdUntil = this.time + (this.orders?.push?.holdFor ?? 10);
      // Watch the angle (or a spot the team keeps dying to), with a slow
      // sweep; turn toward noises, jiggling toward close footsteps.
      const look = (!spot.push && this.danger) || spot.look || { x: c.pos.x, z: c.pos.z - 10 };
      let yaw = yawTo(c.pos, look) + Math.sin(this.time * 0.7 + this.seed) * 0.15;
      if (this.alertTimer > 0 && this.alertYaw !== null) {
        yaw = this.alertYaw;
        if (this.peekHeard) this._jiggle(c, dt, intent, yaw);
      }
      this._turn(c, dt, yaw, 0, 0.6);
    }

    // Leave the hold?
    if (this.holdUntil && this.time >= this.holdUntil) {
      this.holdSpot = null;
      this.holdUntil = 0;
      this.state = this._planState();
      return;
    }
    if (this.orders?.kind === 'anchor' && !this.holdSpot) {
      if (timeLeft < (this.orders.pushAt ?? 45)) {
        this.state = STATE.PUSH; // late in the round (or when the plan says), anchors push too
        return;
      }
      this._maybeRotate(c);
    }
    // Defenders never push; they rotate toward contact and wait for the attackers.
    if (this.orders?.kind === 'defend' && !this.holdSpot) this._maybeRotate(c);
  }

  _maybeRotate(c) {
    if ((this.skill.teamwork ?? 1) < 1) return;
    const contact = this.ctx.ai?.senses.intel[c.team].contact;
    if (!contact || this.time - contact.time > 3 || this.time - this.lastRotate < 12) return;
    const myLane = this.orders?.site && this.orders.site !== 'M' ? this.orders.site : this.orders?.holdNode?.lane;
    if (!contact.lane || contact.lane === myLane) return;
    // Defenders only rotate when at least two attackers have been seen there.
    if (this.orders?.kind === 'defend') {
      const intel = this.ctx.ai.senses.intel[c.team];
      let seen = 0;
      for (const [enemy, sighting] of intel.sightings) {
        if (!enemy.alive || this.time - sighting.time > 4) continue;
        if (this.nav.nearest(sighting.x, sighting.z)?.lane === contact.lane) seen++;
      }
      if (seen < 2) return;
    }
    const ownHalf = c.team === 'ally' ? 'a' : 'e';
    const options = this.nav.nodes.filter((n) => n.lane === contact.lane && n.id.endsWith(ownHalf) && !n.id.startsWith('spawn'));
    if (!options.length) return;
    options.sort((a, b) => dist2d(a, contact) - dist2d(b, contact));
    this.rotateNode = options[0];
    this.rotateLook = { x: contact.x, z: contact.z };
    this.lastRotate = this.time;
    this.state = STATE.ROTATE;
  }

  _rotate(c, dt, intent) {
    if (this._goTo(c, dt, intent, this.rotateNode)) {
      this.holdSpot = { node: this.rotateNode, look: this.rotateLook };
      this.holdUntil = this.time + 5;
      this.state = STATE.HOLD;
    }
  }

  _push(c, dt, intent, timeLeft) {
    const route = this.orders?.route;
    if (!route || timeLeft < 25) {
      this.state = STATE.SEARCH; // no plan, or the clock is running out: hunt
      return;
    }
    if (this.routeIndex === null) this.routeIndex = this._nearestRouteIndex(c, route);
    if (this.routeIndex >= route.length) {
      this.state = STATE.SEARCH;
      return;
    }

    // Supports stay a node behind their entry while it is alive. If they are
    // far behind, or the entry is in a fight, they move up to its node to
    // catch up and trade instead of waiting back where they are.
    const leader = (this.skill.teamwork ?? 1) >= 1 ? this.orders.leader : null;
    const lc = leader?.controller;
    // Only trail an entry that is actually on the route (not off searching or retreating).
    const onRoute = lc?.state === STATE.PUSH || lc?.state === STATE.FIGHT;
    if (leader?.alive && onRoute && lc.routeIndex !== null && lc.routeIndex !== undefined) {
      const close = dist2d(c.pos, leader.pos) < 9;
      const limit = lc.state === STATE.FIGHT || !close ? lc.routeIndex : lc.routeIndex - 1;
      if (this.routeIndex > limit) {
        const ahead = route[Math.min(route.length - 1, Math.max(0, limit + 1))];
        this._turn(c, dt, yawTo(c.pos, ahead), 0, 0.6);
        return;
      }
    }

    if (this._grabOrb(c, dt, intent)) return;
    const o = this.orders;
    const plan = o.plan;
    const node = route[this.routeIndex];
    const next = route[this.routeIndex + 1] ?? node;

    // Lurkers and fakers wait at the end of their route before moving on.
    if (this.endHold) {
      const h = this.endHold;
      const spike = this.ctx.ai?.objective?.spike;
      const done = h.kind === 'fake'
        ? this.time >= h.until
        : (plan?.go && this.time >= (plan.goAt ?? 0) + 5) || timeLeft < 35 || !!spike?.planted;
      if (!done) {
        if (this.pauseTimer > 0) this.pauseTimer -= dt; // "entering": the fake's utility fires now
        const look = h.kind === 'fake' ? next : o.lurkLook ?? next;
        const yaw = this.alertTimer > 0 && this.alertYaw !== null ? this.alertYaw : yawTo(c.pos, look);
        if (h.kind === 'fake' || this.peekHeard) this._jiggle(c, dt, intent, yaw); // fakers show themselves
        this._turn(c, dt, yaw, 0, 0.7);
        return;
      }
      if (h.kind === 'fake' && plan) {
        plan.fakeDone = true;
        plan.fakeDoneAt ??= this.time;
      }
      this.endHold = null;
      this.routeIndex = route.length; // route done: the objective takes over (the real site)
      return;
    }

    // Attackers group up at a staging point out of sight of the site, then go
    // in together when the plan says (see _planGo), using abilities on the way in.
    const stage = (o.stageIndex ?? Math.max(0, route.length - 2)) + 1; // waiting once arrived there
    if (o.kind === 'attack' && plan?.wait && !o.lurk && !o.fake && !this.staged && this.routeIndex === stage) {
      plan.ready.add(c);
      plan.firstReady ??= this.time;
      if (!plan.go && this._planGo(plan, timeLeft)) {
        plan.go = true;
        plan.goAt = this.time;
      }
      if (!plan.go) {
        // Wait here, watching the way in (and turning to noises).
        const yaw = this.alertTimer > 0 && this.alertYaw !== null ? this.alertYaw : yawTo(c.pos, node);
        if (this.alertTimer > 0 && this.peekHeard) this._jiggle(c, dt, intent, yaw);
        this._turn(c, dt, yaw, 0, 0.6);
        return;
      }
      this.staged = true;
      this.pauseTimer = 0.6; // "entering": smokes, reveals, and dashes fire now
      this.waited = 0;
    }

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt; // check the angle ahead before moving on
      // Good teamwork: an entry waits (up to a few seconds) for a teammate to catch up.
      if (this.pauseTimer <= 0 && this.role === 'entry' && (this.skill.teamwork ?? 1) >= 2 && this.waited < 2.5 && !this._teammateNear(c, 8)) {
        this.pauseTimer = 0.25;
        this.waited += 0.25;
      }
      const yaw = this.alertTimer > 0 && this.alertYaw !== null ? this.alertYaw : yawTo(c.pos, next);
      if (this.peekPause) this._jiggle(c, dt, intent, yaw); // jiggle the corner ahead
      this._turn(c, dt, yaw, 0, 0.7);
      return;
    }
    // Executing onto a site: aim at the spots defenders usually hold.
    let lookAt = null;
    if (this.orders.kind === 'attack' && this.staged && this.orders.checkSpots?.length) {
      if (!this.checkTimer || this.time > this.checkTimer) {
        this.checkTimer = this.time + 0.5;
        const eye = { x: c.pos.x, y: c.pos.y + c.eyeHeight, z: c.pos.z };
        this.checking = this.orders.checkSpots
          .filter((n) => this.ctx.world.lineOfSight(eye, { x: n.x, y: n.y + 1.4, z: n.z }))
          .sort((a, b) => dist2d(a, c.pos) - dist2d(b, c.pos))[0] ?? null;
      }
      lookAt = this.checking;
    }
    if (this._goTo(c, dt, intent, node, { walk: this._quiet(), lookAt })) {
      if ((o.lurk || o.fake) && this.routeIndex === route.length - 1) {
        // End of a lurk or fake route: wait here (see endHold above).
        this.endHold = o.fake ? { kind: 'fake', until: this.time + rand(2, 3.5) } : { kind: 'lurk' };
        if (o.fake) {
          this.pauseTimer = 0.6;
          this.waited = 0;
        }
        return;
      }
      if (!o.rush && node.tags?.includes('choke') && Math.random() < 0.7) {
        this.pauseTimer = rand(0.5, 1.1);
        this.waited = 0;
        this.peekPause = Math.random() < (this.skill.peek ?? 0) * 0.7;
      }
      this.routeIndex++;
    }
  }

  _search(c, dt, intent) {
    const intel = this.ctx.ai?.senses.intel[c.team].latest(this.time);
    const point = intel ?? this.searchPoint;
    if (point) {
      const node = this.nav.nearest(point.x, point.z);
      if (this._goTo(c, dt, intent, node, { walk: this._quiet() })) this.searchPoint = null;
      return;
    }
    // Nothing known: sweep the other team's half.
    if (!this.searchNode || this.arrivedAt === this.searchNode) {
      const enemyHalf = c.team === 'ally' ? 'e' : 'a';
      const options = this.nav.nodes.filter((n) => n.id.endsWith(enemyHalf));
      this.searchNode = options[Math.floor(Math.random() * options.length)];
      this.arrivedAt = null;
    }
    this._goTo(c, dt, intent, this.searchNode, { walk: this._shouldWalk() });
  }

  _wander(c, dt, intent) {
    if (!this.wanderNode || this.arrivedAt === this.wanderNode) {
      this.wanderNode = this.nav.random();
      this.arrivedAt = null;
    }
    this._goTo(c, dt, intent, this.wanderNode);
  }

  // ------------------------------------------------------- plant and defuse

  /** Handles the spike objective. Returns true if it decided this tick. */
  _objective(c, dt, intent, timeLeft) {
    const obj = this.ctx.ai?.objective;
    if (!obj || obj.mode !== 'spike' || !obj.spike.live) return false;
    if (this.target && this.targetVisible) return false; // fight first
    const spike = obj.spike;
    const attacking = c.team === spike.attackers;

    if (spike.planted) {
      const p = spike.planted;
      if (attacking) {
        // Guard the spike from a spot that can see it. Watch where defenders
        // will come from; snap to the spike when someone starts defusing.
        if (this.guardFor !== p) {
          this.guardNode = this._guardNode(p, c);
          this.guardFor = p;
        }
        const watch = spike.defuser ? p : this._defenderApproach() ?? p;
        if (this._goTo(c, dt, intent, this.guardNode, { walk: this._shouldWalk(), lookAt: watch })) {
          // Turn toward footsteps; otherwise watch the approach (or the defuser).
          const listen = !spike.defuser && this.alertTimer > 0 && this.alertYaw !== null;
          const yaw = listen ? this.alertYaw : yawTo(c.pos, watch);
          this._turn(c, dt, yaw, spike.defuser ? -0.08 : 0, spike.defuser || listen ? 1 : 0.6);
        }
        this.state = STATE.GUARD;
        return true;
      }
      // Defenders: retake, then defuse once next to it.
      if (spike.canDefuseFrom(c) && dist2d(c.pos, p) <= SPIKE.defuseRadius - 0.4) {
        intent.interact = true;
        this._turn(c, dt, yawTo(c.pos, p), -0.5, 0.6);
        this.state = STATE.DEFUSE;
        return true;
      }
      this._goToPoint(c, dt, intent, p);
      this.state = STATE.RETAKE;
      return true;
    }

    if (!attacking) return false; // defenders hold their sites as usual

    // A dropped spike: the closest attacker bot goes to pick it up.
    if (spike.dropped && this._isFetcher(c, spike)) {
      this._goToPoint(c, dt, intent, spike.dropped);
      this.state = STATE.FETCH;
      return true;
    }

    const site = this.orders?.siteNode;
    const routeDone = this.orders?.route && this.routeIndex !== null && this.routeIndex >= this.orders.route.length;
    if (spike.carrier === c) {
      // On a site with nobody in view: plant.
      if (spike.siteAt(c.pos) && !this.target) {
        intent.interact = true;
        this.state = STATE.PLANT;
        return true;
      }
      // Late, or done walking the route: go straight to the site.
      if (site && (timeLeft < 35 || routeDone)) {
        const center = obj.sites[this.orders.target];
        this._goToPoint(c, dt, intent, { x: center.x + 0.6, z: center.z + 0.6 });
        this.state = STATE.PUSH;
        return true;
      }
      return false;
    }

    // Everyone else: once at the site (or when time is short), hold around it.
    if (site && (routeDone || timeLeft < 30)) {
      const center = obj.sites[this.orders.target];
      if (this.guardFor !== center) {
        this.guardNode = this._guardNode(center, c);
        this.guardFor = center;
      }
      const look = this._defenderApproach(c) ?? center;
      if (this._goTo(c, dt, intent, this.guardNode, { walk: this._shouldWalk() })) {
        const listen = this.alertTimer > 0 && this.alertYaw !== null;
        this._turn(c, dt, listen ? this.alertYaw : yawTo(c.pos, look), 0, listen ? 1 : 0.6);
      }
      this.state = STATE.GUARD;
      return true;
    }
    return false;
  }

  _isFetcher(c, spike) {
    let best = null;
    let bestD = Infinity;
    for (const o of this.ctx.characters) {
      // Only bots that are actually playing (not you, not switched off).
      if (!o.isCharacter || !o.alive || o.team !== spike.attackers || !o.controller?.nav || o.controller.mode === 'idle') continue;
      const d = dist2d(o.pos, spike.dropped);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best === c;
  }

  /** A waypoint near `p` (4 to 12 m) that can see it, not already taken by a teammate. */
  _guardNode(p, c) {
    const world = this.ctx.world;
    const target = { x: p.x, y: (p.y ?? 0) + 0.6, z: p.z };
    const taken = new Set(this.ctx.characters
      .filter((o) => o !== c && o.isCharacter && o.alive && o.team === c.team && o.controller?.guardFor === p)
      .map((o) => o.controller.guardNode));
    const options = this.nav.nodes
      .filter((n) => !n.id.startsWith('spawn') && !taken.has(n))
      .map((n) => ({ n, d: dist2d(n, p) }))
      .filter(({ n, d }) => d >= 4 && d <= 12 && world.lineOfSight({ x: n.x, y: n.y + 1.4, z: n.z }, target, false))
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    if (!options.length) return this.nav.nearest(p.x, p.z);
    return options[Math.floor(Math.random() * options.length)].n;
  }

  /** Roughly where defenders would come from: the next node past the site on the route. */
  _defenderApproach() {
    const full = this.orders?.fullRoute ?? null;
    if (!full) return null;
    return full[full.indexOf(this.orders.siteNode) + 1] ?? null;
  }

  /**
   * Walk to an exact point (a dropped spike, a planted spike): by waypoints to
   * the nearest one with a clear straight line to it, then straight at it.
   * If that makes no progress for a few seconds, try the next-best waypoint.
   */
  _goToPoint(c, dt, intent, p) {
    const d = dist2d(c.pos, p);
    if (d < 0.5) return true;
    const world = this.ctx.world;
    const r = c.radius + 0.05;
    if (this._pointFor !== p) {
      this._pointFor = p;
      this._pointTried = new Set();
      this._pointNode = null;
    }
    // No progress for a while: give up on this waypoint and try another.
    if (!this._pointProgress || d < this._pointProgress.d - 0.5) this._pointProgress = { d, time: this.time };
    else if (this.time - this._pointProgress.time > 5) {
      if (this._pointNode) this._pointTried.add(this._pointNode);
      this._pointNode = null;
      this._pointProgress = { d, time: this.time };
    }
    this._pointNode ??= this.nav.nearest(p.x, p.z, (n) => !this._pointTried.has(n) && Math.abs(n.y - (p.y ?? 0)) < 0.5 &&
      world.walkable(n, p, p.y ?? 0, r, c.height), p.y ?? 0);
    const direct = d < 8 && world.walkable(c.pos, p, c.pos.y, r, c.height);
    if (direct || (this.arrivedAt === this._pointNode && d < 8)) {
      // From here (or from the chosen waypoint) the way is clear: walk straight
      // at it, sliding along any corner in between.
      this._turn(c, dt, yawTo(c.pos, p), 0, 0.8);
      const mx = (p.x - c.pos.x) / d;
      const mz = (p.z - c.pos.z) / d;
      const sin = Math.sin(c.yaw);
      const cos = Math.cos(c.yaw);
      intent.forward = mx * -sin + mz * -cos;
      intent.right = mx * cos + mz * -sin;
      intent.walk = d < 2; // ease in
      return false;
    }
    this._goTo(c, dt, intent, this._pointNode, { walk: this._shouldWalk() });
    return false;
  }

  // --------------------------------------------------------------- movement

  /**
   * Walk toward a waypoint along the nav graph. Returns true once there.
   * opts.lookAt: keep facing this point while moving; opts.walk: move quietly.
   */
  _goTo(c, dt, intent, node, { lookAt = null, walk = false, avoidLane = null } = {}) {
    if (!node) return true;
    if (this.arrivedAt === node && dist2d(c.pos, node) < 1.3) return true;
    if (this.goalNode !== node || !this.path) {
      const world = this.ctx.world;
      const from = { x: c.pos.x, y: c.pos.y + 1, z: c.pos.z };
      const start = this.nav.nearest(c.pos.x, c.pos.z, (n) => world.lineOfSight(from, { x: n.x, y: n.y + 1, z: n.z }, false), c.pos.y);
      this.path = this.nav.path(start, node, { avoidLane }) ?? [node];
      this.pathIndex = 0;
      this._smooth(c);
      this.goalNode = node;
      this.arrivedAt = null;
      this.stuckClock = 0;
      this.stuckFrom = c.pos.clone();
    }

    let wp = this.path[this.pathIndex];
    // Reached a waypoint: move on, skipping any we can walk straight past.
    if (this.pathIndex < this.path.length - 1 && dist2d(c.pos, wp) < 0.7) {
      this.pathIndex++;
      this._smooth(c);
      wp = this.path[this.pathIndex];
    }
    const d = dist2d(c.pos, wp);
    if (d < 0.7 && this.pathIndex === this.path.length - 1) {
      this.path = null;
      this.arrivedAt = node;
      return true;
    }

    const moveYaw = yawTo(c.pos, wp);
    let lookYaw = moveYaw;
    if (lookAt) lookYaw = yawTo(c.pos, lookAt);
    else if (this.alertTimer > 0 && this.alertYaw !== null) lookYaw = this.alertYaw;
    else if (this.danger && Math.abs(wrap(yawTo(c.pos, this.danger) - moveYaw)) < 1.9) {
      lookYaw = yawTo(c.pos, this.danger); // pre-aim a spot the team keeps dying to
    }
    this._turn(c, dt, lookYaw, 0, 0.6);

    // Move toward the waypoint, expressed relative to where the bot faces.
    let mx = (wp.x - c.pos.x) / d;
    let mz = (wp.z - c.pos.z) / d;
    if (this.sidestep > 0) {
      // Unsticking: slide sideways for a moment.
      this.sidestep -= dt;
      [mx, mz] = [-mz * this.sideSign, mx * this.sideSign];
    } else if (this._blockedAhead(c, mx, mz)) {
      // Someone right in front: keep to the right so both slide past.
      const rx = -mz;
      const rz = mx;
      mx = mx * 0.5 - rx * 0.85;
      mz = mz * 0.5 - rz * 0.85;
    }
    const sin = Math.sin(c.yaw);
    const cos = Math.cos(c.yaw);
    intent.forward = mx * -sin + mz * -cos;
    intent.right = mx * cos + mz * -sin;
    intent.walk = walk;

    // Stuck? Sidestep, then re-route from wherever it is now.
    this.stuckClock += dt;
    if (this.stuckClock > 1.2) {
      const moved = this.stuckFrom ? dist2d(c.pos, this.stuckFrom) : 99;
      const expected = (walk ? MOVE.walkSpeed : MOVE.runSpeed) * 1.2 * 0.25;
      this.stuckClock = 0;
      this.stuckFrom = c.pos.clone();
      if (moved < expected) {
        this.stuck++;
        this.sidestep = 0.35;
        this.sideSign = Math.random() < 0.5 ? 1 : -1;
        this.path = null;
      }
    }
    return false;
  }

  /** Drop leading waypoints that can be walked past in a straight line. */
  _smooth(c) {
    const world = this.ctx.world;
    while (this.pathIndex < this.path.length - 1) {
      const next = this.path[this.pathIndex + 1];
      if (Math.abs((next.y ?? 0) - c.pos.y) > 0.3) break; // stairs: walk them waypoint by waypoint
      if (!world.walkable(c.pos, next, c.pos.y, c.radius + 0.05, c.height)) break;
      this.pathIndex++;
    }
  }

  _blockedAhead(c, mx, mz) {
    for (const o of this.ctx.characters) {
      if (o === c || !o.isCharacter || !o.alive) continue;
      const dx = o.pos.x - c.pos.x;
      const dz = o.pos.z - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.3 || d < 1e-6) continue;
      if ((dx * mx + dz * mz) / d > 0.5) return true;
    }
    return false;
  }

  _turn(c, dt, yaw, pitch, rateScale) {
    const maxTurn = this.skill.turnRate * rateScale * DEG * dt;
    c.yaw += Math.max(-maxTurn, Math.min(maxTurn, wrap(yaw - c.yaw)));
    c.pitch += Math.max(-maxTurn, Math.min(maxTurn, pitch - c.pitch));
  }

  _strafe(c, intent, dir, facing) {
    // Strafe perpendicular to the target, relative to the bot's facing.
    const mx = Math.cos(facing) * dir;
    const mz = -Math.sin(facing) * dir;
    const sin = Math.sin(c.yaw);
    const cos = Math.cos(c.yaw);
    intent.forward = mx * -sin + mz * -cos;
    intent.right = mx * cos + mz * -sin;
  }

  // ---------------------------------------------------------------- helpers

  _teammatesNear(c, radius) {
    return this.ctx.characters.filter((o) => o.isCharacter && o !== c && o.alive && o.team === c.team && dist2d(o.pos, c.pos) < radius).length;
  }

  _attackersAlive(c) {
    return this.ctx.characters.filter((o) => o.isCharacter && o.alive && o.team === c.team).length;
  }

  _teammateNear(c, radius) {
    return this.ctx.characters.some((o) => o.isCharacter && o !== c && o.alive && o.team === c.team && dist2d(o.pos, c.pos) < radius);
  }

  _teammatesAlive(c) {
    return this.ctx.characters.filter((o) => o.isCharacter && o !== c && o.alive && o.team === c.team).length;
  }

  _nearestRouteIndex(c, route) {
    let best = 0;
    let bestD = Infinity;
    route.forEach((n, i) => {
      const d = dist2d(c.pos, n);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** A nearby waypoint the threat can't see, farther from it than we are. */
  _retreatNode(c, threat) {
    const world = this.ctx.world;
    const eye = { x: threat.pos.x, y: threat.pos.y + threat.eyeHeight, z: threat.pos.z };
    const myDist = dist2d(c.pos, threat.pos);
    let best = null;
    let bestD = Infinity;
    for (const n of this.nav.nodes) {
      const d = dist2d(c.pos, n);
      if (d > 16 || dist2d(n, threat.pos) <= myDist) continue;
      if (world.lineOfSight(eye, { x: n.x, y: n.y + 1.4, z: n.z })) continue;
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }
}

/**
 * Which weapon slot a bot should switch to, or null to keep the current one.
 * Bots prefer the first weapon (the rifle) whenever it has any ammo. If the
 * current weapon is completely empty, they switch to one that isn't. In the
 * middle of a fight they never swap away from a weapon that can still shoot.
 */
export function chooseWeapon(loadout, fighting) {
  if (!loadout || loadout.equipTimer > 0 || loadout.reloading) return null;
  const hasAmmo = (i) => !!loadout.weapons[i] && loadout.weapons[i].ammo + loadout.weapons[i].reserve > 0;
  const want = hasAmmo(0) ? 0 : loadout.weapons.findIndex((_, i) => hasAmmo(i));
  if (want < 0 || want === loadout.index) return null;
  if (fighting && hasAmmo(loadout.index)) return null;
  return want;
}
