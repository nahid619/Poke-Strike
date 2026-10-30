// Headless tests for the game rules: movement, weapons, abilities, status
// effects, the spike, and bot navigation. Run with: npm test
import { World } from '../src/core/physics.js';
import { Events } from '../src/core/events.js';
import { Character, MOVE, HITBOX, CROUCH } from '../src/game/character.js';
import * as THREE from 'three';
import { Loadout, traceShot } from '../src/game/weapons.js';
import { AbilityKit } from '../src/game/abilities.js';
import { Zones } from '../src/game/zones.js';
import { Spike, SPIKE } from '../src/game/spike.js';
import { NavGraph } from '../src/ai/nav.js';
import { chooseWeapon } from '../src/ai/bot.js';
import { isRealMouseMove } from '../src/core/input.js';
import { agentById, AGENTS } from '../src/data/agents.js';
import { MAPS } from '../src/data/maps/index.js';
import testmap from '../src/data/maps/testmap.js';
import { surfaceOf } from '../src/data/maps/mapkit.js';
import { Footsteps, FOOTSTEPS } from '../src/game/footsteps.js';
import { KillStreak, STREAK } from '../src/game/streak.js';
import { Senses } from '../src/ai/senses.js';
import { TeamMemory, pickPlan, pickSite, stackSite, planCallout, PLANS, TACTICS } from '../src/ai/tactics.js';
import { ECONOMY, SHIELDS, BUY_ORDER, roundIncome, addCredits, purchase, teamBuy, botShopping, startingLoadout, priceOf } from '../src/game/economy.js';
import { WEAPONS as ALL_WEAPONS, PRIMARIES as ALL_PRIMARIES, SECONDARIES } from '../src/data/weapons.js';
import { addUltPoints } from '../src/game/abilities.js';
import { rankOf, rrChange, recordMatch, matchHistory, currentRank, RANK } from '../src/game/history.js';
import { Orbs, orbSpots } from '../src/game/orbs.js';

const T = 1 / 60;
let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

function worldFrom(map) {
  const w = new World();
  for (const b of map.boxes) w.addBox(b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2, surfaceOf(map, b.color));
  return w;
}

/** A small scene: you (ally) and some enemies, with a scriptable intent. */
function scene({ map = null, agent = 'pikachu', enemies = [[0, -10]] } = {}) {
  const world = map ? worldFrom(map) : new World();
  if (!map) {
    world.addBox(-50, -1, -50, 50, 0, 50);   // floor
    world.addBox(-50, 0, -31, 50, 5, -30);   // wall at z = -30
  }
  const events = new Events();
  const log = [];
  for (const t of ['hit', 'kill', 'abilityCast', 'abilityDenied', 'markerPlaced', 'payload', 'trapTriggered']) events.on(t, (d) => log.push([t, d]));
  const ctx = { world, characters: [], events, time: 0 };
  ctx.zones = new Zones(world, events);
  const me = new Character({ team: 'ally' });
  me.loadout = new Loadout(['rifle', 'pistol']);
  me.abilities = new AbilityKit(agentById(agent));
  me.teleport(0, 0, 0, 0);
  let intent = {};
  me.setController({
    getIntent() {
      const i = {
        forward: 0, right: 0, walk: false, jump: false, fireHeld: false, firePressed: false,
        reload: false, switchTo: null, switchDelta: 0, abilityQ: false, abilityE: false, interact: false,
        crouch: false, adsPressed: false, adsHeld: false, adsHold: false, ...intent,
      };
      for (const k of ['jump', 'firePressed', 'reload', 'abilityQ', 'abilityE', 'adsPressed']) intent[k] = false;
      intent.switchTo = null;
      return i;
    },
  });
  ctx.characters.push(me);
  const foes = enemies.map(([x, z]) => {
    const e = new Character({ team: 'enemy' });
    e.teleport(x, 0, z, Math.PI);
    ctx.characters.push(e);
    return e;
  });
  const run = (seconds) => {
    for (let i = 0; i < Math.round(seconds / T); i++) {
      for (const c of ctx.characters) c.tick(T, ctx);
      ctx.zones.tick(T, ctx);
      ctx.time += T;
    }
  };
  run(0.2);
  return { me, foe: foes[0], foes, ctx, world, log, run, set: (o) => Object.assign(intent, o) };
}
const aimAt = (me, target, y) => {
  const dx = target.pos.x - me.pos.x;
  const dz = target.pos.z - me.pos.z;
  me.yaw = Math.atan2(-dx, -dz);
  me.pitch = Math.atan2(y - 1.6, Math.hypot(dx, dz));
  me.recoilPitch = me.recoilYaw = 0;
};

// ---------------------------------------------------------------- movement
{
  const s = scene({ map: testmap, enemies: [] });
  s.me.teleport(0, 0, 15, 0);
  s.set({ forward: 1 });
  let top = 0;
  for (let i = 0; i < 180; i++) { s.run(T); top = Math.max(top, Math.hypot(s.me.vel.x, s.me.vel.z)); }
  check('blocked by a low wall', Math.abs(s.me.pos.z - 6.65) < 0.01, s.me.pos.z.toFixed(2));
  check('run speed is 6.75 m/s', Math.abs(top - MOVE.runSpeed) < 0.05, top.toFixed(2));
  s.me.teleport(6, 0, 10, -Math.PI / 2);
  s.run(1);
  check('walks up stairs', s.me.pos.y === 1.5, s.me.pos.y.toFixed(2));
  s.set({ forward: 0 });
  s.me.teleport(0, 0, -4, 0);
  s.set({ jump: true });
  let peak = 0;
  for (let i = 0; i < 60; i++) { s.run(T); peak = Math.max(peak, s.me.pos.y); }
  check('head bumps the doorway lintel', peak <= 0.8 + 1e-6, peak.toFixed(2));
  // random play never ends up inside geometry
  let inside = 0;
  s.me.teleport(0, 0, 15, 0);
  for (let k = 0; k < 20000; k++) {
    if (k % 20 === 0) {
      s.set({ forward: [-1, 0, 1][(Math.random() * 3) | 0], right: [-1, 0, 1][(Math.random() * 3) | 0], jump: Math.random() < 0.15 });
      s.me.yaw += (Math.random() - 0.5) * 1.5;
    }
    s.run(T);
    if (s.world.overlapsCylinder(s.me.pos.x, s.me.pos.y, s.me.pos.z, s.me.radius - 0.002, s.me.height)) inside++;
  }
  check('random movement never clips into walls', inside === 0, `${inside} bad ticks`);
}

