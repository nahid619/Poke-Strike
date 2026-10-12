# Changelog

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
