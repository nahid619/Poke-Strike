# POKÉ STRIKE: Build Plan (v2)

A light, single-player, Valorant-style tactical shooter that runs in the browser (Chrome, Edge, Brave).
Pokémon-named agents with their own abilities, 5v5 matches against bots, takeover of teammates when you die, multiple maps, difficulty levels, and an Aim Trainer.

> Personal hobby fan project. Not for sale. Characters are simple shapes (capsules, cubes) in team colors, not copies of any official designs.
>
> **Naming note:** Pokémon names and move names are trademarks of Nintendo / The Pokémon Company, which has taken down free fan games before. While the game uses these names, keep the Vercel link private (share only with friends). If the game is ever shared publicly, swap to original names first. Names live only in `src/data/agents.js`, so this is a one-file change.

### What changed in v2
- The Character class and HumanController are built in Phase 1, not Phase 4.
- Health, shield, and damage move into Phase 2. A status effect system is added to Phase 4 (abilities).
- The Aim Trainer moves up to Phase 3, right after gunplay, to help tune weapon feel early.
- Maps include objective site data from the start, so plant and defuse can be added later without rewriting the bots.
- New technical rules: fixed timestep, throttled bot perception, smoke blocks bot vision, raw mouse input, debug overlay.
- Overlapping abilities in the roster were made distinct.
- New "Open Decisions" section, plus new risks and a clearer way of working.

---

## 1. Goals and Scope

**In scope**
- Single player only. You + 4 bot teammates vs 5 bots.
- When you die, you take control of a living teammate.
- 6+ agents with 2 abilities each (Q and E).
- 2-3 maps, each a small data file of walls, spawns, sites, and bot waypoints.
- Difficulty levels: Easy, Medium, Hard.
- Aim Trainer mode (Aim Lab style).
- Runs on a normal laptop with no install. Deployed on Vercel.

**Out of scope**
- Online multiplayer (no servers).
- Voice lines, skins, battle pass, matchmaking.
- Realistic human models or any official character designs.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | JavaScript (ES modules) | Runs natively in the browser |
| 3D engine | **Three.js** | Light, WebGL, huge community |
| Dev tooling | **Vite** | Fast dev server, simple build, Vercel auto-detects it |
| UI | HTML + CSS | Menus, HUD, scoreboard |
| Mouse look | Pointer Lock API (raw input) | Proper FPS aiming |
| Physics | Custom (capsule vs boxes) | Maps are boxes, so no physics engine is needed |
| Sound | Web Audio API | Generated sounds, no audio files |
| Saved data | localStorage | Settings, difficulty, best Aim Trainer scores |
| Hosting | **Vercel** (static) | Free, one-click from GitHub |
| Version control | Git + GitHub | Needed for Vercel auto-deploys |

No server, database, or backend. The game is a static web page.

---

## 3. Project Structure

```
poke-strike/
├── index.html
├── package.json
├── vite.config.js
├── public/                  # static assets (favicon, etc.)
└── src/
    ├── main.js              # boot, game loop (fixed timestep), state machine
    ├── core/
    │   ├── input.js         # keyboard, mouse, pointer lock
    │   ├── physics.js       # capsule-vs-box collision, raycast helpers
    │   ├── audio.js         # generated sounds
    │   ├── storage.js       # localStorage wrapper
    │   └── debug.js         # debug overlay (FPS, waypoints, bot states, hitboxes)
    ├── game/
    │   ├── character.js     # shared Character: position, health, shield, weapon, abilities, status
    │   ├── controllers.js   # HumanController and BotController
    │   ├── status.js        # status effects (stun, sleep, slow, reveal, shield)
    │   ├── weapons.js       # weapon data + firing logic
    │   ├── abilities.js     # ability effects
    │   ├── round.js         # round and match flow
    │   └── team.js          # team setup, spectate, takeover
    ├── ai/
    │   ├── bot.js           # bot brain (state machine)
    │   ├── perception.js    # sight, hearing, smoke checks (throttled)
    │   ├── nav.js           # waypoint pathing (A*)
    │   └── difficulty.js    # Easy / Medium / Hard settings
    ├── data/
    │   ├── agents.js        # agent roster + abilities (the only file with names)
    │   ├── weapons.js       # weapon stats
    │   └── maps/
    │       ├── testmap.js
    │       ├── map1.js
    │       ├── map2.js
    │       └── map3.js
    ├── modes/
    │   ├── match.js         # 5v5 mode
    │   └── aimtrainer.js    # Aim Trainer mode
    └── ui/
        ├── hud.js
        ├── menu.js
        └── styles.css
```