// ---------------------------------------------------------------- weapons
{
  const s = scene();
  s.me.pitch = 0.1;
  let shots = 0;
  s.ctx.events.on('shot', () => shots++);
  s.set({ fireHeld: true });
  s.run(1);
  s.set({ fireHeld: false });
  check('rifle fires about 585 rounds a minute', shots === 10, `${shots} in 1 s`);

  const h = scene();
  aimAt(h.me, h.foe, 1.58);
  h.set({ firePressed: true });
  h.run(0.1);
  check('rifle headshot kills through full shield', !h.foe.alive);

  const b = scene();
  aimAt(b.me, b.foe, 1.1);
  for (let i = 0; i < 3; i++) { b.set({ firePressed: true }); b.run(0.4); }
  check('three rifle body shots leave 30 health', b.foe.alive && b.foe.health === 30, `${b.foe.health}`);

  const p = scene({ enemies: [[0, -28]] });
  p.set({ switchTo: 1 });
  p.run(0.5);
  aimAt(p.me, p.foe, 1.58);
  p.set({ firePressed: true });
  p.run(0.1);
  const hit = p.log.find((l) => l[0] === 'hit');
  check('pistol headshot falls off past 25 m', hit && hit[1].damage === 120, hit ? `${hit[1].damage}` : 'missed');

  const f = scene();
  const mate = new Character({ team: 'ally' });
  mate.teleport(0, 0, -5, 0);
  f.ctx.characters.push(mate);
  aimAt(f.me, f.foe, 1.1);
  f.set({ firePressed: true });
  f.run(0.1);
  check('bullets pass through teammates', mate.health === 100 && f.foe.health + f.foe.shield < 150);

  const r = scene();
  r.set({ right: 1 });
  r.run(0.5);
  const moving = r.me.loadout.spreadFor(r.me);
  r.set({ right: -1 }); // a quick tap of the opposite key (movement is snappy, like Valorant)
  r.run(0.05);
  r.set({ right: 0 });
  check('counter-strafing restores accuracy', moving > 3 && r.me.loadout.spreadFor(r.me) < 0.5);
}

// ---------------------------------------------------------- abilities and statuses
/** Look at a point (feet height y) so the camera direction points there. */
const lookAt = (me, p, y) => {
  const dx = p.x - me.pos.x;
  const dz = p.z - me.pos.z;
  me.yaw = Math.atan2(-dx, -dz);
  me.pitch = Math.atan2(y - 1.6, Math.hypot(dx, dz));
  me.recoilPitch = me.recoilYaw = me.punchPitch = me.punchYaw = 0;
};
{
  // Flash Bolt: blinds an enemy looking at it, not one looking away.
  const s = scene({ agent: 'pikachu', enemies: [[0, -20], [3, -20]] });
  s.foes[1].yaw = 0; // facing away (toward -Z, same way as you)
  s.set({ abilityE: true });
  s.run(0.7);
  check('Flash Bolt blinds an enemy looking at it', s.foes[0].blinded);
  check('Flash Bolt spares an enemy looking away', !s.foes[1].blinded);
  check('Flash Bolt has a second charge', s.me.abilities.slots.e.charges === 1);
  s.set({ abilityE: true });
  s.run(0.05);
  s.set({ abilityE: true });
  s.run(0.05);
  check('a third flash is denied until a charge returns', s.log.some((l) => l[0] === 'abilityDenied' && l[1].reason === 'cooldown'));

  s.me.applyStatus('stun', 2);
  s.set({ abilityQ: true });
  s.run(0.05);
  check('a stunned player cannot use abilities', s.log.some((l) => l[0] === 'abilityDenied' && l[1].reason === 'stunned'));

  // Sing: thrown, puts enemies near where it lands to sleep.
  const j = scene({ agent: 'jigglypuff', enemies: [[0, -8]] });
  lookAt(j.me, j.foe.pos, 0);
  j.set({ abilityQ: true });
  j.run(1);
  check('Sing puts an enemy to sleep where it lands', j.foe.asleep);
  j.foe.applyDamage(10);
  check('damage wakes a sleeper', !j.foe.asleep);

  // Confusion: thrown stun.
  const c = scene({ agent: 'alakazam', enemies: [[0, -10]] });
  lookAt(c.me, c.foe.pos, 0);
  c.set({ abilityQ: true });
  c.run(1);
  check('Confusion stuns an enemy where it bursts', c.foe.stunned);

  // Ember: lobbed fire that burns.
  const f = scene({ agent: 'charizard', enemies: [[0, -9]] });
  lookAt(f.me, f.foe.pos, 1.6); // a level throw arcs down onto them
  f.set({ abilityQ: true });
  f.run(1.5);
  const fire = f.ctx.zones.fires[0];
  check('Ember leaves fire on the floor', !!fire && Math.abs(fire.y) < 0.05, fire ? fire.y.toFixed(2) : 'none');
  check('Ember burns an enemy standing in it', f.foe.health + f.foe.shield < 150);

  // Future Sight: recon reveals enemies it can see.
  const r = scene({ agent: 'alakazam', enemies: [[0, -15]] });
  lookAt(r.me, { x: 0, z: -8 }, 0);
  r.set({ abilityE: true });
  r.run(1.5);
  check('Future Sight reveals an enemy in its view', r.foe.revealed);

  // Bubble Trap: arms, then slows and reveals the first enemy on it.
  const t = scene({ agent: 'blastoise', enemies: [[0, -30]] });
  lookAt(t.me, { x: 0, z: -6 }, 0);
  t.set({ abilityQ: true });
  t.run(0.05);
  const trap = t.ctx.zones.traps[0];
  check('Bubble Trap is placed on the floor', !!trap && Math.abs(trap.z + 6) < 0.6, trap ? trap.z.toFixed(2) : 'none');
  t.run(1.2);
  t.foe.teleport(trap.x, 0, trap.z, Math.PI);
  t.run(0.05);
  check('Bubble Trap slows and reveals an enemy', t.foe.status.slow > 0 && t.foe.revealed && t.ctx.zones.traps.length === 0);

  // Protect: shields you and a nearby teammate.
  const w = scene({ agent: 'blastoise' });
  const mate = new Character({ team: 'ally' });
  mate.teleport(3, 0, 0, 0);
  w.ctx.characters.push(mate);
  w.set({ abilityE: true });
  w.run(0.05);
  w.me.applyDamage(60);
  check('Protect shield absorbs damage first', w.me.shield === 40 && w.me.health === 100);
  check('Protect shields nearby teammates', mate.bonusShield === 50);

  // Wish: heals you and teammates; denied when nobody is hurt.
  const h = scene({ agent: 'jigglypuff' });
  h.set({ abilityE: true });
  h.run(0.05);
  check('Wish is denied when nobody is hurt', h.log.some((l) => l[0] === 'abilityDenied'));
  const hurt = new Character({ team: 'ally' });
  hurt.teleport(4, 0, 0, 0);
  hurt.health = 30;
  h.ctx.characters.push(hurt);
  h.set({ abilityE: true });
  h.run(3.2);
  check('Wish heals a hurt teammate', hurt.health >= 89, String(hurt.health));

  const g = scene({ agent: 'gengar', enemies: [[0, -20]] });
  g.me.pitch = -0.12;
  g.set({ abilityQ: true });
  g.run(0.6);
  const a = { x: 0, y: 1.6, z: 0 };
  const bpt = { x: 0, y: 1.1, z: -20 };
  check('smoke blocks bot vision', !g.world.lineOfSight(a, bpt, true));
  check('smoke does not block walls-only checks', g.world.lineOfSight(a, bpt, false));
  check('Dark Fog has two charges', g.me.abilities.slots.q.charges === 1);

  const m = scene({ agent: 'gengar' });
  m.set({ abilityE: true });
  m.run(0.05);
  m.set({ forward: 1 });
  m.run(1);
  m.set({ forward: 0, abilityE: true });
  m.run(0.05);
  check('Shadow Mark teleports you back', Math.abs(m.me.pos.z) < 0.01);

  for (const agent of AGENTS) {
    const at = scene({ agent: agent.id, enemies: [[0, -5]] });
    if (agent.id === 'jigglypuff') at.me.applyDamage(100);
    at.set({ abilityQ: true });
    at.run(0.4);
    at.set({ abilityE: true });
    at.run(0.4);
    check(`${agent.name}: both abilities cast`, at.log.filter((l) => l[0] === 'abilityCast').length === 2);
  }
}

