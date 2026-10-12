# Poké Strike

A single-player, Valorant-style tactical shooter that runs in the browser. You and four bot
teammates play 5v5 against bots: plant and defuse the spike, or play elimination rounds, on
three maps with six agents who each have two abilities. When you die you can take over a living
teammate. There's also an aim trainer and a test range.

Built with Three.js and Vite. No server: the whole game is static files.

**New here? [SETUP.md](SETUP.md) walks you through installing, running, and putting the game
online with Vercel, step by step.**

## Disclaimer

This is an unofficial, non-commercial fan project. It is not affiliated with, endorsed by, or
connected to Nintendo, Game Freak, Creatures Inc., or The Pokémon Company. Pokémon and all related
character and move names are trademarks of their respective owners. No official artwork, models,
sounds, or other game assets are used; all characters are simple geometric shapes.

The MIT license below covers this project's original source code only. It does not grant any
rights to third-party names or trademarks. All agent names live in `src/data/agents.js` so they
can be changed in one place.

## Quick start

Requires Node.js 18 or newer (20 or 22 recommended).

```
npm install
npm run dev
```

Open http://localhost:5173 in Chrome, Edge, or Brave. Or just double-click
`PokeStrike-offline.html` from the release to play without installing anything.

## What's in the game

**Modes**
- **Match: plant and defuse** (default). One team attacks and one defends; sides swap at
  halftime. Attackers carry the spike and plant it on site A or B; defenders defuse it. First to
  3, 5, or 7 rounds.
- **Match: elimination.** Win a round by eliminating the other team.
- **Aim trainer.** Four 30-second drills (Static, Moving, Flick, Tracking) with saved best scores.
- **Test range.** Try every agent and weapon on targets that respawn, with short cooldowns.

**Maps**
- **Crossroads:** three even lanes split by long walls.
- **Plaza:** a wide open middle with long sightlines and tall pillars.
- **Foundry:** tight corridors, enclosed site rooms, and tall cover.

**Agents** (two abilities each, on Q and E)

| Agent | Role | Q | E |
|---|---|---|---|
| Pikachu | Duelist | Thunder Dash | Flash Bolt (thrown flash, 2 charges) |
| Charizard | Duelist | Ember (lobbed fire patch) | Blaze Trail (dash with fire) |
| Gengar | Controller | Dark Fog (smoke at range, 2 charges) | Shadow Mark (teleport back) |
| Blastoise | Sentinel | Bubble Trap (slows and reveals, 2 at once) | Protect (team shield) |
| Alakazam | Initiator | Confusion (thrown stun) | Future Sight (recon eye) |
| Jigglypuff | Support | Sing (thrown sleep) | Wish (team heal) |

Thrown abilities fly where you aim and arc with gravity, so you can lob them over cover. Flashes
only blind enemies who are looking at them; turn away to dodge one.

**Weapons** (pick your primary with **B** in the buy phase):
- **Rifle** (plays like the Vandal): automatic, one-shot headshots, no damage falloff.
  Right click zooms 1.25x for a tighter first shot.
- **Sniper** (plays like the Operator): bolt action, one-shot body shots. Right click scopes
  2.5x, right click again for 5x, and once more to zoom out. You stay scoped between shots.
  Pin-point only when fully scoped and standing still; it slows you down and fires a little
  faster scoped (0.75 a second) than from the hip (0.6). Leg shots do 120, so they don't kill.
- **Pistol** (plays like the Sheriff): semi-automatic, one-shot headshots up close.

Gunplay follows Valorant: the camera barely moves when you spray, so bullets climb above a
crosshair that stays put and you pull down to control them. Running ruins accuracy;
counter-strafe (tap the opposite key) to stop instantly. Crouching (C) steadies your spray.

## Controls

