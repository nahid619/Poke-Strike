// Difficulty levels (build plan section 7). Each level adjusts the bot skill
// values in BOT_SKILL (src/ai/bot.js), plus three extras:
//   abilityUse   chance a bot actually casts when an ability would help
//                (Easy: rarely, Medium: sometimes, Hard: whenever it is smart)
//   teamwork     0 = none, 1 = basic (share sightings, trail, trade nearby),
//                2 = good (also wait for teammates at chokes, trade from farther)
//   damageScale  multiplier on damage the bot deals (Easy enemies hit softer)
import { BOT_SKILL } from './bot.js';

export const DIFFICULTY = {
  easy: {
    label: 'Easy',
    reaction: [0.8, 1.0],
    aimError: 5,
    aimSettle: 1.4,
    turnRate: 200,
    headChance: 0.05,
    burst: [4, 7],
    recoilControl: 0.3,
    strafeChance: 0.2,
    fov: 90,
    viewDistance: 45,
    retreatHealth: 0,
    abilityUse: 0.25,
    teamwork: 0,
    damageScale: 0.7,
  },
  medium: {
    label: 'Medium',
    reaction: [0.5, 0.7],
    aimError: 2.8,
    aimSettle: 0.9,
    turnRate: 300,
    headChance: 0.15,
    burst: [3, 5],
    recoilControl: 0.6,
    strafeChance: 0.5,
    fov: 110,
    viewDistance: 60,
    retreatHealth: 35,
    abilityUse: 0.6,
    teamwork: 1,
    damageScale: 1,
  },
  hard: {
    label: 'Hard',
    reaction: [0.32, 0.45],
    aimError: 2.0,
    aimSettle: 0.65,
    turnRate: 380,
    headChance: 0.25,
    burst: [2, 4],
    recoilControl: 0.75,
    strafeChance: 0.7,
    fov: 120,
    viewDistance: 70,
    retreatHealth: 45,
    abilityUse: 1,
    teamwork: 2,
    damageScale: 1,
  },
};

/** Full skill object for a bot at this level. */
export function skillFor(level) {
  const d = DIFFICULTY[level] ?? DIFFICULTY.medium;
  return { ...BOT_SKILL, ...d };
}
