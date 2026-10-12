// Agent roster. All agent names live in this one file (see README disclaimer).
//
// Each ability has a `type` (the effect it uses, see src/game/abilities.js),
// a cooldown in seconds, and parameters for that effect. New agents can reuse
// any effect type with different numbers.
export const AGENTS = [
  {
    id: 'pikachu',
    name: 'Pikachu',
    role: 'Duelist',
    color: '#f6c90e',
    abilities: {
      q: {
        name: 'Thunder Dash', type: 'dash', cooldown: 10, sound: 'dash',
        speed: 26, duration: 0.2,
        about: 'Dash a short way in the direction you are moving.',
      },
      e: {
        name: 'Thunder Wave', type: 'nova', cooldown: 30, sound: 'zap',
        radius: 8, status: 'stun', statusDuration: 2.5, color: 0xffe14a,
        about: 'Stun enemies within 8 m that you can see for 2.5 s.',
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
        name: 'Flame Burst', type: 'cone', cooldown: 14, sound: 'flame',
        range: 10, angle: 25, damage: 70, color: 0xff7a2a,
        about: 'Blast fire in a cone in front of you for 70 damage.',
      },
      e: {
        name: 'Blaze Trail', type: 'dash', cooldown: 16, sound: 'dash',
        speed: 24, duration: 0.25,
        trail: { radius: 1.0, dps: 40, duration: 4, spacing: 0.8, name: 'Blaze Trail' },
        about: 'Dash forward, leaving fire that burns enemies for 4 s.',
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
        name: 'Dark Fog', type: 'smoke', cooldown: 20, sound: 'smoke',
        range: 30, radius: 4, duration: 14,
        about: 'Throw a smoke cloud where you aim. It blocks vision for 14 s.',
      },
      e: {
        name: 'Shadow Mark', type: 'marker', cooldown: 25, sound: 'mark',
        duration: 20,
        about: 'Mark your spot. Press again within 20 s to teleport back to it.',
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
        name: 'Withdraw', type: 'shield', cooldown: 25, sound: 'shield',
        amount: 50, duration: 10,
        about: 'Gain 50 extra shield for 10 s.',
      },
      e: {
        name: 'Hydro Burst', type: 'nova', cooldown: 20, sound: 'splash',
        radius: 6, damage: 60, minDamage: 30, knockback: 7, color: 0x4fb4ff,
        about: 'A burst of water around you: up to 60 damage and knockback.',
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
        name: 'Teleport', type: 'blink', cooldown: 12, sound: 'teleport',
        distance: 8,
        about: 'Teleport up to 8 m forward. Stops short of walls.',
      },
      e: {
        name: 'Psychic Sight', type: 'nova', cooldown: 30, sound: 'reveal',
        radius: 30, status: 'revealed', statusDuration: 4, throughWalls: true, color: 0xff5ad8,
        about: 'Reveal enemies within 30 m through walls for 4 s.',
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
        name: 'Sing', type: 'nova', cooldown: 35, sound: 'sing',
        radius: 8, status: 'sleep', statusDuration: 3, color: 0xffa6d8,
        about: 'Put enemies within 8 m you can see to sleep for 3 s. Damage wakes them.',
      },
      e: {
        name: 'Rest', type: 'heal', cooldown: 30, sound: 'heal',
        amount: 70, duration: 2.5,
        about: 'Heal 70 health over 2.5 s.',
      },
    },
  },
];

export const agentById = (id) => AGENTS.find((a) => a.id === id) ?? AGENTS[0];
