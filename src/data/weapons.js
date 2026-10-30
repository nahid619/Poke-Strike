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
//          magnification (zoomLevels: right click again for the next level,
//          like the Operator's 2.5x then 5x), time the seconds to zoom in,
//          unscopeOnFire kicks you out of the scope after each shot, and the multipliers
//          apply while fully zoomed. `spread` replaces the hip-fire values
//          while zoomed (blended during the zoom). scope 'sight' keeps the gun
//          on screen; 'sniper' shows a full scope overlay.
// moveMult: running speed multiplier while holding this weapon.
export const WEAPONS = {
  rifle: {
    id: 'rifle',
    name: 'Rifle',
    slot: 'primary',
    price: 2900,
    about: 'Automatic. One-shot headshots at any range. Right click: zoom 1.25x.',
    mode: 'auto',
    rpm: 585,
    magSize: 25,
    reserve: 75,
    reloadTime: 2.5,
    equipTime: 0.75,
    moveMult: 1,
    damage: { head: 160, body: 40, legs: 34 },
    falloff: [], // full damage at every range
    spread: { base: 0.25, run: 5.0, air: 10, perShot: 0.24, firstAccurateShots: 2, maxSpray: 2.8 },
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
      // Vandal: 1.25x, first shot 0.25 -> 0.157 degrees, 9.75 -> 8.775 rounds a second.
      zoom: 1.25, time: 0.16, scope: 'sight',
      spreadMult: 0.628, recoilMult: 0.85, fireRateMult: 0.9, moveMult: 0.76,
    },
    viewKick: 0.03,
  },

  sniper: {
    id: 'sniper',
    name: 'Sniper',
    slot: 'primary',
    price: 4700,
    about: 'Bolt action. One-shot body shots. Right click: 2.5x, again for 5x.',
    mode: 'semi',
    rpm: 36, // 0.6 a second from the hip; 0.75 scoped (fireRateMult below)
    magSize: 5,
    reserve: 10,
    reloadTime: 3.7,
    equipTime: 1.3,
    moveMult: 0.76, // 5.13 m/s running, like the Operator
    damage: { head: 255, body: 150, legs: 120 }, // a body shot kills through full shield; legs don't
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
      // Operator: right click for 2.5x, again for 5x, again to zoom out.
      // You stay scoped between shots (set unscopeOnFire: true to be kicked
      // out after each shot, as in Valorant).
      zoom: 2.5, zoomLevels: [2.5, 5], time: 0.22, scope: 'sniper', requireFull: true, unscopeOnFire: false,
      spread: { base: 0, run: 9, air: 14, perShot: 0, firstAccurateShots: 1, maxSpray: 0 },
      recoilMult: 1, fireRateMult: 1.25, moveMult: 0.72,
    },
    chamberTime: 1.0, // bolt animation after each shot
    viewKick: 0.09,
  },

  pistol: {
    id: 'pistol',
    name: 'Hand Cannon',
    slot: 'secondary',
    price: 800,
    about: 'Six heavy shots. One-shot headshots through full shield up close.',
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

// ---- the rest of the arsenal (see the buy menu: B) ----
// Recoil and spread use the same units as above. `pellets` fires several
// rays per shot (the shotgun); their damage adds up per target.
const sidearmRecoil = (v) => ({ vertical: [v], jitter: 0.25, maxPitch: 5, maxYaw: 1.8, recover: 11, view: 0.3, punch: 0.35 });

Object.assign(WEAPONS, {
  sidearm: {
    id: 'sidearm', name: 'Sidearm', slot: 'secondary', price: 0, mode: 'semi',
    about: 'Free. Light and quick. Everyone has one.',
    rpm: 405, magSize: 12, reserve: 36, reloadTime: 1.75, equipTime: 0.4, moveMult: 1,
    damage: { head: 78, body: 26, legs: 22 }, falloff: [{ from: 30, mult: 0.85 }],
    spread: { base: 0.4, run: 1.5, air: 5, perShot: 0.5, firstAccurateShots: 1, maxSpray: 2.4 },
    recoil: sidearmRecoil(0.6), ads: null, viewKick: 0.04,
  },
  lightpistol: {
    id: 'lightpistol', name: 'Light Pistol', slot: 'secondary', price: 500, mode: 'semi', suppressed: true,
    about: 'Silenced, accurate, 15 rounds. Two headshots kill through shield.',
    rpm: 405, magSize: 15, reserve: 45, reloadTime: 1.5, equipTime: 0.4, moveMult: 1,
    damage: { head: 105, body: 30, legs: 26 }, falloff: [{ from: 30, mult: 0.85 }],
    spread: { base: 0.3, run: 2.0, air: 6, perShot: 0.45, firstAccurateShots: 1, maxSpray: 2.2 },
    recoil: sidearmRecoil(0.7), ads: null, viewKick: 0.045,
  },
  smg: {
    id: 'smg', name: 'SMG', slot: 'primary', price: 1600, mode: 'auto',
    about: 'Very fast fire, accurate on the move. Weak at long range.',
    rpm: 800, magSize: 30, reserve: 90, reloadTime: 2.25, equipTime: 0.75, moveMult: 1,
    damage: { head: 78, body: 26, legs: 22 }, falloff: [{ from: 20, mult: 0.85 }],
    spread: { base: 0.4, run: 1.4, air: 6, perShot: 0.2, firstAccurateShots: 1, maxSpray: 2.6 },
    recoil: {
      vertical: [0.1, 0.18, 0.28, 0.36, 0.42, 0.45, 0.42, 0.38, 0.34], jitter: 0.12,
      swayStart: 8, swayAmount: 0.35, swayPeriod: 4, maxPitch: 5, maxYaw: 2.5, recover: 9, view: 0.18, punch: 0.08,
    },
    ads: { zoom: 1.15, time: 0.14, scope: 'sight', spreadMult: 0.85, recoilMult: 0.9, fireRateMult: 0.9, moveMult: 0.8 },
    viewKick: 0.02,
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', slot: 'primary', price: 1850, mode: 'auto',
    about: 'Automatic, 12 pellets a shot. Kills up close, useless far away.',
    rpm: 210, magSize: 7, reserve: 21, reloadTime: 2.2, equipTime: 0.9, moveMult: 1,
    pellets: 12, pelletSpread: 3.6, // degrees: the cone the pellets spread over
    damage: { head: 34, body: 17, legs: 14 }, // per pellet
    falloff: [{ from: 10, mult: 0.7 }, { from: 15, mult: 0.45 }],
    spread: { base: 0, run: 3, air: 6, perShot: 1.0, firstAccurateShots: 1, maxSpray: 3 },
    recoil: { vertical: [2.0, 2.4], jitter: 0.5, maxPitch: 7, maxYaw: 2, recover: 7, view: 0.3, punch: 0.9 },
    ads: null, viewKick: 0.08,
  },
  marksman: {
    id: 'marksman', name: 'Marksman', slot: 'primary', price: 2250, mode: 'semi',
    about: 'Semi-automatic and very accurate. One-shot headshots. Right click: zoom 1.5x.',
    rpm: 286, magSize: 12, reserve: 36, reloadTime: 2.5, equipTime: 0.75, moveMult: 0.95,
    damage: { head: 195, body: 65, legs: 49 }, falloff: [],
    spread: { base: 0.1, run: 5, air: 10, perShot: 0, firstAccurateShots: 1, maxSpray: 0 },
    recoil: { vertical: [1.1], jitter: 0.15, maxPitch: 4, maxYaw: 1, recover: 9, view: 0.2, punch: 0.4 },
    ads: { zoom: 1.5, time: 0.18, scope: 'sight', spreadMult: 0.5, recoilMult: 0.8, fireRateMult: 0.95, moveMult: 0.76 },
    viewKick: 0.05,
  },
  carbine: {
    id: 'carbine', name: 'Carbine', slot: 'primary', price: 2900, mode: 'auto', suppressed: true,
    about: 'Silenced, faster, steadier spray. One-shot headshots up close; damage drops with range.',
    rpm: 660, magSize: 30, reserve: 90, reloadTime: 2.5, equipTime: 0.75, moveMult: 1,
    damage: { head: 156, body: 39, legs: 33 }, falloff: [{ from: 15, mult: 0.9 }, { from: 30, mult: 0.8 }],
    spread: { base: 0.2, run: 5.0, air: 10, perShot: 0.22, firstAccurateShots: 3, maxSpray: 2.6 },
    recoil: {
      vertical: [0.12, 0.28, 0.5, 0.7, 0.8, 0.8, 0.7, 0.55, 0.45, 0.35, 0.28], jitter: 0.08,
      swayStart: 10, swayAmount: 0.45, swayPeriod: 4, maxPitch: 6.5, maxYaw: 2.6, recover: 8, view: 0.18, punch: 0.1,
    },
    ads: { zoom: 1.25, time: 0.16, scope: 'sight', spreadMult: 0.6, recoilMult: 0.85, fireRateMult: 0.9, moveMult: 0.76 },
    viewKick: 0.025,
  },
});

/** Primary weapons, in buy menu order. */
export const PRIMARIES = ['smg', 'shotgun', 'marksman', 'carbine', 'rifle', 'sniper'];
/** Sidearms (slot 2), in buy menu order. The sidearm is free. */
export const SECONDARIES = ['sidearm', 'lightpistol', 'pistol'];

/** Slot 1 = primary, slot 2 = secondary. */
export const DEFAULT_LOADOUT = ['rifle', 'pistol'];

export const loadoutWith = (primary) => [PRIMARIES.includes(primary) ? primary : 'rifle', 'pistol'];