// ---------------------------------------------------------------- zoom, sniper, crouch
{
  // Right click toggles the rifle's zoom; a second click zooms out.
  const z = scene();
  z.set({ adsPressed: true });
  z.run(0.3);
  check('right click zooms the rifle', z.me.loadout.scoped && Math.abs(z.me.loadout.zoom - 1.25) < 1e-6);
  z.set({ adsPressed: true });
  z.run(0.4);
  check('right click again zooms out', z.me.loadout.adsAmount === 0);
  z.set({ adsHold: true, adsHeld: true });
  z.run(0.3);
  check('hold mode zooms while held', z.me.loadout.scoped);
  z.set({ adsHold: true, adsHeld: false });
  z.run(0.4);
  check('hold mode zooms out on release', z.me.loadout.adsAmount === 0);
  z.set({ adsHold: false });
  z.set({ switchTo: 1 });
  z.run(0.5);
  z.set({ adsPressed: true });
  z.run(0.3);
  check('the pistol has no zoom', z.me.loadout.zoom === 1);

  // Recoil: bullets follow the spray, the camera only a little.
  const k = scene();
  k.set({ fireHeld: true });
  k.run(0.6);
  k.set({ fireHeld: false });
  const spray = k.me.aimPitch - k.me.pitch;
  const cam = k.me.viewPitch - k.me.pitch;
  check('the camera follows only part of the spray', spray > 0.04 && cam < spray * 0.5, `${spray.toFixed(3)} / ${cam.toFixed(3)}`);
  k.run(1);
  check('the spray settles after you stop', Math.abs(k.me.recoilPitch) < 0.002);

  // Sniper: one body shot kills when scoped; hip fire is a gamble.
  const sn = scene({ enemies: [[0, -25]] });
  sn.me.loadout.setPrimary('sniper', sn.me, sn.ctx);
  sn.run(1.5);
  const hip = sn.me.loadout.spreadFor(sn.me);
  sn.set({ adsPressed: true });
  sn.run(0.4);
  check('scoping the sniper makes it pin-point', sn.me.loadout.scoped && sn.me.loadout.spreadFor(sn.me) < 0.01 && hip > 3);
  aimAt(sn.me, sn.foe, 1.1);
  sn.set({ firePressed: true });
  sn.run(0.05);
  check('a scoped sniper body shot kills through full shield', !sn.foe.alive);
  check('the sniper stays scoped after a shot', sn.me.loadout.scoped);
  sn.set({ reload: true });
  sn.run(0.05);
  check('reloading takes you out of the scope', !sn.me.loadout.ads);

  // Operator-style dual zoom: 2.5x, then 5x, then out. You stay at 5x between shots.
  const dz = scene({ enemies: [[0, -40], [2, -40]] });
  dz.me.loadout.setPrimary('sniper', dz.me, dz.ctx);
  dz.run(1.5);
  dz.set({ adsPressed: true });
  dz.run(0.4);
  check('first right click: 2.5x', Math.abs(dz.me.loadout.zoom - 2.5) < 1e-6);
  dz.set({ adsPressed: true });
  dz.run(0.1);
  check('second right click: 5x', Math.abs(dz.me.loadout.zoom - 5) < 1e-6);
  aimAt(dz.me, dz.foes[0], 1.1);
  let shotsAt = [];
  dz.ctx.events.on('shot', () => shotsAt.push(dz.ctx.time));
  dz.set({ firePressed: true });
  dz.run(0.1);
  check('the sniper stays at 5x after a shot', dz.me.loadout.scoped && Math.abs(dz.me.loadout.zoom - 5) < 1e-6);
  aimAt(dz.me, dz.foes[1], 1.1);
  for (let i = 0; i < 120 && shotsAt.length < 2; i++) { dz.set({ firePressed: true }); dz.run(T); }
  const gap = shotsAt[1] - shotsAt[0];
  check('scoped, the sniper fires 0.75 a second', Math.abs(gap - 1 / 0.75) < 0.05, gap?.toFixed(2));
  dz.set({ adsPressed: true });
  dz.run(0.4);
  check('third right click zooms out', dz.me.loadout.zoom === 1 && !dz.me.loadout.ads);

  // Legs: 120, so a leg shot does not kill a full-shield enemy.
  const lg = scene({ enemies: [[0, -15]] });
  lg.me.loadout.setPrimary('sniper', lg.me, lg.ctx);
  lg.run(1.5);
  lg.set({ adsPressed: true });
  lg.run(0.4);
  aimAt(lg.me, lg.foe, 0.5);
  let legHit = null;
  lg.ctx.events.on('hit', (h) => { legHit = h; });
  lg.set({ firePressed: true });
  lg.run(0.05);
  check('a sniper leg shot does 120 and leaves them alive', legHit?.part === 'legs' && legHit.damage === 120 && lg.foe.alive);
  check('holding the sniper slows you down', sn.me.loadout.moveMultiplier < 1);

  // Buying swaps slot 1 and keeps the pistol.
  const lo = new Loadout(['rifle', 'pistol']);
  lo.setPrimary('sniper');
  check('buying a sniper replaces the rifle', lo.weapons[0].def.id === 'sniper' && lo.weapons[1].def.id === 'pistol');

  // Crouching lowers your head out of a level shot.
  const cr = scene({ enemies: [[0, -10]] });
  const o = { x: 0, y: 1.58, z: 0 };
  const d = { x: 0, y: 0, z: -1 };
  const bot = { controller: {}, team: 'ally' };
  check('a level shot hits a standing head', traceShot(o, d, bot, cr.ctx).part === 'head');
  cr.foe.crouchAmt = 1;
  check('the same shot misses a crouching head', traceShot(o, d, bot, cr.ctx).part !== 'head');
  cr.set({ crouch: true, forward: 1 });
  cr.run(0.6);
  check('crouching is slower than walking', Math.hypot(cr.me.vel.x, cr.me.vel.z) <= MOVE.crouchSpeed + 0.01 && cr.me.crouchAmt === 1);
}