---

## 4. Key Design Decisions

### 4.1 Everything is data-driven
Agents, abilities, weapons, maps, and difficulty are plain JS objects. Adding a new agent or map means adding data, not rewriting the game.

### 4.2 One "Character" class for everyone, from day one
You, your teammates, and enemies all share the same Character (position, health, shield, weapon, abilities, status effects). Only the *controller* differs:
- **HumanController** reads keyboard and mouse.
- **BotController** runs the AI.

The player is a Character with a HumanController starting in Phase 1. Every later feature is added to the Character, so bots get it automatically. This also makes takeover simple: when you die, the HumanController is attached to a living teammate and that bot's AI is switched off.

### 4.3 Hitscan shooting
Bullets are instant raycasts, not projectiles. They are cheaper to run and fit the Valorant style. Headshots are detected through a separate head hitbox.

### 4.4 Bot navigation with waypoints
Each map defines waypoints and connections. Bots path between them with A*. This is much lighter than a full navmesh and easy to author by hand. Waypoints can be tagged (site, choke, cover, mid) so bots know what each spot is for.

### 4.5 Status effects are Character rules
Status effects belong to the Character, so they work the same on you and on bots:

| Effect | What it does |
|---|---|
| Stun | Slowed movement, shaky aim, can't use abilities. Short duration. |
| Sleep | Can't move, aim, or shoot. Breaks when damaged or when the timer ends. |
| Slow | Reduced movement speed. |
| Revealed | Visible through walls to the enemy team (outline). Bots get the position. |
| Shielded | Extra shield points that absorb damage first. |

### 4.6 Fixed timestep
Movement, fire rate, cooldowns, and bot logic run on a fixed timestep (for example 60 updates per second), separate from rendering. The game plays the same on a 60Hz and a 144Hz screen.

### 4.7 Fair bot perception
- Bots check sight about 10 times per second instead of every frame. This saves performance and feels more human.
- Sight checks test against walls **and smoke spheres**, so smokes work against bots.
- Hearing: running and gunshots make noise. Walking (Shift) is silent, as in Valorant.
- Bots only know what they can see, hear, or are told by a reveal or a teammate callout. No wallhacks.

### 4.8 Raw mouse input and pause
Pointer lock uses `requestPointerLock({ unadjustedMovement: true })` where supported (Chrome, Edge) for raw input, with a fallback when it isn't. Esc always releases pointer lock in browsers, so Esc opens the pause menu and is never used as a game keybind.

### 4.9 Debug overlay from the start
A toggleable overlay (F3) shows FPS, collision boxes, hitboxes, the waypoint graph, bot paths, and each bot's current state. It is added in Phase 1 and extended in each phase.

---

## 5. Agent Roster (starting set)

| Agent | Role | Ability Q | Ability E |
|---|---|---|---|
| **Pikachu** | Duelist | Thunder Dash: quick forward dash | Thunder Wave: stuns enemies nearby |
| **Charizard** | Duelist | Flame Burst: cone of fire damage | Blaze Trail: forward dash that leaves a burning trail enemies take damage in |
| **Gengar** | Controller | Dark Fog: smoke cloud that blocks vision | Shadow Mark: place a marker, reactivate to teleport back to it |
| **Blastoise** | Sentinel | Withdraw: gain shield | Hydro Burst: damage blast around you |
| **Alakazam** | Initiator | Teleport: blink forward | Psychic Sight: reveals enemies through walls in a radius |
| **Jigglypuff** | Support | Sing: puts enemies nearby to sleep | Rest: heal yourself |

Each mobility ability now plays differently: Pikachu dashes, Charizard dashes and leaves damage behind, Alakazam blinks forward, and Gengar teleports back to a planned spot.