| Key | Action |
|---|---|
| W A S D | Move |
| Space | Jump |
| C (hold) | Crouch (not Ctrl: Ctrl + W closes the browser tab and can't be blocked) |
| Shift (hold) | Walk quietly (bots can't hear you) |
| Left click | Shoot |
| Right click | Rifle: zoom 1.25x. Sniper: 2.5x, then 5x, then out. Hold mode in Settings |
| B | Buy menu: rifle or sniper (pre-round, or any time in the test range) |
| R | Reload |
| 1 / 2, mouse wheel | Primary / pistol |
| Q / E | Agent abilities |
| F (hold) | Plant or defuse the spike |
| Tab (hold) | Scoreboard, in a match |
| Left click while dead | Pick which teammate to take over |
| Esc | Pause and settings |
| F3 | Debug view (frame rate, bot states and paths, collision boxes) |

## Settings

Open **Settings** from the title screen or the pause menu: mouse sensitivity (same scale as
Valorant) and raw input, field of view, graphics quality, volume, frame rate counter, a full
crosshair editor with live preview and presets (the default is a still dot; movement and
firing error are separate switches, both off), scoped sensitivity and toggle-or-hold zoom, what happens when you die (take over a teammate, or
spectate), and testing options.

Settings are saved in your browser (localStorage), so they stay on that browser and that web
address. To move them, use **Copy my code** in Settings and paste the code on the other browser.
See [Where your settings are saved](SETUP.md#where-your-settings-are-saved).

## How the bots play

Every bot has a role from its agent's class. Duelists are **entries** who lead the push,
sentinels are **anchors** who hold their half and rotate to help, and everyone else is a
**support** who trails an entry and trades kills.

Bots see only what is in range, in their field of view, and not blocked by walls or smoke. They
hear running, gunshots, and abilities, but not walking. When one bot spots you, its team knows
where you were, and your teammates call out enemies they see. Bots use their abilities when it
helps: stuns and sleeps on nearby enemies, smokes before pushing, reveals before entering, heals
when safe, and dashes or teleports to escape.

In plant and defuse, attackers pick a site, group up out of its sight, and go in together while
checking the spots defenders usually hold; the carrier plants, the others guard the spike.
Defenders split across both sites and mid, take their own lane, rotate when two or more attackers
are seen elsewhere, and retake and defuse once the spike is down.

Enemy difficulty is Easy, Medium, or Hard. Your teammates always play at Medium.

| | Easy | Medium | Hard |
|---|---|---|---|
| Reaction | 0.8 to 1.0 s | 0.5 to 0.7 s | 0.3 to 0.45 s |
| Aim error | 5 degrees | 2.8 degrees | 2 degrees |
| Headshot chance | 5% | 15% | 25% |
| Ability use | Rarely | Sometimes | Whenever useful |
| Teamwork | None | Share sightings, trail, trade | Also wait at chokes |
| Damage dealt | 70% | 100% | 100% |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Rules tests (movement, weapons, abilities, spike, navigation, settings codes) and map checks |
| `npm run test:maps` | Map checks only |
| `npm run build` | Production build in `dist/` (what Vercel deploys) |
| `npm run build:offline` | Single offline HTML file in `dist-offline/index.html` |
| `npm run preview` | Preview the production build |

## Project structure

```
src/
  main.js             boot, modes, screen state, the fixed-timestep game loop
  core/               input, physics and raycasts, sound, settings, storage, debug view
  game/               characters, weapons, abilities, status effects, zones, the spike,
                      viewmodel, effects, and the Session base class shared by every mode
  ai/                 bot brain (bot.js), ability use, senses, difficulty, A* navigation
  modes/              match (5v5), aim trainer, test range
  data/               agents, weapons, maps (and mapkit.js, the map format and helpers)
  ui/                 HUD, menus and settings screens, styles
tests/                rules tests and map checks
```

## Tuning

| What | Where |
|---|---|
| Movement (speed, jump, friction) | `MOVE` in `src/game/character.js` |
| Hitbox sizes, status effect rules | `HITBOX`, `STATUS` in `src/game/character.js` |
| Weapons (damage, fire rate, spread, recoil, zoom) | `src/data/weapons.js` |
| How much recoil moves the camera | `recoil.view` and `recoil.punch` in `src/data/weapons.js` |
| Crouch height and speed | `CROUCH`, `MOVE.crouchSpeed` in `src/game/character.js` |
| Thrown abilities, traps, recon | `src/game/zones.js` (flight), `PAYLOADS` in `src/game/abilities.js` |
| Agents and abilities (cooldowns, damage, radius, duration) | `src/data/agents.js` |
| Spike (plant, defuse, fuse, barrier) | `SPIKE` in `src/game/spike.js` |
| Round and takeover timings | `MATCH_TIMES`, `TAKEOVER` in `src/modes/match.js` |
| Difficulty levels | `DIFFICULTY` in `src/ai/difficulty.js` |
| When bots use abilities | `src/ai/botabilities.js` |
| How far bots hear things | `NOISE` in `src/ai/senses.js` |
| Aim trainer drills and scoring | `src/modes/aimtrainer.js` |
| Graphics quality levels | `QUALITY` in `src/core/settings.js` |

## Adding a map

The map format is documented at the top of `src/data/maps/mapkit.js`. Write the south half of the
map with `pair(...)` for boxes and `mirroredNav(...)` for bot waypoints, and the kit mirrors it to
the north half so both teams get the same layout. Add the map to `src/data/maps/index.js`, then run
`npm run test:maps`. It checks every waypoint is standable and reachable, every link is walkable,
lane routes are continuous, both halves have hold spots, each team has five spawns, both sites
exist, and the layout is exactly point-symmetric. `src/data/maps/map2.js` (Plaza) is a compact
example.

## Notes

- **Side balance.** In bot-only plant-and-defuse games, defense wins about two rounds in three.
  Teams swap sides at halftime, so matches stay even, and a human attacker shifts it a lot.
- **Dependencies.** `npm audit` reports one issue in `braces`, a dependency of the offline-build
  plugin. No fixed version exists yet, and it can only be triggered by malicious build patterns,
  never by players, so the game and its build are unaffected.
- **Development history.** `build-plan.md` is the original plan, with every phase checked off.

## License

MIT. See `LICENSE`. Copyright (c) 2026 Nahid Hasan (nahid619).