// ---------------------------------------------------------------- spike
{
  const events = new Events();
  const sites = { A: { x: -20, z: 0, radius: 4 } };
  const who = (team, x, z) => ({ isCharacter: true, alive: true, team, onGround: true, pos: { x, y: 0, z } });
  const hold = (s, c, seconds, on = true) => {
    for (let i = 0; i < Math.round(seconds / T); i++) { s.interact(c, { interact: on }, T); s.tick(T, [c]); }
  };
  const s = new Spike(events, sites);
  const carrier = who('ally', 0, 0);
  s.reset('ally', carrier);
  s.active = true;
  hold(s, carrier, 2);
  check('no planting outside a site', !s.planted);
  carrier.pos.x = -20;
  hold(s, carrier, SPIKE.plantTime + 0.05);
  check('planting on a site', s.planted?.site === 'A');
  const defender = who('enemy', -20.5, 0.5);
  hold(s, defender, 4);
  hold(s, defender, 0.05, false);
  check('defuse progress is kept at halfway', Math.abs(s.defuseProgress - SPIKE.defuseCheckpoint) < 1e-9);
  hold(s, defender, SPIKE.defuseTime - SPIKE.defuseCheckpoint + 0.05);
  check('defusing finishes from the checkpoint', s.defused);

  const d = new Spike(events, sites);
  const c2 = who('ally', -20, 0);
  d.reset('ally', c2);
  d.active = true;
  hold(d, c2, SPIKE.plantTime + 0.05);
  for (let i = 0; i < (SPIKE.fuse + 0.2) / T; i++) d.tick(T, []);
  check('the spike detonates when the fuse runs out', d.detonated);

  const p = new Spike(events, sites);
  const c3 = who('ally', 5, 5);
  const mate = who('ally', 9, 9);
  p.reset('ally', c3);
  p.active = true;
  p.drop(c3);
  p.tick(T, [who('enemy', 5, 5)]);
  check('defenders cannot pick up the spike', !p.carrier);
  mate.pos = { x: 5.3, y: 0, z: 5 };
  p.tick(T, [mate]);
  check('an attacker picks up a dropped spike', p.carrier === mate);
}

// ---------------------------------------------------------------- navigation
for (const map of MAPS) {
  const nav = new NavGraph(map);
  let unreachable = 0;
  for (const a of nav.nodes) if (!nav.path(nav.nodes[0], a)) unreachable++;
  check(`${map.name}: every waypoint is reachable`, unreachable === 0, `${unreachable} unreachable`);
  const avoid = nav.path(nav.byId.get('spawne'), nav.byId.get('siteAa'), { avoidLane: 'M' });
  check(`${map.name}: lane-avoiding paths work`, !!avoid && avoid.filter((n) => n.lane === 'M').length <= 3);
}

// ---------------------------------------------------------------- shooting fixes
{
  // A human's shot is tested against where the target was drawn on screen.
  const s = scene({ enemies: [[0, -10]] });
  const dir = { x: 0, y: 0, z: -1 };
  const origin = { x: 0, y: 1.58, z: 0 };        // level with the head
  s.foe.seenPos = s.foe.pos.clone();
  s.foe.seenPos.x += 0.5;                       // drawn half a metre to the side
  const human = { controller: { isHuman: true }, team: 'ally' };
  const bot = { controller: {}, team: 'ally' };
  origin.x = 0.5;
  check('a human hits a target where it was drawn', traceShot(origin, dir, human, s.ctx).character === s.foe);
  check('a bot is tested against the real position', traceShot(origin, dir, bot, s.ctx).character === null);
  s.foe.seenPos.x += 5;                         // stale (e.g. a respawn since the last frame)
  check('a stale drawn position is ignored', traceShot(origin, dir, human, s.ctx).character === null);

  // Stepping up a ledge lowers the camera for a moment; the bullet must start there too.
  const st = scene({ enemies: [[0, -10]] });
  st.me.loadout.weapons[0].ammo = 25;
  aimAt(st.me, st.foe, 1.6);                    // level shot at eye height: a headshot
  st.me.pitch = 0;
  st.me.stepOffset = -0.45;                     // camera 45 cm lower than the feet+eye position
  let part = null;
  st.ctx.events.on('hit', (h) => { part = h.part; });
  st.me.loadout._fire(st.me, st.ctx);
  check('shots start from the camera after a step', part === 'body', part ?? 'miss');
}

// ---------------------------------------------------------------- Shadow Mark on death
{
  const m = scene({ agent: 'gengar' });
  m.set({ abilityE: true });
  m.run(0.05);
  const slot = m.me.abilities.slots.e;
  const marker = slot.marker;
  m.me.applyDamage(9999);
  m.run(0.05);
  check('Shadow Mark is removed when Gengar dies', slot.marker === null && marker?.dead === true);
}

// ---------------------------------------------------------------- bot weapon choice
{
  const lo = new Loadout(['rifle', 'pistol']);
  check('bots keep a rifle that has ammo', chooseWeapon(lo, false) === null);
  lo.weapons[0].ammo = 0;
  lo.weapons[0].reserve = 0;
  check('bots switch to the pistol when the rifle is dry', chooseWeapon(lo, true) === 1);
  lo.index = 1;
  lo.weapons[0].refill();
  check('bots keep the pistol mid-fight', chooseWeapon(lo, true) === null);
  check('bots go back to the rifle after the fight', chooseWeapon(lo, false) === 0);
  lo.equipTimer = 0.3;
  check('bots do not switch while drawing a weapon', chooseWeapon(lo, false) === null);

  // A semi-automatic weapon fires when the bot presses each time.
  const s = scene({ enemies: [[0, -10]] });
  s.me.loadout.switchTo(1, s.me, s.ctx);
  s.run(0.5);
  aimAt(s.me, s.foe, 1.1);
  let shots = 0;
  s.ctx.events.on('shot', () => shots++);
  for (let i = 0; i < 60; i++) { s.set({ fireHeld: true, firePressed: true }); s.run(T); }
  check('pressing every tick fires the pistol at its fire rate', shots >= 4 && shots <= 6, String(shots));
}

