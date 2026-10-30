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
sounds, or other game assets are used; all characters are simple geometric figures built in code.

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

**Maps** (each with its own lighting mood, and high ground reached by stairs)
- **Crossroads:** three even lanes split by long walls, with a Heaven platform over each site.
  Clear midday light.
- **Plaza:** a wide open middle with long sightlines and tall pillars, and balconies along both
  sides for high ground over mid. Golden late-afternoon light and long shadows.
- **Foundry:** tight corridors, enclosed site rooms, and tall cover, with a raised deck on each
  site facing the doorway from mid. Overcast, hazy, industrial light.

Textures are drawn in code (concrete floor tiles, block walls, metal panels, wood crates, and
diamond-plate platforms), walls are shaded where they meet the floor, and each map has its own
sky. Bots climb the stairs, hold the high ground, and attackers check it on the way in.

**Agents** (two abilities on Q and E, and an ultimate on X)

| Agent | Role | Q | E | X (ultimate) |
|---|---|---|---|---|
| Pikachu | Duelist | Thunder Dash (dash) | Flash Bolt (flash, 2 charges) | Thunder (huge stun, 7 points) |
| Charizard | Duelist | Ember (thrown fire) | Blaze Trail (dash leaving fire) | Inferno (huge firestorm, 7) |
| Lucario | Duelist | Extreme Speed (fast dash, 2 charges) | Aura Sphere (small stun) | Steel Will (heal and 75 shield, 6) |
| Gengar | Controller | Dark Fog (smoke, 2 charges) | Shadow Mark (teleport back) | Night Shade (giant smoke, 6) |
| Blastoise | Sentinel | Bubble Trap (slow and reveal) | Protect (team shield) | Shell Fortress (100 shield for the team, 7) |
| Alakazam | Initiator | Confusion (thrown stun) | Future Sight (recon) | Psychic Sight (map-wide recon, 7) |
| Mewtwo | Initiator | Psywave (quick scan) | Barrier (small smoke, 2 charges) | Psystrike (huge stun, 7) |
| Jigglypuff | Support | Sing (thrown sleep) | Wish (team heal) | Lullaby (huge sleep, 7) |

**Ultimates** charge from points: +1 for each kill, each death, planting or defusing the spike,
and each **ultimate orb** you pick up (one on each half of the map, back every round). The X box
shows your points; your ultimate is ready when it fills, and bots use theirs too.

**Modes**
- **Plant and defuse:** attack or defend a site with the spike; sides swap at halftime.
- **Elimination:** win a round by eliminating the other team.
- **Team deathmatch:** respawn 3 s after dying; the first team to 25, 40, or 50 kills wins (the
  "First to" setting picks it), or the most kills after 6 minutes. Guns are free (B any time).

**Rank and match history.** Every finished match is saved, and you have a rank against bots,
from Bronze 1 through Master 3 to Champion (100 RR per division). Wins gain RR and losses cost
it, more on Hard and less on Easy, with a little extra for kills minus deaths; deathmatch counts
half. See it on the title screen and under **Match history**.

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

**Credits and buying** (press **B** during the countdown, then a number; press it again to sell
back). Everyone starts each half with 800 credits and the free Sidearm. Kills pay 200, planting
pays every attacker 300, a round win pays 3000, and a loss pays 1900, then 2400, then 2900 as a
losing streak grows (capped at 9000). Survive a round and you keep your guns and what's left of
your shield; die and you're back to the Sidearm. Bots follow the same rules: each round a bot
team decides on a full buy, a force buy, a bonus round, or an eco, and your team calls its buy
out on your screen. Eco teams rush more often. In the test range everything is free.

| Key | Item | Credits | Notes |
|---|---|---|---|
| 1 | Light Pistol | 500 | Silenced, accurate, 15 rounds |
| 2 | Hand Cannon | 800 | Six heavy shots; one-shot headshots up close |
| 3 | SMG | 1,600 | Very fast fire, accurate on the move, weak far away |
| 4 | Shotgun | 1,850 | Automatic, 12 pellets; kills up close |
| 5 | Marksman | 2,250 | Semi-automatic, one-shot headshots at any range |
| 6 | Carbine | 2,900 | Silenced, steadier spray, damage drops with range |
| 7 | Rifle | 2,900 | One-shot headshots at any range |
| 8 | Sniper | 4,700 | One-shot body shots |
| 9 | Light Shield | 400 | 25 shield |
| 0 | Heavy Shield | 1,000 | 50 shield |

Silenced guns are much quieter, to you and to the bots' hearing.

