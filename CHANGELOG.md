# Changelog

## 1.7.0

Ultimates, new agents, team deathmatch, and a rank.

- **Ultimates on X.** Every agent has one, charged by points instead of a cooldown: +1 per
  kill, per death, for planting or defusing, and per ultimate orb.
  - **Pikachu:** Thunder, a huge stun.
  - **Charizard:** Inferno, a huge firestorm.
  - **Gengar:** Night Shade, a giant smoke.
  - **Blastoise:** Shell Fortress, 100 shield for the team.
  - **Alakazam:** Psychic Sight, map-wide recon.
  - **Jigglypuff:** Lullaby, a huge sleep.
  - The X box shows your points and glows when your ultimate is ready. Bots use theirs too.
- **Ultimate orbs.** One on each half of every map, in the middle lane, back every round. Walk
  over one for a point. Bots grab them when one is close and safe.
- **Two new agents:**
  - **Lucario** (Duelist): Extreme Speed, Aura Sphere, and Steel Will.
  - **Mewtwo** (Initiator): Psywave, Barrier, and Psystrike.
- **Team deathmatch.** Respawn 3 s after dying; the first team to 25, 40, or 50 kills wins, or
  the most kills after 6 minutes. Guns are free and you can buy any time; you respawn with the
  last gun you picked.
- **Rank and match history.** Every finished match is saved (the last 30), with a rank from
  Bronze 1 through Master 3 to Champion. Your rank is on the title screen, and your RR change
  is on the results screen. A Match history screen lists your recent games.
- **Tests.**
  - New rules tests: every agent's abilities and roles, ultimates needing and spending points,
    orbs, rank names, and RR rules and saving.
  - The match simulation plays a team deathmatch on every map, checking respawns, the kill
    target, bots using ultimates, and orbs being picked up.

## 1.6.0

Credits, buying, and six new guns.

- **Credits like Valorant.** Everyone starts each half with 800 credits. Kills pay 200, planting
  pays every attacker 300, a round win pays 3000, and a loss pays 1900, then 2400, then 2900 as
  a losing streak grows (capped at 9000).
- **Carry-over.** Survive a round and you keep your guns and what's left of your shield. Die,
  and you start the next round with the free Sidearm and no shield.
- **A new buy menu** (B, then 1-9 or 0). It shows your credits, prices, what you own, and what
  you can't afford. Press an item's key again to sell back anything bought this round, for a full
  refund; swapping to another gun bought this round refunds the first.
- **Shields are bought:** Light Shield (400, 25) and Heavy Shield (1000, 50). Buying heavy over a
  light shield bought this round refunds the light.
- **New guns:**
  - **Sidearm** (free): what everyone starts with.
  - **Light Pistol** (500): silenced and accurate.
  - **SMG** (1600): very fast fire, accurate on the move.
  - **Shotgun** (1850): automatic, 12 pellets whose damage adds up; a close blast kills through
    full shield.
  - **Marksman** (2250): semi-automatic, one-shot headshots at any range.
  - **Carbine** (2900): silenced, steadier spray, damage drops with range.
  - The old Pistol is now the Hand Cannon (800).
  - Every gun has its own first-person model, body model, and layered sound. Silenced guns are
    much quieter, to you and to the bots' hearing.
- **Bots use the economy.** Each round a bot team looks at its credits and picks a pistol-round
  buy, a full buy, a force buy (after losses), a bonus round (after a win), or an eco. Your team
  calls its buy out on your screen, and eco teams rush more often. At most one bot per team takes
  the sniper.
- **The test range** keeps everything free.
- **Tests.**
  - New rules tests: income, the cap, buying, refunds, selling back, shields, bot buy decisions,
    shotgun pellets at close and long range, carbine falloff, and marksman headshots.
  - The sound tests play every gun.
  - The match simulation checks that teams make every kind of buy, buy a variety of guns, and
    get kills with them.

## 1.5.0

Maps with height, textures, and lighting.

- **High ground on every map, reached by stairs:**
  - **Crossroads:** a Heaven platform over each site, 2 m up against the outer wall, with a
    railing to crouch behind and peek over.
  - **Plaza:** balconies along both sides of the plaza, 1.8 m up, with stairs at each end and a
    railing facing mid.
  - **Foundry:** a raised deck on each site facing the doorway from mid, with steps up and a
    crate on top.
  - Platforms and stairs are metal, so you hear the clank when someone climbs them.
- **Textures drawn in code:** concrete floor tiles, block walls, metal panels with rivets, wood
  plank crates, and diamond-plate platforms and sites. Textures line up across neighboring
  boxes, and walls are shaded where they meet the floor.
- **A lighting mood per map, with a gradient sky:** clear midday (Crossroads), golden late
  afternoon with long shadows (Plaza), and overcast industrial haze (Foundry).
- **Bots use height.** Waypoints know their floor height. Sight checks use real eye height, and
  defenders value high ground when picking spots (with some randomness, so it isn't taken every
  round). Attackers check high spots on the way in, and bots climb stairs waypoint by waypoint.