// ---------------------------------------------------------------- mouse glitch filter
{
  const rest = { x: 0, y: 0 };
  check('a huge jump from rest is a glitch', !isRealMouseMove(6000, 0, rest));
  check('normal movement passes', isRealMouseMove(800, -300, rest));
  check('a fast flick that builds up passes', isRealMouseMove(2200, 0, { x: 1400, y: 0 }));
  check('a jump against the motion is a glitch', !isRealMouseMove(-9000, 0, { x: 2000, y: 0 }));
  check('a sudden 10x jump is a glitch', !isRealMouseMove(20000, 0, { x: 1600, y: 0 }));
}

// ---------------------------------------------------------------- footsteps and hearing
{
  // Runs the scene and the footstep detector together; returns the steps heard.
  const withSteps = (s) => {
    const steps = [];
    const fs = new Footsteps(s.world, s.ctx.events);
    s.ctx.events.on('footstep', (f) => steps.push({ ...f, time: s.ctx.time }));
    const go = (seconds, after = () => {}) => {
      for (let i = 0; i < Math.round(seconds / T); i++) { s.run(T); fs.tick(T, s.ctx.characters); after(); }
    };
    return { steps, go };
  };

  const s = scene({ map: null, enemies: [] });
  const { steps, go } = withSteps(s);
  s.set({ right: 1 });
  go(3);
  const mine = steps.filter((f) => f.who === s.me && f.kind === 'step');
  const gaps = mine.slice(2).map((f, i) => f.time - mine[i + 1].time);
  const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  check('running makes a footstep about every 0.34 s', mine.length >= 7 && mine.length <= 10 && Math.abs(avgGap - FOOTSTEPS.stride / MOVE.runSpeed) < 0.03,
    `${mine.length} steps, every ${avgGap.toFixed(3)} s`);
  check('footsteps on the floor sound like concrete', mine.every((f) => f.surface === 'concrete'));

  steps.length = 0;
  s.set({ right: 1, walk: true });
  go(3);
  check('walking (Shift) is silent', steps.length === 0, `${steps.length} steps`);
  s.set({ right: 1, walk: false, crouch: true });
  go(3);
  check('crouching is silent', steps.length === 0, `${steps.length} steps`);

  s.set({ right: 0, crouch: false });
  go(1);
  steps.length = 0;
  s.set({ jump: true });
  go(1.5);
  const lands = steps.filter((f) => f.kind === 'land');
  check('landing from a jump makes one landing sound', lands.length === 1 && steps.length === 1, `${steps.length} sounds`);

  // Surfaces: what the top of each box sounds like.
  const w = worldFrom(testmap);
  check('a crate sounds like wood', w.surfaceAt(-8, 1, 10) === 'wood');
  check('the stair platform sounds like metal', w.surfaceAt(12, 1.5, 10) === 'metal');
  check('the floor sounds like concrete', w.surfaceAt(0, 0, 0) === 'concrete');
  const sites = MAPS.every((m) => {
    const mw = worldFrom(m);
    return Object.values(m.sites ?? {}).every((site) => mw.surfaceAt(site.x, 0.3, site.z) === 'metal');
  });
  check('every site platform sounds like metal', sites);

  // Bots hear the same footsteps you do.
  const h = scene({ map: null, enemies: [[0, -10]] });
  const hs = withSteps(h);
  const senses = new Senses(h.ctx.events);
  h.set({ right: 1 });
  hs.go(1.5, () => senses.tick(T));
  const heard = senses.hear(h.foe, -Infinity);
  check('bots hear you running', heard?.kind === 'step' && heard.source === h.me);
  senses.reset();
  h.set({ right: -1, walk: true });
  hs.go(1.5, () => senses.tick(T));
  check('bots do not hear you walking', senses.hear(h.foe, -Infinity) === null);
  h.set({ right: 0, walk: false, jump: true });
  hs.go(1.5, () => senses.tick(T));
  check('bots hear you land a jump', senses.hear(h.foe, -Infinity)?.kind === 'step');
  h.me.applyDamage(999);
  hs.steps.length = 0;
  h.set({ right: 1, jump: false });
  hs.go(1);
  check('dead characters make no footsteps', hs.steps.length === 0);
}

// ---------------------------------------------------------------- kill streaks
{
  const k = new KillStreak();
  check('first kill counts 1', k.add(0, STREAK.window) === 1);
  check('a quick second kill chains', k.add(3, STREAK.window) === 2);
  check('a slow kill outside a match starts over', k.add(3 + STREAK.window + 1, STREAK.window) === 1);
  k.reset();
  const inMatch = [0, 20, 40, 60, 80].map((t) => k.add(t, Infinity));
  check('in a match kills count for the whole round, up to an Ace', inMatch.join() === '1,2,3,4,5' && STREAK.ace === 5);
}