**Sound** (use headphones):
- **Footsteps.** Everyone who runs makes footsteps, and landing a jump makes a thud. Walking
  (Shift) and crouching are silent, so you can sneak, and so can bots. Enemy steps are loud
  and crisp; your teammates' are quieter and duller, so enemies stand out.
- **Surfaces.** Floors sound like concrete, crates like hollow wood, and site platforms like
  metal, so you can hear someone step onto a site.
- **3D placement.** Every sound plays where it happens, so you can tell front from behind and
  above from below. Settings can switch to simple left/right stereo for speakers.
- **Walls muffle sound.** Footsteps and shots behind a wall sound dull and quieter.
- **Echo.** Distant fights sound distant, and each map has its own echo.
- **Kill sounds.** Each kill in a round climbs higher; five in one round is an Ace.

Every sound is generated in code with the Web Audio API; there are no audio files.

**Animated characters.** Every character is a jointed figure built and animated in code (no model
files): legs step in the direction of movement in time with the footstep sounds, the torso leans
into a run, knees bend when crouching, the arms and gun follow where a character aims, the gun
kicks when it fires and dips during a reload, the body flinches away from hits, and the knees
buckle and the body falls away from the killing shot. Each agent has its own color on the
shoulders and chest. The head and torso always sit exactly on the hitboxes, standing or crouched,
so what you see is what you hit.

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
| X | Ultimate (when charged) |
| F (hold) | Plant or defuse the spike |
| Tab (hold) | Scoreboard, in a match |
| Left click while dead | Pick which teammate to take over |
| Esc | Pause and settings |
| F3 | Debug view (frame rate, bot states and paths, collision boxes) |

## Settings

Open **Settings** from the title screen or the pause menu: mouse sensitivity (same scale as
Valorant) and raw input, field of view, graphics quality, volume, sound positioning (3D for
headphones or stereo for speakers), frame rate counter, a full
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
hear running, landings, gunshots, and abilities, but not walking. Their hearing uses the same
footstep events you hear, so the rules are the same on both sides. When one bot spots you, its team knows
where you were, and your teammates call out enemies they see. Bots use their abilities when it
helps: stuns and sleeps on nearby enemies, smokes before pushing, reveals before entering, heals
when safe, and dashes or teleports to escape.

Every round each bot team picks a plan, and your team calls it out on your screen. Recent plans
are less likely, so rounds don't repeat:

| Attack | What happens |
|---|---|
| Default | Group up out of sight of the site and go in together; one bot lurks the other lane |
| Rush | Everyone runs straight onto the site, no waiting |
| Split | Three come through the site's lane and two through mid, at the same time |
| Fake | Two make noise and use utility on one site, then rotate; the rest sneak to the other |
| Slow | Sneak in with Shift, hold, and hit late; a lurker waits to catch rotations |

| Defense | What happens |
|---|---|
| Standard | Two on each site, one in mid |
| Stack | Four on the site attackers have hit most, one on the other |
| Push | Standard, but one bot pushes up early for a pick, then falls back |

In elimination rounds teams spread across lanes, rush one lane, or hold angles and push late.

Bots **jiggle-peek** (tap left and right at a corner) when they lose sight of someone, pause at a
choke, or hear footsteps close. Lurkers and sneaking teams **walk with Shift**, so you won't hear
them coming. Bots also **adapt to you**: when you get two kills from the same spot, the enemy team
remembers it, pre-aims it, and (on Medium and Hard) throws flashes, smokes, stuns, and recon at it.
Attackers also avoid the site where they keep dying, and defenders stack the site that keeps
getting hit. Memories fade after a couple of rounds, so moving around resets them.

The carrier plants, the others guard the spike. Defenders take their own lane, rotate when two or
more attackers are seen elsewhere, and retake and defuse once the spike is down.

Enemy difficulty is Easy, Medium, or Hard. Your teammates always play at Medium.

| | Easy | Medium | Hard |
|---|---|---|---|
| Reaction | 0.8 to 1.0 s | 0.5 to 0.7 s | 0.3 to 0.45 s |
| Aim error | 5 degrees | 2.8 degrees | 2 degrees |
| Headshot chance | 5% | 15% | 25% |
| Ability use | Rarely | Sometimes | Whenever useful |
| Teamwork | None | Share sightings, trail, trade | Also wait at chokes |
| Team plans | Default and rush only | All | All |
| Jiggle-peeks | Never | Sometimes | Often |
| Adapts to your spots | No | Pre-aims, utility when entering | Pre-aims, utility whenever seen |
| Damage dealt | 70% | 100% | 100% |

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://localhost:5173 |
| `npm test` | Rules tests (movement, weapons, abilities, spike, navigation, footsteps, settings codes), sound tests, and map checks |
| `npm run test:audio` | Sound tests only (a strict stand-in for Web Audio, no browser needed) |
| `npm run test:bots` | Plays full bot-vs-bot matches on every map and checks plans, plants, balance, and stuck bots |
| `npm run test:maps` | Map checks only |
| `npm run build` | Production build in `dist/` (what Vercel deploys) |
| `npm run build:offline` | Single offline HTML file in `dist-offline/index.html` |
| `npm run preview` | Preview the production build |

