// Credits and buying, like Valorant.
//
// Everyone starts each half with 800 credits. Kills pay 200, planting pays
// every attacker 300, winning a round pays 3000, and losing pays 1900, then
// 2400, then 2900 as a losing streak grows (so a team that keeps losing can
// still buy eventually). Credits cap at 9000.
//
// If you survive a round, you keep your guns and whatever shield you have
// left. If you die, you start the next round with the free sidearm and no
// shield. During the countdown you can sell back anything you bought that
// round (press its key again), for a full refund.
//
// Bots follow the same rules. Each round a bot team looks at its money and
// decides: full buy, force buy (spend what you have after a loss), bonus
// (after a win: keep guns, buy cheap), or eco (save for next round).
import { WEAPONS, PRIMARIES, SECONDARIES } from '../data/weapons.js';
import { Loadout } from './weapons.js';

export const ECONOMY = {
  start: 800,
  max: 9000,
  kill: 200,
  plant: 300,
  win: 3000,
  loss: [1900, 2400, 2900], // first loss, second in a row, third or more
  fullBuy: 3900,            // team average for a full buy (rifle + heavy shield)
  forceBuy: 2000,           // team average to force after a loss
};

export const SHIELDS = {
  light: { id: 'light', name: 'Light Shield', price: 400, amount: 25, about: '25 shield.' },
  heavy: { id: 'heavy', name: 'Heavy Shield', price: 1000, amount: 50, about: '50 shield.' },
};

/** The buy menu, in key order: 1-9, then 0. */
export const BUY_ORDER = ['lightpistol', 'pistol', 'smg', 'shotgun', 'marksman', 'carbine', 'rifle', 'sniper', 'light', 'heavy'];

export const itemOf = (id) => WEAPONS[id] ?? SHIELDS[id] ?? null;
export const priceOf = (id) => itemOf(id)?.price ?? null;

/** Credits for the end of a round. `lossStreak` counts this loss too. */
export function roundIncome(won, lossStreak = 1) {
  if (won) return ECONOMY.win;
  return ECONOMY.loss[Math.max(0, Math.min(lossStreak, ECONOMY.loss.length) - 1)];
}

export function addCredits(c, amount) {
  c.credits = Math.max(0, Math.min(ECONOMY.max, (c.credits ?? 0) + amount));
}

/** The loadout you start with when you have nothing: no primary, the free sidearm. */
export const startingLoadout = () => new Loadout([null, 'sidearm']);

/**
 * Buy (or sell back) one item for character `c`. `free`: the test range,
 * where everything costs nothing. `bought` is this round's purchases
 * (id -> price paid), used for refunds. Returns what happened.
 */
export function purchase(c, id, { free = false, bought = new Map(), ctx = null } = {}) {
  const item = itemOf(id);
  if (!item || !c.loadout) return { ok: false, reason: 'unknown' };
  const price = free ? 0 : item.price;
  const L = c.loadout;

  if (SHIELDS[id]) {
    if (bought.has(id) && !free) {
      // Sell it back.
      addCredits(c, bought.get(id));
      bought.delete(id);
      c.shield = c.shieldBefore ?? 0;
      return { ok: true, sold: id };
    }
    if ((c.shield ?? 0) >= item.amount && !free) return { ok: false, reason: 'have' };
    // Buying heavy over a light shield bought this round refunds the light.
    const refund = id === 'heavy' && bought.has('light') ? bought.get('light') : 0;
    if ((c.credits ?? 0) + refund < price) return { ok: false, reason: 'credits' };
    if (refund) {
      addCredits(c, refund);
      bought.delete('light');
    } else {
      c.shieldBefore = c.shield ?? 0;
    }
    addCredits(c, -price);
    bought.set(id, price);
    c.shield = item.amount;
    return { ok: true, bought: id };
  }

  const slot = item.slot === 'primary' ? 0 : 1;
  const current = L.weapons[slot]?.def.id ?? null;
  if (current === id) {
    if (free || !bought.has(id)) return { ok: false, reason: 'have' };
    // Sell it back: get the money, and the slot goes back to what it was.
    addCredits(c, bought.get(id));
    bought.delete(id);
    const before = bought.get(`before:${slot}`) ?? (slot === 1 ? 'sidearm' : null);
    bought.delete(`before:${slot}`);
    L.setSlot(slot, before, c, ctx);
    return { ok: true, sold: id };
  }
  // Swapping a gun bought this round refunds it.
  const refund = current && bought.has(current) ? bought.get(current) : 0;
  if ((c.credits ?? 0) + refund < price) return { ok: false, reason: 'credits' };
  if (refund) {
    addCredits(c, refund);
    bought.delete(current);
  } else if (!bought.has(`before:${slot}`)) {
    bought.set(`before:${slot}`, current);
  }
  addCredits(c, -price);
  if (price > 0 || free) bought.set(id, price);
  L.setSlot(slot, id, c, ctx);
  return { ok: true, bought: id };
}

/**
 * A bot team's buy for the round, from its credits: 'pistol' (first round of
 * a half), 'full', 'force' (after a loss, spend it all), 'bonus' (after a
 * win without full money), or 'eco' (save).
 */
export function teamBuy(credits, { pistolRound = false, lostLast = false, wonLast = false, lossStreak = 0, rng = Math.random } = {}) {
  if (pistolRound) return 'pistol';
  const avg = credits.reduce((a, b) => a + b, 0) / Math.max(1, credits.length);
  if (avg >= ECONOMY.fullBuy) return 'full';
  if (wonLast) return 'bonus';
  if (lostLast && avg >= ECONOMY.forceBuy && (lossStreak >= 2 || rng() < 0.45)) return 'force';
  return 'eco';
}

/**
 * What one bot buys this round, given the team's decision. Returns the item
 * ids in the order to buy them (call purchase() for each). `sniper`: this bot
 * is the team's sniper, if it can afford one.
 */
export function botShopping(c, tier, { sniper = false, rng = Math.random } = {}) {
  const credits = c.credits ?? 0;
  const hasPrimary = !!c.loadout?.weapons[0];
  const shield = c.shield ?? 0;
  const list = [];
  let left = credits;
  const take = (id) => {
    list.push(id);
    left -= priceOf(id);
  };
  if (tier === 'pistol') {
    const r = rng();
    if (r < 0.4) take('light');
    else if (r < 0.75) take('lightpistol');
    else take('pistol');
    return list;
  }
  if (tier === 'eco') {
    // Save. Maybe a cheap pistol if there is plenty to spare.
    if (!hasPrimary && left >= 2400 && rng() < 0.4) take('lightpistol');
    return list;
  }
  if (!hasPrimary) {
    if (tier === 'full' && sniper && left >= 4700 + 400) take('sniper');
    else if (tier === 'full' && left >= 2900 + 400) take(rng() < 0.5 ? 'rifle' : 'carbine');
    else {
      // Force or bonus (or a full buy this bot can't afford): the best gun
      // that still leaves room for a light shield.
      const options = ['marksman', 'shotgun', 'smg'].filter((id) => priceOf(id) + 400 <= left);
      if (options.length) take(options[Math.floor(rng() * Math.min(2, options.length))]);
      else if (left >= 1600) take('smg');
    }
  }
  if (shield < 50 && left >= 1000 && (tier === 'full' || left >= 2000)) take('heavy');
  else if (shield < 25 && left >= 400) take('light');
  return list;
}

export { PRIMARIES, SECONDARIES };