// ---------------------------------------------------------------- team tactics
{
  // A seeded random number generator, so these checks don't depend on luck.
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const mem = new TeamMemory();
  const seen = {};
  let repeats = 0;
  let last = null;
  for (let i = 0; i < 200; i++) {
    const p = pickPlan('attack', mem, { rng });
    seen[p] = (seen[p] ?? 0) + 1;
    if (p === last) repeats++;
    last = p;
  }
  check('every attack plan gets picked', Object.keys(PLANS.attack).every((p) => seen[p] > 10), JSON.stringify(seen));
  check('the same plan rarely comes twice in a row', repeats < 25, `${repeats} repeats in 200`);
  const easy = new Set();
  for (let i = 0; i < 100; i++) easy.add(pickPlan('attack', new TeamMemory(), { basic: true, rng }));
  check('Easy bots only use the simple plans', [...easy].sort().join() === 'default,rush', [...easy].join());

  // Memory: two of your kills from the same spot make it hot; it fades after rounds.
  const m = new TeamMemory();
  m.recordDeath({ x: 10, y: 1.6, z: 5 }, 'A', true);
  check('one kill is not enough to make a spot hot', m.hot.length === 0);
  m.recordDeath({ x: 11, y: 1.6, z: 6 }, 'A', true);
  check('two of your kills from the same spot make it hot', m.hot.length === 1 && Math.abs(m.hot[0].x - 10.5) < 1e-9);
  m.endRound();
  check('a hot spot stays hot for the next round', m.hot.length === 1);
  m.endRound();
  check('it cools down if you stop using it', m.hot.length === 0);
  const bots = new TeamMemory();
  bots.recordDeath({ x: 0, y: 1.6, z: 0 }, 'M', false);
  bots.recordDeath({ x: 0.5, y: 1.6, z: 0 }, 'M', false);
  check('kills by bots count too, a little less', bots.hot.length === 1 && bots.hot[0].heat < 2 * TACTICS.humanWeight);

  // Attackers avoid the site where they keep dying; defenders stack the site that keeps getting hit.
  const avoid = new TeamMemory();
  avoid.laneDeaths.A = 4;
  let a = 0;
  for (let i = 0; i < 400; i++) if (pickSite(avoid, ['A', 'B'], rng) === 'A') a++;
  check('attackers go less often where they keep dying', a < 140, `${a} of 400 to A`);
  const def = new TeamMemory();
  def.recordSiteHit('B');
  def.recordSiteHit('B');
  check('defenders stack the site attackers keep hitting', stackSite(def, rng) === 'B');
  let stacks = 0;
  for (let i = 0; i < 300; i++) if (pickPlan('defend', def, { rng }) === 'stack') stacks++;
  let plain = 0;
  for (let i = 0; i < 300; i++) if (pickPlan('defend', new TeamMemory(), { rng }) === 'stack') plain++;
  check('defenders stack more after seeing the same site hit', stacks > plain * 1.4, `${stacks} vs ${plain}`);
  check('every plan has a callout', Object.entries(PLANS).every(([kind, plans]) =>
    Object.keys(plans).every((p) => planCallout(kind, p, { site: 'A', other: 'B' }))));
}

// ---------------------------------------------------------------- animated bodies
{
  const F = 1 / 60;
  const world = (o) => { o.updateWorldMatrix(true, false); return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld); };
  const make = () => {
    const c = new Character({ team: 'enemy' });
    c.agent = agentById('pikachu');
    c.loadout = new Loadout(['rifle', 'pistol']);
    c.teleport(3, 0, -2, 0.7);
    c.onGround = true;
    return c;
  };
  const frames = (c, n) => { for (let i = 0; i < n; i++) c.syncMesh(1, false, F); };
  const parts = (c) => c.mesh.userData;

  const c = make();
  frames(c, 30);
  const headAt = (ch) => world(parts(ch).head);
  const off = (p, y) => Math.hypot(p.x - c.pos.x, p.y - y, p.z - c.pos.z);
  check('the head sits on the head hitbox', off(headAt(c), HITBOX.headY) < 0.03, off(headAt(c), HITBOX.headY).toFixed(3));
  const chest = world(parts(c).chest);
  check('the torso covers the body hitbox', chest.y > HITBOX.legsTop && chest.y < HITBOX.bodyTop);
  const feet = parts(c).legs.map((l) => world(l.foot));
  check('standing still, both feet are on the ground', feet.every((f) => f.y < 0.08), feet.map((f) => f.y.toFixed(3)).join());

  c.crouchAmt = 1;
  frames(c, 30);
  const k = CROUCH.scale;
  check('crouched, the head still sits on the (lower) head hitbox', off(headAt(c), HITBOX.headY * k) < 0.03, off(headAt(c), HITBOX.headY * k).toFixed(3));
  check('crouched, the hips drop and the feet stay down', world(parts(c).belt).y < HITBOX.legsTop * k + 0.02 && parts(c).legs.every((l) => world(l.foot).y < 0.1));
  c.crouchAmt = 0;

  // Running forward: the feet take turns in front.
  c.vel.set(-Math.sin(c.yaw) * MOVE.runSpeed, 0, -Math.cos(c.yaw) * MOVE.runSpeed);
  const fwd = new THREE.Vector3(-Math.sin(c.yaw), 0, -Math.cos(c.yaw));
  let leftAhead = 0;
  let rightAhead = 0;
  let maxLift = 0;
  for (let i = 0; i < 90; i++) {
    frames(c, 1);
    const [l, r] = parts(c).legs.map((leg) => world(leg.foot));
    const dl = l.clone().sub(c.pos).dot(fwd);
    const dr = r.clone().sub(c.pos).dot(fwd);
    if (dl > dr + 0.2) leftAhead++;
    if (dr > dl + 0.2) rightAhead++;
    maxLift = Math.max(maxLift, l.y, r.y);
  }
  check('running, the legs take turns stepping forward', leftAhead > 15 && rightAhead > 15, `${leftAhead} / ${rightAhead} frames`);
  check('running, the feet lift off the ground', maxLift > 0.08 && maxLift < 0.4, maxLift.toFixed(2));
  check('running, the head stays on its hitbox', off(headAt(c), HITBOX.headY) < 0.03);
  c.vel.set(0, 0, 0);

  // Aiming up raises the gun; a hit makes it flinch; firing kicks the gun.
  const gunY = () => world(parts(c).guns.rifle).y;
  frames(c, 30);
  // The front hand (on the gun's foregrip, far from the shoulder) shows the aim best.
  const level = world(parts(c).arms[0].hand).y;
  c.pitch = 0.6;
  frames(c, 30);
  const raised = world(parts(c).arms[0].hand).y - level;
  check('aiming up raises the arms and gun', raised > 0.15, `${raised.toFixed(3)} m`);
  c.pitch = 0;
  frames(c, 30);
  const before = parts(c).spine.rotation.x;
  c.visualHit({ x: c.pos.x - Math.sin(c.yaw) * 10, z: c.pos.z - Math.cos(c.yaw) * 10 }, 'body'); // shot from the front
  frames(c, 3);
  check('a hit from the front makes the torso flinch back', parts(c).spine.rotation.x > before + 0.05);
  frames(c, 30);
  check('the flinch settles', Math.abs(parts(c).spine.rotation.x - before) < 0.02);
  check('the gun in hand matches the weapon', parts(c).guns.rifle.visible && !parts(c).guns.pistol.visible);
  c.loadout.switchTo(1, c, { events: new Events() });
  frames(c, 1);
  check('switching to the pistol shows the pistol', parts(c).guns.pistol.visible && !parts(c).guns.rifle.visible);

  // Death: falls away from the shot and ends up lying on the ground.
  const d = make();
  frames(d, 10);
  const shooter = { x: d.pos.x + 10, z: d.pos.z }; // from the east, so it falls west
  d.visualHit(shooter, 'head');
  d.applyDamage(999);
  for (let i = 0; i < 90; i++) { d.deathTime += F; d.syncMesh(1, false, F); }
  const h = headAt(d);
  check('a dead body ends up lying down', h.y < 0.55, h.y.toFixed(2));
  check('it falls away from the shot', h.x < d.pos.x - 0.8, (h.x - d.pos.x).toFixed(2));
  d.revive(0, 0, 0, 0);
  frames(d, 5);
  check('reviving stands the body back up', Math.abs(headAt(d).y - HITBOX.headY) < 0.03);

  // Ten bodies animate quickly.
  const crowd = Array.from({ length: 10 }, make);
  crowd.forEach((ch, i) => ch.vel.set(Math.sin(i) * 6, 0, Math.cos(i) * 6));
  const t0 = performance.now();
  for (let i = 0; i < 600; i++) for (const ch of crowd) ch.syncMesh(1, false, F);
  const ms = (performance.now() - t0) / 600;
  check('ten animated bodies take well under a millisecond a frame', ms < 0.8, `${ms.toFixed(3)} ms`);
}

