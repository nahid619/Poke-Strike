// Tiny event bus. Game logic emits events ("shot", "hit", "kill"...);
// visuals, sound, and HUD listen. Bots will emit the same events later.
export class Events {
  constructor() {
    this.handlers = new Map();
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, data) {
    const list = this.handlers.get(type);
    if (list) for (const fn of list) fn(data);
  }
}
