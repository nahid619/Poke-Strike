// Counts your kills for the escalating kill sounds (1, 2, 3, 4 kills, then Ace).
// In a match the count lasts the whole round. In the test range and aim
// trainer there are no rounds, so kills only chain if they are close together.

export const STREAK = {
  window: 6, // seconds between kills for them to chain outside a match
  ace: 5,    // kills in one round for an Ace (the whole enemy team)
};

export class KillStreak {
  constructor() {
    this.reset();
  }

  reset() {
    this.count = 0;
    this.last = -Infinity;
  }

  /** Count a kill at `time`. Returns how many kills are in the streak now. */
  add(time, chainWindow = Infinity) {
    if (time - this.last > chainWindow) this.count = 0;
    this.count++;
    this.last = time;
    return this.count;
  }
}