- **Map checks walk the stairs.** `npm run test:maps` walks every link that changes level, up
  and down, with a character using the real physics. The match simulation checks that bots
  actually use the high ground on every map.

## 1.4.0

Animated characters, built entirely in code (no model files).

- **Jointed bodies.** Hips, a torso, a head with a visor, arms holding the current gun (rifle,
  sniper, or pistol), and legs with knees and feet. Each agent has its own color on the
  shoulder pads and a chest stripe, so you can tell who is who.
- **Walking and running.** The legs step in the direction of movement, one step every 2.3 m,
  in time with the footstep sounds. The hips bob, the torso leans into a run and into
  strafes, and the legs tuck when jumping.
- **Crouching.** The knees bend and the hips drop.
- **Aiming.** The arms and gun follow where a character looks, up or down. The gun kicks when
  it fires and dips while reloading, with the other hand reaching for a magazine.
- **Getting hit.** The torso flinches away from the shot; headshots snap the head back.
- **Dying.** The knees buckle, then the body falls away from the killing shot and settles on
  the ground with a small bounce.
- **Fair hitboxes.** The head and torso always sit exactly on the hitboxes, standing or
  crouched, so what looks like a headshot is one. Tests check this.
- **Fast.** Ten animated bodies take a small fraction of a millisecond per frame.
- **Tests.** New checks that the head is on the head hitbox (standing, crouched, and running),
  the torso covers the body hitbox, the feet stay on the ground, the legs alternate when
  running, aiming up raises the arms, flinches settle, the right gun shows, dead bodies lie
  down and fall away from the shot, and reviving stands them back up.

## 1.3.0

Smarter, less predictable bots.

- **Team plans.** Every round each bot team picks a plan, and your team calls it out on your
  screen. Attack: default with a lurker, rush, split (lane and mid at once), fake (two make
  noise on one site, then rotate while the rest hit the other), or slow (sneak, hold, hit
  late, with a lurker). Defense: standard, stack (four on one site), or an early push. Elimination:
  spread, rush, or hold then push. Recent plans are less likely, so rounds vary. Easy enemies
  only use default and rush.
- **Jiggle-peeks.** Bots tap left and right at corners when they lose sight of someone, pause
  at a choke, or hear footsteps close by (sometimes on Medium, often on Hard).
- **Sneaking.** Lurkers and sneaking teams walk with Shift once past the middle of the map,
  until the hit goes in, so you can't hear them.
- **They adapt to you.** Two of your kills from the same spot make the enemy team remember it:
  they pre-aim it and (Medium and Hard) throw flashes, smokes, stuns, and recon at it.
  Attackers avoid the site where they keep dying; defenders stack the site that keeps getting
  hit. Memories fade after a couple of rounds.
- **Fixes to old bot bugs:**
  - Supports no longer wait far behind an entry that is fighting or has left its route. They
    could stand still for over a minute; now they move up and trade.
  - A bot fetching a dropped spike behind the end of a wall could stand next to it for over a
    minute. It now heads for a waypoint with a clear line to the spike, walks straight at it,
    and tries another waypoint if it makes no progress.
- **Balance.** In bot-only matches attack now wins about 40% of rounds (it was about 31%).
- **Tests.** Team tactics and memory are in `npm test`, plus a new `tests/sim.mjs` that plays
  full bot-vs-bot matches on every map in a few seconds and checks that every plan gets used,
  spikes get planted on both sites, rounds don't time out, sides stay balanced, and no bot gets
  stuck.

## 1.2.0

Sound, rebuilt so you can play by ear like in Valorant. Use headphones.

- **Footsteps.** Everyone who runs makes footsteps (about one every 0.34 s), and landing a
  jump or a drop makes a thud. Walking (Shift) and crouching are silent. Enemy steps are loud
  and crisp, teammates' steps are quieter and duller so enemies stand out, and your own are
  quiet. You can hear running up to 30 m away.
- **Surfaces.** Concrete floors, hollow wood on crates, and a metal clank on site platforms,
  so you can hear someone step onto a site. Set per material in `SURFACES` (mapkit.js) or
  per map with `surfaces`.
- **3D sound.** Every sound in the world plays where it happens, using HRTF, so on
  headphones you can tell front from behind and above from below. New setting: Sound
  positioning, 3D (headphones) or Stereo (speakers).
- **Walls muffle sound.** A shot or footstep behind a wall loses its high end and is quieter.
- **Echo.** A shared room echo, stronger for distant sounds, so far away fights sound far
  away. Each map has its own: Foundry is short and tight, Plaza long and open.
- **Fuller gunshots.** Shots are layered: a snap, the crack, the body, and a low thump. Up
  close you also hear the gun's action. Your own shots add a kick and spent casings.
- **Kill sounds.** Each kill in a round climbs higher and adds a note. Five kills in a round
  is an Ace, with a fanfare and an Ace banner. Outside a match, kills chain if they are
  within 6 seconds.
- **A limiter** on the final mix, so big fights don't distort.
- **Bots hear what you hear.** Bot hearing now uses the same footstep events, so landings
  are noisy for both sides.