## Project structure

```
src/
  main.js             boot, modes, screen state, the fixed-timestep game loop
  core/               input, physics and raycasts, sound, settings, storage, debug view
  game/               characters and their animated bodies (rig.js), weapons, abilities,
                      status effects, zones, the spike, footsteps, viewmodel, effects, and
                      the Session base class shared by every mode
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
| Body proportions and animation (step size, lean, flinch, death fall) | `RIG` in `src/game/rig.js` |
| Weapons (damage, fire rate, spread, recoil, zoom, price) | `src/data/weapons.js` |
| Credits, income, shields, and how bot teams decide what to buy | `ECONOMY`, `SHIELDS`, `teamBuy`, `botShopping` in `src/game/economy.js` |
| How much recoil moves the camera | `recoil.view` and `recoil.punch` in `src/data/weapons.js` |
| Crouch height and speed | `CROUCH`, `MOVE.crouchSpeed` in `src/game/character.js` |
| Thrown abilities, traps, recon | `src/game/zones.js` (flight), `PAYLOADS` in `src/game/abilities.js` |
| Agents and abilities (cooldowns, damage, radius, duration, ultimate cost) | `src/data/agents.js` |
| Ultimate orbs | `ORBS` in `src/game/orbs.js` |
| Deathmatch kill targets, length, respawn time | `DEATHMATCH` in `src/modes/match.js` |
| Rank divisions and RR rules | `RANK` in `src/game/history.js` |
| Spike (plant, defuse, fuse, barrier) | `SPIKE` in `src/game/spike.js` |
| Round and takeover timings | `MATCH_TIMES`, `TAKEOVER` in `src/modes/match.js` |
| Difficulty levels | `DIFFICULTY` in `src/ai/difficulty.js` |
| When bots use abilities | `src/ai/botabilities.js` |
| Team plans, how often each is picked, and memory | `PLANS`, `TACTICS` in `src/ai/tactics.js` |
| Jiggle-peeks and adapting, per difficulty | `peek`, `adapt` in `src/ai/difficulty.js` |
| How far bots hear things | `NOISE` in `src/ai/senses.js` |
| Footstep timing and landings | `FOOTSTEPS` in `src/game/footsteps.js` |
| How far you hear footsteps | `FOOTSTEP_RANGE` in `src/game/session.js` |
| What each material sounds like to walk on | `SURFACES` in `src/data/maps/mapkit.js` |
| Each map's echo | `acoustics` in each map file |
| Gunshot layers | `GUN_SOUNDS` in `src/core/audio.js` |
| Kill streaks | `STREAK` in `src/game/streak.js` |
| Aim trainer drills and scoring | `src/modes/aimtrainer.js` |
| Graphics quality levels | `QUALITY` in `src/core/settings.js` |
| Textures, wall shading, sky | `src/game/level.js` |
| Lighting mood per map | `sky`, `skyTop`, `light` in each map file |

## Adding a map

The map format is documented at the top of `src/data/maps/mapkit.js`. Write the south half of the
map with `pair(...)` for boxes and `mirroredNav(...)` for bot waypoints, and the kit mirrors it to
the north half so both teams get the same layout. Optionally give it an `acoustics` echo and
`surfaces` for footsteps. Add the map to `src/data/maps/index.js`, then run
`npm run test:maps`. It checks every waypoint is standable and reachable, every link is walkable
(links that change level, like stairs, are walked up and down by a character with the real physics),
lane routes are continuous, both halves have hold spots, each team has five spawns, both sites
exist, and the layout is exactly point-symmetric. `src/data/maps/map2.js` (Plaza) is a compact
example.

## Notes

- **Side balance.** In bot-only plant-and-defuse games, attack wins about 40% of rounds (it was
  about 31% before team plans).
  Teams swap sides at halftime, so matches stay even, and a human attacker shifts it a lot.
- **Dependencies.** `npm audit` reports one issue in `braces`, a dependency of the offline-build
  plugin. No fixed version exists yet, and it can only be triggered by malicious build patterns,
  never by players, so the game and its build are unaffected.
- **Development history.** `build-plan.md` is the original plan, with every phase checked off.

## License

MIT. See `LICENSE`. Copyright (c) 2026 Nahid Hasan (nahid619).
