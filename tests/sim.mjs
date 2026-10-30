// Bot-vs-bot match simulation, headless. Plays full plant-and-defuse matches
// with every character run by bots, and checks that team plans actually play
// out: every plan gets used, spikes get planted, rounds end, nobody gets stuck,
// and neither side wins nearly every round.
// Run with: npm run test:bots   (part of npm test; takes a few seconds)
import { BotController } from '../src/ai/bot.js';
import { skillFor } from '../src/ai/difficulty.js';

// ---- the browser bits the game touches, stubbed for Node
const noop = new Proxy(function () {}, { get: () => noop, apply: () => noop });
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 40 }) : () => {}), set: (t, k, v) => ((t[k] = v), true) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = {};

const { MatchMode } = await import('../src/modes/match.js');
const { MAPS } = await import('../src/data/maps/index.js');
const { agentById } = await import('../src/data/agents.js');
const { settings } = await import('../src/core/settings.js');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) passed++;
  else failures.push(`${name}${detail ? ` (${detail})` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

const T = 1 / 60;
const shared = { renderer: { capabilities: { getMaxAnisotropy: () => 1 } }, sound: noop, hud: noop, viewmodel: noop, controller: noop, settings };
const totals = { attack: {}, defend: {}, rounds: 0, attackWins: 0, plants: 0, stuckRounds: 0, timeouts: 0, sites: { A: 0, B: 0 } };
const high = {}; // map -> seconds bots spent on raised platforms
const tiers = {}; // team buy decisions
const guns = {};  // primaries in hand when rounds go live
const kills = {}; // kills by weapon
const longest = { stuck: 0 };

for (const map of MAPS) {
  const m = new MatchMode(shared, map);
  // You are a bot too: same brain as everyone (not part of team plans).
  const playerBrain = () => new BotController({ nav: m.nav, ctx: m.ctx, mode: 'fight', role: 'support', skill: skillFor('medium') });
  m.events.on('roundStart', () => { m.player.brain = playerBrain(); m.player.setController(m.player.brain); });
  m.events.on('teamPlan', ({ kind, plan }) => { if (kind !== 'elimination') totals[kind][plan] = (totals[kind][plan] ?? 0) + 1; });
  m.events.on('spikePlanted', ({ site }) => { totals.plants++; totals.sites[site]++; });
  m.events.on('teamBuy', ({ tier }) => { tiers[tier] = (tiers[tier] ?? 0) + 1; });
  m.events.on('roundLive', () => { for (const b of m.bots) { const id = b.loadout?.weapons[0]?.def.id ?? 'none'; guns[id] = (guns[id] ?? 0) + 1; } });
  m.events.on('kill', ({ weapon }) => { if (weapon) kills[weapon.id] = (kills[weapon.id] ?? 0) + 1; });
  m.events.on('roundEnd', ({ winner, reason }) => {
    totals.rounds++;
    if (winner && winner === m.attackers) totals.attackWins++;
    if (reason === 'time') totals.timeouts++;
  });
  m.start({ agent: agentById('pikachu'), roundsToWin: 7, difficulty: 'medium', mode: 'spike', botMode: 'fight', takeover: false });
  m.player.brain = playerBrain();
  m.player.setController(m.player.brain);

  // Watch for bots standing still too long while the round is live (stuck).
  const still = new Map();
  let ticks = 0;
  while (m.phase !== 'over' && ticks < 60 * 60 * 30) {
    m.tick(T);
    ticks++;
    if (m.phase !== 'live' || ticks % 30) continue;
    for (const b of m.bots) if (b.alive && b.pos.y > 0.9 && b.onGround) high[map.name] = (high[map.name] ?? 0) + 0.5;
    for (const b of m.bots) {
      if (!b.alive || b.frozen) { still.delete(b); continue; }
      const prev = still.get(b);
      const moved = !prev || Math.hypot(b.pos.x - prev.x, b.pos.z - prev.z) > 0.5;
      // Waiting on purpose: holding, fighting, a lurk or fake, staging, or trailing a nearby entry.
      const L = b.brain.orders?.leader;
      const trailing = L?.alive && Math.hypot(L.pos.x - b.pos.x, L.pos.z - b.pos.z) < 9;
      const busy = ['hold', 'guard', 'plant', 'defuse', 'fight'].includes(b.brain.state) || b.brain.endHold || trailing ||
        (b.brain.orders?.plan && !b.brain.orders.plan.go && !b.brain.staged);
      if (moved || busy) still.set(b, { x: b.pos.x, z: b.pos.z, since: m.ctx.time });
      else {
        const t = m.ctx.time - prev.since;
        if (t > longest.stuck) {
          longest.stuck = t;
          const br = b.brain;
          longest.what = `${b.name} ${b.team === m.attackers ? 'attack' : 'defend'} state=${br.state} kind=${br.orders?.kind} plan=${br.orders?.plan?.name} ` +
            `route=${br.routeIndex}/${br.orders?.route?.length} leader=${br.orders?.leader?.name ?? '-'}(${br.orders?.leader?.alive ? 'alive' : 'dead'}, ${br.orders?.leader?.brain?.state}, idx ${br.orders?.leader?.brain?.routeIndex}) ` +
            `lurk=${!!br.orders?.lurk} fake=${!!br.orders?.fake} staged=${br.staged} go=${br.orders?.plan?.go} stuckCount=${br.stuck} path=${br.path?.length ?? 0}`;
        }
      }
    }
  }
  check(`${map.name}: the match finishes`, m.phase === 'over', `${m.score.ally}-${m.score.enemy} after ${m.round} rounds`);
}

// Team deathmatch on every map: respawns, the kill target, ultimates, and orbs.
const dm = { finished: 0, respawns: 0, ults: 0, orbs: 0, kills: 0 };
for (const map of MAPS) {
  const m = new MatchMode(shared, map);
  const playerBrain = () => new BotController({ nav: m.nav, ctx: m.ctx, mode: 'fight', role: 'entry', skill: skillFor('medium') });
  m.events.on('abilityCast', ({ key }) => { if (key === 'x') dm.ults++; });
  m.events.on('orbTaken', () => dm.orbs++);
  m.events.on('kill', () => dm.kills++);
  m.start({ agent: agentById('lucario'), roundsToWin: 3, difficulty: 'medium', mode: 'deathmatch', botMode: 'fight', takeover: false });
  m.player.brain = playerBrain();
  m.player.setController(m.player.brain);
  const wasDead = new Set();
  let ticks = 0;
  while (m.phase !== 'over' && ticks < 60 * 60 * 8) {
    m.tick(T);
    ticks++;
    if (!m.player.alive) wasDead.add(m.player);
    for (const c of m.players) {
      if (!c.alive) wasDead.add(c);
      else if (wasDead.has(c)) { dm.respawns++; wasDead.delete(c); }
    }
    if (m.player.alive && m.player.controller !== m.player.brain) m.player.setController(m.player.brain);
  }
  if (m.phase === 'over') dm.finished++;
  console.log(`${map.name} deathmatch: ${m.score.ally}-${m.score.enemy} in ${(ticks / 60).toFixed(0)} s, saved: ${m.lastRecord?.rank}`);
}
console.log('deathmatch:', dm);
check('deathmatch finishes on every map', dm.finished === MAPS.length);
check('in deathmatch, dead players respawn', dm.respawns > 20, `${dm.respawns} respawns`);
check('bots use their ultimates', dm.ults > 3, `${dm.ults} ultimates`);
check('ultimate orbs get picked up', dm.orbs > 0, `${dm.orbs} orbs`);

const attackPlans = Object.keys(totals.attack);
const defendPlans = Object.keys(totals.defend);
console.log('\nattack plans:', totals.attack, '\ndefense plans:', totals.defend);
console.log(`rounds ${totals.rounds}, attack won ${totals.attackWins}, plants ${totals.plants} (A ${totals.sites.A}, B ${totals.sites.B}), timeouts ${totals.timeouts}`);
check('every attack plan gets used', ['default', 'rush', 'split', 'fake', 'slow'].every((p) => attackPlans.includes(p)), attackPlans.join(', '));
check('every defense plan gets used', ['standard', 'stack', 'push'].every((p) => defendPlans.includes(p)), defendPlans.join(', '));
check('attackers plant in a good share of rounds', totals.plants / totals.rounds > 0.12, `${totals.plants} of ${totals.rounds}`);
check('both sites get attacked', totals.sites.A > 0 && totals.sites.B > 0);
const share = totals.attackWins / totals.rounds;
check('neither side wins almost every round', share > 0.15 && share < 0.85, `attack won ${(share * 100).toFixed(0)}%`);
check('rounds rarely run out of time', totals.timeouts / totals.rounds < 0.35, `${totals.timeouts} of ${totals.rounds}`);
check('no bot stands stuck for long', longest.stuck < 8, `longest ${longest.stuck.toFixed(1)} s`);
console.log('team buys:', tiers, '\nprimaries at round start:', guns, '\nkills by weapon:', kills);
check('teams make every kind of buy', ['pistol', 'full', 'eco'].every((t) => tiers[t] > 0) && (tiers.force ?? 0) + (tiers.bonus ?? 0) > 0,
  Object.keys(tiers).join(', '));
check('bots buy a variety of guns', Object.keys(guns).filter((g) => g !== 'none').length >= 5, Object.keys(guns).join(', '));
check('bots get kills with sidearms and with bought guns', Object.keys(kills).length >= 5, Object.keys(kills).join(', '));
// (One match per map is short, so one map may go a whole match without anyone up high.)
check('bots use the high ground', MAPS.filter((m) => (high[m.name] ?? 0) > 0).length >= 2,
  MAPS.map((m) => `${m.name} ${(high[m.name] ?? 0).toFixed(0)} s`).join(', '));
if (longest.what) console.log('longest still:', longest.what);

console.log(`\nbots: ${passed} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