**Later agents (optional):** Umbreon (trap/sentinel), Machamp (heavy duelist), Gardevoir (support), Lucario (initiator).

Ability effect types are reused (dash, blink, marker teleport, stun, sleep, smoke, shield, heal, reveal, blast, cone, trail), so new agents are cheap to add.

---

## 6. Weapons

| Weapon | Type | Notes |
|---|---|---|
| Pistol | Semi-auto | One-tap headshot at close range, accurate when standing still |
| Rifle | Automatic | Main weapon, recoil pattern that builds while spraying |
| Shotgun (later) | Pump | Close range, optional |
| Sniper (later) | Bolt action | One-shot body at full health, optional |

Without an economy, each player picks a weapon at round start (see Open Decisions).

---

## 7. Difficulty Levels

| Setting | Easy | Medium | Hard |
|---|---|---|---|
| Reaction time | 0.9s | 0.6s | 0.3s |
| Aim accuracy | Low | Medium | High |
| Headshot chance | 5% | 15% | 30% |
| Uses abilities | Rarely | Sometimes | Smartly |
| Teamwork (trading, grouping) | None | Basic | Good |
| Reacts to sounds | Barely | Yes | Yes, and checks the spot |
| Enemy damage | Reduced | Normal | Normal |

Numbers are starting points. We tune them by playing.

---

## 8. Open Decisions

These should be settled before the phase listed.

| Decision | Options | Default if undecided | Decide by |
|---|---|---|---|
| Agent names | Keep Pokémon names (private link) or use original names (public link) | Keep names, private link | Before sharing publicly |
| Economy / buy phase | None (pick weapon each round) or simple credits and buy menu | None | Phase 5 |
| Plant and defuse | Elimination only, or add spike and sites | Add later, but maps and bots are built ready for it | Phase 6 |
| Match length | First to 7 or first to 13 | First to 7 | Phase 5 |

---

## 9. Phase-by-Phase Plan

Each phase ends with something you can open and test. We don't move on until it works.

### Phase 0: Project Setup and First Deploy
**Goal:** An empty Three.js scene live on a Vercel URL.

Tasks:
- Create the Vite project and install Three.js.
- Render a floor and a rotating cube.
- Push to GitHub, connect to Vercel, confirm the live link works.

**Done when:** you can open the Vercel link and see the scene.

---

### Phase 1: First-Person Movement and the Character Class
**Goal:** Walk around a test room like an FPS, as a proper Character.

Tasks:
- `Character` class and `HumanController` (the player is a Character from day one).
- Fixed-timestep game loop.
- Pointer lock mouse look with raw input, "click to play" prompt, Esc opens a basic pause screen.
- WASD movement, jump, walk (Shift), with acceleration and friction so counter-strafing works later.
- Capsule-vs-box collision with walls and boxes.
- A simple test map.
- Debug overlay (FPS, collision boxes).

**Done when:** movement feels smooth, you can't walk through walls, and the debug overlay works.

---

### Phase 2: Gunplay, Health, and Damage
**Goal:** Shooting that feels like a tactical shooter, against targets that can take damage.

Tasks:
- Pistol (semi-auto, one-tap headshot) and rifle (automatic).
- Recoil that builds as you hold fire, and spread that grows when moving or jumping.
- Reloading, ammo counter, weapon switching.
- Health, shield, damage, and death on the Character.
- Head and body hitboxes, headshot vs body damage.
- Hit markers, bullet tracers, gun viewmodel.
- Gunshot, reload, and hit sounds.
- Standing target dummies (Characters with no controller) to shoot at.

**Done when:** spraying, tapping, and counter-strafing all feel different, and dummies take damage and die.

---

### Phase 3: Aim Trainer Mode
**Goal:** An Aim Lab style warm-up, and a tool for tuning weapon feel.

Tasks:
- Modes: Static targets, Moving targets, Flick shots, Tracking.
- 30-second timer, score, accuracy, headshot %.
- Best scores saved in localStorage.
- Choose a weapon and sensitivity.

**Done when:** you can run a drill and see your score and accuracy.

---

### Phase 4: Agents, Abilities, and Status Effects
**Goal:** Pick an agent and use their abilities.

