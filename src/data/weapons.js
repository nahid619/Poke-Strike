// Weapon data. Angles are in degrees, times in seconds, damage in HP.
//
// spread:  base       cone half-angle when standing still
//          run        extra at full running speed (scales with speed)
//          air        extra while airborne
//          perShot    extra per bullet in a spray (after the accurate first shots)
//          maxSpray   cap on the spray part
// recoil:  vertical   upward kick per bullet, by bullet number (last value repeats)
//          jitter     random sideways kick per bullet
//          sway*      after swayStart bullets, the spray drifts left and right
//          recover    how fast the view settles after you stop firing
export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    mode: 'auto',
    rpm: 600,
    magSize: 25,
    reserve: 75,
    reloadTime: 2.4,
    equipTime: 0.6,
    damage: { head: 160, body: 40, legs: 34 },
    falloff: [], // full damage at every range
    spread: { base: 0.2, run: 4.0, air: 10, perShot: 0.22, firstAccurateShots: 3, maxSpray: 2.6 },
    recoil: {
      vertical: [0.2, 0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.8, 0.6, 0.45, 0.35],
      jitter: 0.12,
      swayStart: 9,
      swayAmount: 0.55,
      swayPeriod: 4,
      maxPitch: 7,
      maxYaw: 3,
      recover: 9,
    },
    viewKick: 0.035,
  },

  pistol: {
    id: 'pistol',
    name: 'Pistol',
    mode: 'semi',
    rpm: 300,
    magSize: 8,
    reserve: 24,
    reloadTime: 1.9,
    equipTime: 0.4,
    damage: { head: 150, body: 45, legs: 38 }, // 150 = one-tap through full shield
    falloff: [{ from: 25, mult: 0.8 }],
    spread: { base: 0.3, run: 2.0, air: 6, perShot: 0.6, firstAccurateShots: 1, maxSpray: 2.4 },
    recoil: {
      vertical: [1.2],
      jitter: 0.3,
      maxPitch: 6,
      maxYaw: 2,
      recover: 10,
    },
    viewKick: 0.06,
  },
};

/** Slot 1 = primary, slot 2 = secondary. */
export const DEFAULT_LOADOUT = ['rifle', 'pistol'];