// ---------------------------------------------------------------- economy and new guns
{
  check('every weapon has a price, a slot, damage, and a description', Object.values(ALL_WEAPONS).every((w) =>
    w.price >= 0 && ['primary', 'secondary'].includes(w.slot) && w.damage.head > 0 && w.about));
  check('every buy menu item exists and has a price', BUY_ORDER.every((id) => priceOf(id) > 0) && BUY_ORDER.length === 10);
  check('the sidearm is free', ALL_WEAPONS.sidearm.price === 0);
  check('income: win 3000; losses 1900, 2400, then 2900', roundIncome(true) === 3000 &&
    [1, 2, 3, 5].map((n) => roundIncome(false, n)).join() === '1900,2400,2900,2900');
  const capped = { credits: 8900 };
  addCredits(capped, 500);
  check('credits cap at 9000', capped.credits === ECONOMY.max);

  // Buying, swapping, and selling back.
  const c = new Character({ team: 'ally' });
  c.loadout = startingLoadout();
  c.credits = 3900;
  c.shield = 0;
  check('you start with no primary and the free sidearm', c.loadout.weapons[0] === null && c.loadout.current.def.id === 'sidearm');
  const bought = new Map();
  purchase(c, 'rifle', { bought });
  check('buying a rifle costs 2900 and puts it in your hands', c.credits === 1000 && c.loadout.current.def.id === 'rifle');
  check('you can\'t afford what you don\'t have the credits for', purchase(c, 'sniper', { bought }).ok === false);
  purchase(c, 'carbine', { bought });
  check('swapping to another gun bought this round refunds the first', c.credits === 1000 && c.loadout.weapons[0].def.id === 'carbine');
  purchase(c, 'carbine', { bought });
  check('pressing it again sells it back', c.credits === 3900 && c.loadout.weapons[0] === null && c.loadout.current.def.id === 'sidearm');
  purchase(c, 'light', { bought });
  purchase(c, 'heavy', { bought });
  check('heavy shield over a light one bought this round refunds the light', c.shield === 50 && c.credits === 2900);
  purchase(c, 'heavy', { bought });
  check('selling the shield back gives the money and removes it', c.shield === 0 && c.credits === 3900);
  const free = new Character({ team: 'ally' });
  free.loadout = startingLoadout();
  free.credits = 0;
  check('in the test range everything is free', purchase(free, 'sniper', { free: true }).ok && free.credits === 0);

  // Bot buying decisions.
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  check('team buy: first round of a half is a pistol round', teamBuy([800, 800], { pistolRound: true }) === 'pistol');
  check('team buy: plenty of money is a full buy', teamBuy([4000, 5000, 4500]) === 'full');
  check('team buy: broke after a loss saves', teamBuy([1500, 1200], { lostLast: true, rng: r }) === 'eco');
  check('team buy: after a win without full money, a bonus round', teamBuy([2500, 2500], { wonLast: true }) === 'bonus');
  check('team buy: a losing streak forces', teamBuy([2600, 2500], { lostLast: true, lossStreak: 2 }) === 'force');
  const rich = { credits: 6000, shield: 0, loadout: startingLoadout() };
  const fullList = botShopping(rich, 'full', { rng: r });
  check('a full buy is a rifle or carbine and a heavy shield', ['rifle', 'carbine'].includes(fullList[0]) && fullList[1] === 'heavy');
  check('the team sniper buys the sniper', botShopping({ ...rich }, 'full', { sniper: true, rng: r })[0] === 'sniper');
  const forced = botShopping({ credits: 2400, shield: 0, loadout: startingLoadout() }, 'force', { rng: r });
  check('a force buy is a cheaper gun plus a light shield, within budget',
    ['marksman', 'shotgun', 'smg'].includes(forced[0]) && forced.includes('light') && forced.reduce((s, id) => s + priceOf(id), 0) <= 2400);
  const pistol = Array.from({ length: 40 }, () => botShopping({ credits: 800, shield: 0, loadout: startingLoadout() }, 'pistol', { rng: r }));
  check('pistol round buys never cost more than 800', pistol.every((l) => l.reduce((s, id) => s + priceOf(id), 0) <= 800));
  const kept = { credits: 5000, shield: 20, loadout: new Loadout(['rifle', 'sidearm']) };
  check('a bot that kept its rifle only buys shield', botShopping(kept, 'full', { rng: r }).join() === 'heavy');

  // Shotgun: pellets add up up close, fall off with range.
  const s = scene({ map: null, enemies: [[0, -3]] });
  s.me.loadout = new Loadout(['shotgun', 'sidearm']);
  s.me.loadout.weapons[0].ammo = 7;
  s.foe.shield = 50;
  aimAt(s.me, s.foe, 1.1);
  s.set({ firePressed: true, fireHeld: true });
  s.run(T);
  check('a close shotgun blast kills through full shield', !s.foe.alive);
  const far = scene({ map: null, enemies: [[0, -20]] });
  far.me.loadout = new Loadout(['shotgun', 'sidearm']);
  far.foe.shield = 50;
  aimAt(far.me, far.foe, 1.1);
  far.set({ firePressed: true, fireHeld: true });
  far.run(T);
  check('a shotgun blast at 20 m does not', far.foe.alive); // (the cone is wider than a body there: often a few pellets, sometimes none)
  // Carbine: one-shot headshot up close, not at long range.
  const dmg = (id, dist, part) => Math.round(ALL_WEAPONS[id].damage[part] * (ALL_WEAPONS[id].falloff.filter((f) => dist >= f.from).at(-1)?.mult ?? 1));
  check('carbine headshots kill through full shield up close, not far away', dmg('carbine', 10, 'head') >= 150 && dmg('carbine', 35, 'head') < 150);
  check('marksman headshots kill at any range', dmg('marksman', 60, 'head') >= 150);
  check('silenced guns are the carbine and light pistol', Object.values(ALL_WEAPONS).filter((w) => w.suppressed).map((w) => w.id).sort().join() === 'carbine,lightpistol');
}