Tasks:
- Data-driven ability system (Q and E with cooldowns).
- Status effect system (stun, sleep, slow, revealed, shielded) as described in 4.5.
- Implement all effect types listed in section 5.
- Smoke spheres that block raycasts used for vision (ready for bots in Phase 6).
- Visual effects for each ability (expanding rings, smoke spheres, trails, reveal outlines).
- HUD shows ability names and cooldown timers.

**Done when:** every agent in the starting roster works and is testable on target dummies.

---

### Phase 5: Teams and the Round Loop
**Goal:** 5v5 structure exists, even with dumb bots.

Tasks:
- 10 Characters split into two teams, with team colors and spawn points.
- Round start (short buy/pick time), round end, win condition (eliminate the other team).
- Score tracking, match length (first to 7 by default), and a scoreboard (Tab).
- Kill feed.
- Bots that stand still or wander so rounds can be tested.

**Done when:** a full round can start and end, and the score updates.

---

### Phase 6: Bot AI (Core)
**Goal:** Bots that move, see, and shoot sensibly.

Tasks:
- `BotController`, waypoint graph on the test map, and A* pathing.
- Waypoint tags (site, choke, cover) and site data on the map, ready for plant and defuse.
- Bot state machine: Hold, Push, Rotate, Fight, Retreat.
- Perception as described in 4.7: field of view, throttled sight checks, smoke blocks sight, hearing.
- Shooting with reaction time, aim error, and burst control.
- Roles (entry, anchor, support) so teammates don't all rush the same way.
- Stuck detection that re-routes, and bot paths and states in the debug overlay.

**Done when:** bots navigate the map, take fights, respect smokes, and don't get stuck on walls.

---

### Phase 7: Difficulty and Bot Abilities
**Goal:** Easy, Medium, and Hard actually feel different, and bots use abilities.

Tasks:
- Hook the difficulty table into bot behavior.
- Bots use their agent's abilities (smoke before pushing, heal when hurt, dash to escape, reveal before entering).
- Basic teamwork: grouping, trading kills, sharing spotted enemy positions.

**Done when:** a Hard match feels clearly tougher than an Easy one.

---

### Phase 8: Death Takeover
**Goal:** When you die, you keep playing as a living teammate.

Tasks:
- Detect player death, pick the nearest living teammate (or let you cycle with a key).
- Short camera transition, then hand control to that bot (HumanController replaces BotController).
- You get their agent's abilities, health, weapon, and cooldowns.
- If that teammate dies, you move to the next one.
- When the whole team is dead, the round ends.
- Stats track kills made by you vs by bots.
- Optional settings toggle: Takeover or Spectate only.

**Done when:** you can die and seamlessly continue as another teammate.

---

### Phase 9: Menus, Agent Select, and Settings
**Goal:** A full game flow from the title screen to the match.

Tasks:
- Title screen with Match and Aim Trainer buttons.
- Agent select screen showing abilities.
- Team composition: your team's other four agents are auto-picked for balance (one controller, one duelist, and so on), and the enemy team picks its own.
- Difficulty selector.
- Settings: mouse sensitivity, raw input on/off, field of view, volume, crosshair color and style, takeover vs spectate.
- Save settings in localStorage.
- Full pause menu and controls help screen.
- Match end screen with stats (kills, deaths, headshot %).

**Done when:** you can go from the title screen through a full match and back.

---

### Phase 10: More Maps
**Goal:** 2-3 distinct maps.

Tasks:
- Map data format finalized (walls, props, spawns, sites, tagged waypoints).
- Build Map 2 and Map 3 with different layouts (open mid, tight corridors, tall cover).
- Waypoint graphs for each so bots work on every map.
- Map select screen with random option.

**Done when:** all maps are playable end to end with competent bots.

---

### Phase 11: Plant and Defuse Objective (Optional Upgrade)
**Goal:** Real Valorant-style rounds.

Tasks:
- Attacker and defender sides with a spike (bomb) and the sites already in the map data.
- Plant and defuse mechanics with timers.
- Win conditions: eliminate, plant and detonate, or defuse.
- Side swap at halftime.
- Bot states for attacking and defending sites (built on the tagged waypoints from Phase 6).

