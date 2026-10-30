// Agent roster. All agent names live in this one file (see README disclaimer).
//
// Each ability has a `type` (the effect it uses, see src/game/abilities.js),
// a cooldown in seconds, and parameters for that effect. New agents can reuse
// any effect type with different numbers.
//
// `charges`: how many uses you can hold. Each one recharges on the cooldown.
//
// Thrown abilities (`type: 'throw'`) fly where you aim and set off a
// `payload` when they hit something or their fuse runs out:
//   flash    blinds enemies who are looking at it
//   fire     a burning patch on the floor (area denial)
//   concuss  stuns enemies nearby (slow, shaky aim, no abilities)
//   sleep    puts enemies nearby to sleep (damage wakes them)
//   recon    sticks where it lands and reveals enemies it can see
export const AGENTS = [
  {
    id: 'pikachu',
    name: 'Pikachu',
    role: 'Duelist',
    color: '#f6c90e',
    abilities: {
      q: {
        name: 'Thunder Dash', type: 'dash', cooldown: 12, sound: 'dash',
        speed: 26, duration: 0.2,
        about: 'Dash a short way in the direction you are moving. Great for taking or escaping a fight.',
      },
      e: {
        name: 'Flash Bolt', type: 'throw', cooldown: 18, charges: 2, sound: 'throw',
        speed: 32, gravity: 0, fuse: 0.42, color: 0xfff3a0,
        payload: { kind: 'flash', duration: 1.75, range: 40 },
        about: 'Throw a bolt of light that pops after a moment. Enemies looking at it are blinded for up to 1.75 s. 2 charges.',
      },
      x: {
        name: 'Thunder', type: 'throw', ult: 7, sound: 'throw',
        speed: 34, gravity: 0, fuse: 0.55, color: 0xfff36a,
        payload: { kind: 'concuss', radius: 9, duration: 3.5 },
        about: 'Ultimate. Call down a lightning strike where you aim: every enemy within 9 m is stunned for 3.5 s.',
      },
    },
  },
  {
    id: 'charizard',
    name: 'Charizard',
    role: 'Duelist',
    color: '#f07b2f',
    abilities: {
      q: {
        name: 'Ember', type: 'throw', cooldown: 22, sound: 'throw',
        speed: 19, gravity: 16, fuse: 2.2, bounce: true, color: 0xff7a2a,
        payload: { kind: 'fire', radius: 3.2, dps: 55, duration: 5 },
        about: 'Lob a fireball that bursts into flames where it lands: 55 damage a second for 5 s. Clears corners and stops defuses.',
      },
      e: {
        name: 'Blaze Trail', type: 'dash', cooldown: 16, sound: 'dash',
        speed: 24, duration: 0.25,
        trail: { radius: 1.0, dps: 40, duration: 4, spacing: 0.8, name: 'Blaze Trail' },
        about: 'Dash forward, leaving fire that burns enemies for 4 s.',
      },
      x: {
        name: 'Inferno', type: 'throw', ult: 7, sound: 'throw',
        speed: 22, gravity: 14, fuse: 2.0, bounce: true, color: 0xff4a1a,
        payload: { kind: 'fire', radius: 6.5, dps: 70, duration: 7 },
        about: 'Ultimate. A huge firestorm where it lands: 70 damage a second over 6.5 m for 7 s.',
      },
    },
  },
  {
    id: 'gengar',
    name: 'Gengar',
    role: 'Controller',
    color: '#7b5cc4',
    abilities: {
      q: {
        name: 'Dark Fog', type: 'smoke', cooldown: 22, charges: 2, sound: 'smoke',
        range: 40, radius: 4.5, duration: 15,
        about: 'Drop a smoke cloud where you aim, up to 40 m away. It blocks vision for 15 s. 2 charges.',
      },
      e: {
        name: 'Shadow Mark', type: 'marker', cooldown: 20, sound: 'mark',
        duration: 20,
        about: 'Mark your spot. Press again within 20 s to teleport back to it.',
      },
      x: {
        name: 'Night Shade', type: 'smoke', ult: 6, sound: 'smoke',
        range: 50, radius: 9, duration: 20,
        about: 'Ultimate. A giant cloud of shadow, 18 m across, that blocks a whole site for 20 s.',
      },
    },
  },
  {
    id: 'blastoise',
    name: 'Blastoise',
    role: 'Sentinel',
    color: '#3d7fc4',
    abilities: {
      q: {
        name: 'Bubble Trap', type: 'trap', cooldown: 25, charges: 2, sound: 'trap',
        range: 14, radius: 2.2, armTime: 1, maxActive: 2, color: 0x4fb4ff,
        slow: 0.45, slowDuration: 4, revealDuration: 5,
        about: 'Place a trap on the floor where you aim. An enemy who walks over it is slowed for 4 s and revealed to your team. Up to 2 at once.',
      },
      e: {
        name: 'Protect', type: 'aura', cooldown: 35, sound: 'shield',
        radius: 10, shield: 50, shieldDuration: 15, color: 0x9fd8ff,
        about: 'You and teammates within 10 m gain 50 extra shield for 15 s.',
      },
      x: {
        name: 'Shell Fortress', type: 'aura', ult: 7, sound: 'shield',
        radius: 16, shield: 100, shieldDuration: 20, color: 0x9fd8ff,
        about: 'Ultimate. You and teammates within 16 m gain 100 extra shield for 20 s.',
      },
    },
  },
  {
    id: 'alakazam',
    name: 'Alakazam',
    role: 'Initiator',
    color: '#d9a441',
    abilities: {
      q: {
        name: 'Confusion', type: 'throw', cooldown: 22, sound: 'throw',
        speed: 26, gravity: 9, fuse: 1.2, color: 0xffd34d,
        payload: { kind: 'concuss', radius: 5, duration: 3 },
        about: 'Throw a psychic orb. Where it bursts, enemies within 5 m are stunned for 3 s: slow, shaky aim, no abilities.',
      },
      e: {
        name: 'Future Sight', type: 'throw', cooldown: 30, sound: 'throw',
        speed: 30, gravity: 7, fuse: 2.5, stick: true, color: 0xff5ad8,
        payload: { kind: 'recon', radius: 30, pulses: 2, interval: 1.4, reveal: 3 },
        about: 'Throw an eye that sticks where it lands and pulses twice, revealing every enemy it can see within 30 m.',
      },
      x: {
        name: 'Psychic Sight', type: 'throw', ult: 7, sound: 'throw',
        speed: 30, gravity: 7, fuse: 1.0, stick: true, color: 0xff5ad8,
        payload: { kind: 'recon', radius: 70, pulses: 3, interval: 1.5, reveal: 4 },
        about: 'Ultimate. A great eye that pulses three times, revealing every enemy it can see within 70 m.',
      },
    },
  },
  {
    id: 'jigglypuff',
    name: 'Jigglypuff',
    role: 'Support',
    color: '#f29bc0',
    abilities: {
      q: {
        name: 'Sing', type: 'throw', cooldown: 30, sound: 'throw',
        speed: 22, gravity: 9, fuse: 1.3, color: 0xffa6d8,
        payload: { kind: 'sleep', radius: 5.5, duration: 3 },
        about: 'Throw a song bubble. Where it bursts, enemies within 5.5 m fall asleep for 3 s. Damage wakes them.',
      },
      e: {
        name: 'Wish', type: 'aura', cooldown: 30, sound: 'heal',
        radius: 10, heal: 60, healDuration: 3, color: 0x5ee08a,
        about: 'Heal yourself and teammates within 10 m for 60 health over 3 s.',
      },
      x: {
        name: 'Lullaby', type: 'throw', ult: 7, sound: 'throw',
        speed: 22, gravity: 9, fuse: 1.3, color: 0xffa6d8,
        payload: { kind: 'sleep', radius: 11, duration: 4 },
        about: 'Ultimate. A giant song bubble: every enemy within 11 m falls asleep for 4 s.',
      },
    },
  },
  {
    id: 'lucario',
    name: 'Lucario',
    role: 'Duelist',
    color: '#4f7fd6',
    abilities: {
      q: {
        name: 'Extreme Speed', type: 'dash', cooldown: 14, charges: 2, sound: 'dash',
        speed: 30, duration: 0.18,
        about: 'A very fast, short dash in the direction you are moving. 2 charges.',
      },
      e: {
        name: 'Aura Sphere', type: 'throw', cooldown: 20, sound: 'throw',
        speed: 34, gravity: 0, fuse: 0.6, color: 0x7fb2ff,
        payload: { kind: 'concuss', radius: 3.5, duration: 2 },
        about: 'A fast sphere that bursts after a moment: enemies within 3.5 m are stunned for 2 s.',
      },
      x: {
        name: 'Steel Will', type: 'aura', ult: 6, sound: 'shield',
        radius: 3, shield: 75, shieldDuration: 15, heal: 50, healDuration: 2, color: 0x9fc4ff,
        about: 'Ultimate. Heal 50 and gain 75 extra shield for 15 s (teammates right next to you too).',
      },
    },
  },
  {
    id: 'mewtwo',
    name: 'Mewtwo',
    role: 'Initiator',
    color: '#a58ad6',
    abilities: {
      q: {
        name: 'Psywave', type: 'throw', cooldown: 24, sound: 'throw',
        speed: 34, gravity: 4, fuse: 0.9, stick: true, color: 0xd08aff,
        payload: { kind: 'recon', radius: 22, pulses: 1, interval: 1, reveal: 3 },
        about: 'A quick scan where it lands: reveals enemies it can see within 22 m, once.',
      },
      e: {
        name: 'Barrier', type: 'smoke', cooldown: 20, charges: 2, sound: 'smoke',
        range: 25, radius: 3, duration: 10,
        about: 'A small psychic cloud up to 25 m away that blocks vision for 10 s. 2 charges.',
      },
      x: {
        name: 'Psystrike', type: 'throw', ult: 7, sound: 'throw',
        speed: 28, gravity: 6, fuse: 1.1, color: 0xc06aff,
        payload: { kind: 'concuss', radius: 12, duration: 3 },
        about: 'Ultimate. A psychic blast where it lands: every enemy within 12 m is stunned for 3 s.',
      },
    },
  },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
