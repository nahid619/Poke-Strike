# Changelog

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