**Done when:** a full match plays with objectives.

---

### Phase 12: Polish, Performance, and Final Release
**Goal:** Smooth, stable, and fun.

Tasks:
- Performance pass: limit draw calls, simple shadows, 60 FPS on a normal laptop.
- Bug fixing and bot-stuck fixes.
- Balance pass on weapons, abilities, and difficulty.
- Loading screen.
- Final Vercel deployment and a custom project name.
- Optional: downloadable single HTML file for offline play.

**Done when:** you can play several full matches without bugs and it runs smoothly.

---

## 10. Deploying on Vercel

**One-time setup**
1. Create a GitHub account and a new repository (for example `poke-strike`). Make it private if you keep the Pokémon names.
2. Push the project to GitHub.
3. Go to vercel.com, sign in with GitHub, click **Add New Project**, and import the repository.
4. Vercel detects Vite automatically. The settings are:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Click **Deploy**. You get a live link such as `poke-strike.vercel.app`.

**Every update after that:** push to GitHub and Vercel redeploys automatically in about a minute.

Vercel's free plan is meant for personal, non-commercial projects, which fits a hobby game. Check Vercel's current terms if the project ever becomes anything more.

---

## 11. Risks and How We Handle Them

| Risk | Plan |
|---|---|
| Takedown request over Pokémon names | Keep the link private while using the names; swap names in `agents.js` before sharing publicly |
| Bots get stuck on walls | Waypoint pathing, stuck detection that re-routes, and bot paths in the debug overlay |
| Bot AI is too dumb or too perfect | Difficulty table plus playtesting and tuning each phase |
| Bots see through smoke or walls | Smoke spheres are part of every sight check; bots only use what they perceive |
| Performance drops | Simple shapes, no heavy textures, limited lights, throttled bot perception, FPS check every phase |
| Game feels different on fast screens | Fixed timestep for all game logic |
| Takeover feels glitchy | Same Character class for everyone from Phase 1, with only the controller swapped |
| Late features force rewrites | Character, status effects, and map site data exist before the systems that need them |
| Scope grows too big | Strict phases; Phases 0-9 are the playable core and everything after is a bonus |
| Pointer lock problems on some setups | Open the game in its own tab or full screen, raw input fallback, clear "click to resume" prompt |
| Chat gets too long over many phases | This file is the source of truth; start a new chat per phase or two and share this file |

---

## 12. How We Work Together

1. Claude builds **one phase at a time** and gives you the updated project files.
2. You push them to GitHub, and Vercel deploys the new version.
3. You play it and say what feels wrong or what you want changed.
4. We fix it, update the checklist and any changed decisions in this file, then move to the next phase.
5. For later phases, start a new chat and upload this file plus the current project files.

**Milestones**
- **Skeleton (Phases 0-3):** movement, shooting, and the Aim Trainer. Already fun to play.
- **Playable core (Phases 4-9):** abilities, 5v5 rounds, real bots, takeover, and menus. A complete game.
- **Bonus (Phases 10-12):** more maps, objectives, and polish.

---

## 13. Quick Checklist

The repository is public on GitHub under the MIT license (code only; see the README disclaimer).

- [x] Phase 0: Setup and first Vercel deploy
- [x] Phase 1: First-person movement and Character class
- [x] Phase 2: Gunplay, health, and damage
- [x] Phase 3: Aim Trainer
- [x] Phase 4: Agents, abilities, and status effects
- [x] Phase 5: Teams and round loop (includes basic fighting bots, waypoint pathing, and spectating, pulled forward from Phases 6 and 8)
- [x] Phase 6: Bot AI core
- [x] Phase 7: Difficulty and bot abilities (teammates stay at Medium, difficulty sets the enemy team)
- [x] Phase 8: Death takeover
- [x] Phase 9: Menus, agent select, settings
- [x] Phase 10: More maps (Crossroads, Plaza, Foundry)
- [x] Phase 11: Plant and defuse (default mode; elimination still available)
- [x] Phase 12: Polish and final release (version 1.0.0: merged map geometry, graphics quality setting, loading screen, settings codes, offline single-file build, npm test, SETUP.md)