- **Tests.** Footsteps, surfaces, bot hearing, and kill streaks are in `npm test`, plus a new
  `tests/audio.mjs` that plays every sound through a strict stand-in for Web Audio and checks
  3D placement, wall muffling, echo, and that finished sounds free their resources.

## 1.1.1

Sniper scope and body shots, matched to Valorant's Operator and Vandal.

- **Dual-zoom sniper scope.** Right click for 2.5x, again for 5x, and once more to zoom out,
  like the Operator. The view glides between the two levels, the scope shows the current zoom,
  and mouse sensitivity scales with each level. You stay scoped between shots.
- **Operator numbers.** 255 head, 150 body, 120 legs. It fires 0.6 a second from the hip and
  0.75 a second scoped, and you run at 5.13 m/s while holding it.
- **Body shots look like body shots.** Characters had one tall capsule, so the bottom half of
  what looked like the body was really the leg hitbox (a sniper "body shot" there did 127 and
  didn't kill). Characters now have a torso over the body hitbox and two darker legs over the
  leg hitbox, so you can see exactly where body ends and legs begin.
- **Rifle zoom matches the Vandal.** First-shot spread is 0.25 degrees from the hip and 0.157
  zoomed (1.25x, 8.8 rounds a second).
- **Bots** with a sniper scope to 2.5x and shoot at the new fire rate.

## 1.1.0

Gunplay rebuilt to feel like Valorant, a new sniper, and new agent utility.

**Gunplay**
- **Recoil no longer throws your view around.** Bullets follow the spray pattern, but the
  camera follows only a small part of it plus a short kick that springs back, smoothed every
  frame. Your crosshair stays put and you pull down to control the spray, like Valorant.
- **Right click to zoom.** The rifle zooms 1.25x (tighter first shot, a little slower fire and
  movement). Toggle by default (click again to zoom out), or Hold in Settings. Zoomed mouse
  movement is scaled so the crosshair moves the same distance on screen; fine-tune it with the
  new scoped sensitivity multiplier.
- **New Sniper.** Bolt action, one-shot body shots, 2.5x scope with a full scope overlay.
  Pin-point when fully scoped and still; a gamble from the hip. Reloading leaves the scope.
- **Buy menu (B).** Pick rifle or sniper during the pre-round countdown (now 7 s), or any time
  in the test range. Your pick is remembered. Bot teams sometimes give an anchor the sniper.
- **Crouch (C).** Lowers your hitboxes, steadies your spray, and is silent.
- **Snappier movement.** Faster acceleration and stopping; counter-strafing is a quick tap.
- **Smoother gun animation.** Spring-based recoil, aim-down-sights glide, magazine drop on
  reload, sniper bolt cycling, landing dip, and a lighter, quicker sway (less input-lag feel).

**Crosshair**
- The default is now a still green dot. Movement error and firing error are separate switches,
  both off. Old saved settings with the moving crosshair are switched over automatically.
- Presets (Dot, Small dot, Classic, Classic + dot, Circle dot), a circle style, dot size, and
  opacity. The crosshair hides while fully scoped.

**Agents**
- Every agent now has ranged, Valorant-style utility: Flash Bolt (Pikachu), Ember (Charizard),
  Bubble Trap and Protect (Blastoise), Confusion and Future Sight (Alakazam), a thrown Sing and
  Wish (Jigglypuff). Dark Fog reaches 40 m. Some abilities have 2 charges.
- New flash (blind) status with a full-screen whiteout. Flashed bots can't see.
- Bots use all of it: they flash enemies who are facing them, lob fire onto a defuse, stun or
  sleep before pushing, throw recon ahead, trap the angles they hold, and shield or heal the team.

**Fixes**
- The weapon list now updates after buying a different primary.
- The round timer no longer shows in the test range.

## 1.0.1

Fixes to shooting feel and a few bugs. No balance changes.

- **Hit registration on moving targets.** Your shots are now checked against where enemies
  were drawn on your screen when you clicked. Before, they were checked against where the
  game had already moved them (up to one tick ahead), so shots on the edge of a strafing
  target's head could miss even though they looked on target.
- **Shots after stepping up a ledge.** Bullets now start from the camera. For a moment after
  stepping up, they used to start up to 40 cm higher than where you were looking from.
- **Fast mouse flicks.** The glitch filter used to throw away any mouse event bigger than
  1,500 counts, which could cut fast flicks short on high-DPI mice. It now only drops jumps
  that come out of nowhere.
- **Flick drill.** Orbs are placed in front of the booth and re-rolled if a wall hides them.
  Before, they were placed around wherever you stood and could end up behind the far wall.
- **Bots and the pistol.** Bots switch to the pistol when their rifle is out of ammo, fire it
  properly, and switch back to the rifle when it has ammo again.
- **Shadow Mark.** Gengar's marker is removed when Gengar dies.
- **Drawn rounds.** A round where both teams are eliminated now says so.
- **Debug view (F3).** No longer leaks memory each time you switch modes.
- Tests for all of the above (`npm test`).
