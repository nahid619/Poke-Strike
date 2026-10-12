// Headless tests for the game rules: movement, weapons, abilities, status
// effects, the spike, and bot navigation. Run with: npm test
import { World } from '../src/core/physics.js';
import { Events } from '../src/core/events.js';
import { Character, MOVE } from '../src/game/character.js';
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

const T = 1 / 60;
let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` (${detail})` : ''}`);
}

function worldFrom(map) {
  const w = new World();
  for (const b of map.boxes) w.addBox(b.x - b.w / 2, b.y, b.z - b.d / 2, b.x + b.w / 2, b.y + b.h, b.z + b.d / 2);
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
  let threw = false;
  try { importSettingsCode('hello'); } catch { threw = true; }
  check('a code that is not ours is rejected', threw);
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
