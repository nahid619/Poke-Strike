// Match history and a rank against bots, saved in the browser.
//
// Every finished match is saved (the last 30). Your rank goes up when you win
// and down when you lose, more on harder difficulties, with a little extra
// for a good game (kills minus deaths). Ranks: Bronze, Silver, Gold,
// Platinum, Diamond, and Master, three divisions each, 100 RR per division,
// then Champion at the top. Deathmatch counts half.
import { load, save } from '../core/storage.js';

export const RANK = {
  tiers: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master'],
  perDivision: 100,
  win: 20,
  loss: 15,
  difficulty: { easy: { win: 0.5, loss: 1.3 }, medium: { win: 1, loss: 1 }, hard: { win: 1.4, loss: 0.75 } },
  performance: 5,      // at most this many RR up or down for kills minus deaths
  deathmatch: 0.5,
  keep: 30,            // matches kept in history
};

/** The rank name for an RR total, and how far into the division you are. */
export function rankOf(rr) {
  const top = RANK.tiers.length * 3 * RANK.perDivision;
  if (rr >= top) return { name: 'Champion', into: rr - top, of: null };
  const d = Math.floor(rr / RANK.perDivision);
  return { name: `${RANK.tiers[Math.floor(d / 3)]} ${(d % 3) + 1}`, into: rr % RANK.perDivision, of: RANK.perDivision };
}

/** How much RR a result is worth. */
export function rrChange({ won, draw = false, difficulty = 'medium', mode = 'spike', kills = 0, deaths = 0 }) {
  if (draw) return 0;
  const k = RANK.difficulty[difficulty] ?? RANK.difficulty.medium;
  const perf = Math.max(-RANK.performance, Math.min(RANK.performance, kills - deaths));
  let change = won ? RANK.win * k.win + perf : -RANK.loss * k.loss + perf;
  if (won) change = Math.max(5, change);   // a win always gains something
  else change = Math.min(-3, change);      // and a loss always costs something
  if (mode === 'deathmatch') change *= RANK.deathmatch;
  return Math.round(change);
}

export function currentRank() {
  const rr = load('rankRR', 0);
  return { rr, ...rankOf(rr) };
}

export function matchHistory() {
  return load('history', []);
}

/** Save a finished match; returns the saved entry (with the RR change and new rank). */
export function recordMatch(result) {
  const before = load('rankRR', 0);
  const change = rrChange(result);
  const after = Math.max(0, before + change);
  save('rankRR', after);
  const entry = { ...result, date: Date.now(), rrChange: after - before, rrAfter: after, rank: rankOf(after).name };
  const list = [entry, ...matchHistory()].slice(0, RANK.keep);
  save('history', list);
  return entry;
}
