// Weapon data. Angles are in degrees, times in seconds, damage in HP.
// Numbers are tuned to feel like Valorant's guns: the Rifle plays like the
// Vandal, the Sniper like the Operator, and the Pistol like the Sheriff.
//
// spread:  base       cone half-angle when standing still
//          run        extra at full running speed (scales with speed)
//          air        extra while airborne
//          perShot    extra per bullet in a spray (after the accurate first shots)
//          maxSpray   cap on the spray part
// recoil:  vertical   upward kick per bullet, by bullet number (last value repeats)
//          jitter     random sideways kick per bullet
//          sway*      after swayStart bullets, the spray drifts left and right
//          recover    how fast the spray settles after you stop firing
//          view       how much of the spray moves your camera (0..1). Like
//                     Valorant, the camera barely moves: bullets climb above
//                     the crosshair and you pull down to control them.
//          punch      camera-only kick per shot (degrees), springs back fast
// ads:     right click aims down sights (or scopes). zoom is the
//          magnification, time the seconds to zoom in, and the multipliers
//          apply while fully zoomed. `spread` replaces the hip-fire values
//          while zoomed (blended during the zoom). scope 'sight' keeps the gun
//          on screen; 'sniper' shows a full scope overlay.
// moveMult: running speed multiplier while holding this weapon.
export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    slot: 'primary',
    mode: 'auto',
    rpm: 585,
    magSize: 25,
    reserve: 75,
    reloadTime: 2.5,
    equipTime: 0.75,
    moveMult: 1,
    damage: { head: 160, body: 40, legs: 34 },
    falloff: [], // full damage at every range
    spread: { base: 0.2, run: 5.0, air: 10, perShot: 0.24, firstAccurateShots: 2, maxSpray: 2.8 },
    recoil: {
      vertical: [0.15, 0.35, 0.65, 0.9, 1.0, 1.0, 0.85, 0.7, 0.5, 0.4, 0.3],
      jitter: 0.1,
      swayStart: 9,
      swayAmount: 0.55,
      swayPeriod: 4,
      maxPitch: 7,
      maxYaw: 3,
      recover: 8,
      view: 0.18,
      punch: 0.12,
    },
    ads: {
      zoom: 1.25, time: 0.16, scope: 'sight',
      spreadMult: 0.75, recoilMult: 0.85, fireRateMult: 0.9, moveMult: 0.76,
    },
    viewKick: 0.03,
  },

  sniper: {
    id: 'sniper',
    name: 'Sniper',
    slot: 'primary',
    mode: 'semi',
    rpm: 45,
    magSize: 5,
    reserve: 10,
    reloadTime: 3.7,
    equipTime: 1.3,
    moveMult: 0.88,
    damage: { head: 255, body: 150, legs: 127 }, // a body shot kills through full shield
    falloff: [],
    // Hip fire is a gamble; scoped and standing still it is pin-point.
    spread: { base: 4.5, run: 8, air: 14, perShot: 0, firstAccurateShots: 1, maxSpray: 0 },
    recoil: {
      vertical: [3.5],
      jitter: 0.4,
      maxPitch: 5,
      maxYaw: 1.5,
      recover: 6,
      view: 0.25,
      punch: 2.2,
    },
    ads: {
      zoom: 2.5, time: 0.22, scope: 'sniper', requireFull: true,
      spread: { base: 0, run: 9, air: 14, perShot: 0, firstAccurateShots: 1, maxSpray: 0 },
      recoilMult: 1, fireRateMult: 1, moveMult: 0.76,
    },
    chamberTime: 1.0, // bolt animation after each shot
    viewKick: 0.09,
  },

  pistol: {
    id: 'pistol',
    name: 'Pistol',
    slot: 'secondary',
    mode: 'semi',
    rpm: 300,
    magSize: 8,
    reserve: 24,
    reloadTime: 1.9,
    equipTime: 0.4,
    moveMult: 1,
    damage: { head: 150, body: 45, legs: 38 }, // 150 = one-tap through full shield
    falloff: [{ from: 25, mult: 0.8 }],
    spread: { base: 0.3, run: 2.5, air: 6, perShot: 0.6, firstAccurateShots: 1, maxSpray: 2.4 },
    recoil: {
      vertical: [1.2],
      jitter: 0.3,
      maxPitch: 6,
      maxYaw: 2,
      recover: 10,
      view: 0.3,
      punch: 0.5,
    },
    ads: null, // no zoom on the pistol
    viewKick: 0.06,
  },
};

/** Primary weapons you can pick in the buy menu, in menu order. */
export const PRIMARIES = ['rifle', 'sniper'];

/** Slot 1 = primary, slot 2 = secondary. */
export const DEFAULT_LOADOUT = ['rifle', 'pistol'];

export const loadoutWith = (primary) => [PRIMARIES.includes(primary) ? primary : 'rifle', 'pistol'];
