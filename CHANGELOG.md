# Changelog

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