// ---------------------------------------------------------------- ultimates, agents, orbs, rank
{
  const TYPES = ['dash', 'throw', 'smoke', 'marker', 'trap', 'aura'];
  check('there are 8 agents, each with Q, E, and an ultimate on X',
    AGENTS.length === 8 && AGENTS.every((a) => a.abilities.q && a.abilities.e && a.abilities.x?.ult >= 6));
  check('every ability uses a known effect type', AGENTS.every((a) => Object.values(a.abilities).every((ab) => TYPES.includes(ab.type))));
  check('every role still has an agent', ['Duelist', 'Controller', 'Initiator', 'Sentinel', 'Support'].every((r) => AGENTS.some((a) => a.role === r)));

  const s = scene({ map: null, enemies: [] });
  s.me.agent = agentById('blastoise');
  s.me.abilities = new AbilityKit(s.me.agent);
  s.me.ultPoints = 0;
  let casts = 0;
  let denied = 0;
  s.ctx.events.on('abilityCast', (e) => { if (e.key === 'x') casts++; });
  s.ctx.events.on('abilityDenied', (e) => { if (e.key === 'x') denied++; });
  s.set({ abilityX: true });
  s.run(T);
  check('an ultimate without enough points is refused', casts === 0 && denied === 1);
  let ready = false;
  for (let i = 0; i < 7; i++) ready = addUltPoints(s.me, 1) || ready;
  check('points cap at the cost, and it says when it becomes ready', s.me.ultPoints === 7 && ready && !addUltPoints(s.me, 1));
  s.set({ abilityX: true });
  s.run(T);
  s.set({ abilityX: false });
  check('with full points it casts, and spends them all', casts === 1 && s.me.ultPoints === 0);
  check('Shell Fortress gives 100 extra shield', s.me.bonusShield === 100, `${s.me.bonusShield}`);

  // Orbs: one on each half, mirrored; touching one takes it.
  const spots = MAPS.map((m) => orbSpots(new NavGraph(m)));
  check('every map has two mirrored orbs', spots.every((p) => p.length === 2 && Math.abs(p[0].x + p[1].x) < 1e-6 && Math.abs(p[0].z + p[1].z) < 1e-6));
  const ev = new Events();
  const orbs = new Orbs(null, ev);
  orbs.reset([{ x: 0, y: 0, z: 0 }]);
  let took = null;
  ev.on('orbTaken', ({ who }) => (took = who));
  const walker = new Character({ team: 'ally' });
  walker.abilities = new AbilityKit(agentById('pikachu'));
  walker.teleport(3, 0, 0, 0);
  orbs.tick(T, [walker]);
  check('an orb is not taken from 3 m away', took === null);
  walker.teleport(0.5, 0, 0, 0);
  orbs.tick(T, [walker]);
  check('walking over an orb takes it', took === walker && orbs.active.length === 0);

  // Rank: names, RR changes, and saving (to a stand-in for the browser's storage).
  if (!globalThis.localStorage) {
    const mem = new Map();
    globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  }
  check('rank names go Bronze 1 to Champion', rankOf(0).name === 'Bronze 1' && rankOf(250).name === 'Bronze 3' && rankOf(300).name === 'Silver 1' && rankOf(1799).name === 'Master 3' && rankOf(1800).name === 'Champion');
  check('a win gains RR, a loss costs it', rrChange({ won: true }) === RANK.win && rrChange({ won: false }) === -RANK.loss);
  check('hard wins are worth more, easy wins less', rrChange({ won: true, difficulty: 'hard' }) > rrChange({ won: true }) &&
    rrChange({ won: true, difficulty: 'easy' }) < rrChange({ won: true }));
  check('a big game adds a little, capped', rrChange({ won: true, kills: 30, deaths: 5 }) === RANK.win + RANK.performance);
  check('a win always gains and a loss always costs', rrChange({ won: true, difficulty: 'easy', kills: 0, deaths: 20 }) > 0 &&
    rrChange({ won: false, difficulty: 'hard', kills: 40, deaths: 0 }) < 0);
  check('deathmatch counts half', rrChange({ won: true, mode: 'deathmatch' }) === Math.round(RANK.win / 2));
  const before = matchHistory().length;
  const rec = recordMatch({ won: false, difficulty: 'medium', mode: 'spike', kills: 0, deaths: 10, map: 'Test', us: 0, them: 7 });
  check('a loss at 0 RR stays at 0', rec.rrAfter === 0 && currentRank().rr === 0);
  const win = recordMatch({ won: true, difficulty: 'hard', mode: 'spike', kills: 12, deaths: 8, map: 'Test', us: 7, them: 5 });
  check('matches are saved to the history, newest first', matchHistory().length === before + 2 && matchHistory()[0].date === win.date && win.rrAfter > 0);
}

// ---------------------------------------------------------------- settings codes
{
  // settings.js reads localStorage on import, so give Node a tiny stand-in.
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const { settings, exportSettingsCode, importSettingsCode } = await import('../src/core/settings.js');
  settings.sensitivity = 0.37;
  settings.crosshairColor = '#4fd1ff';
  const code = exportSettingsCode();
  settings.sensitivity = 1.5;
  settings.crosshairColor = '#ffffff';
  importSettingsCode(code);
  check('a settings code restores your settings', settings.sensitivity === 0.37 && settings.crosshairColor === '#4fd1ff');
  const evil = 'PS1.' + Buffer.from(JSON.stringify({ sensitivity: 999, fov: 'wide', quality: 'ultra', unknown: 1 })).toString('base64');
  importSettingsCode(evil);
  check('bad values in a code are clamped or ignored', settings.sensitivity === 2 && settings.fov === 103 && settings.quality !== 'ultra');
  const sound = (v) => 'PS1.' + Buffer.from(JSON.stringify({ spatialAudio: v })).toString('base64');
  importSettingsCode(sound('stereo'));
  const stereo = settings.spatialAudio;
  importSettingsCode(sound('surround-7.1'));
  check('sound positioning is saved in codes, and bad values are ignored', stereo === 'stereo' && settings.spatialAudio === 'stereo');
  let threw = false;
  try { importSettingsCode('hello'); } catch { threw = true; }
  check('a code that is not ours is rejected', threw);
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
