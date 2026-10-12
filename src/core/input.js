// Keyboard, mouse, and pointer lock.
// Keys are tracked by KeyboardEvent.code so WASD works on any keyboard layout.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight',
  'ControlLeft', 'ControlRight', 'KeyC', 'KeyQ', 'KeyE', 'KeyR', 'Tab', 'Digit1', 'Digit2', 'Digit3', 'KeyF', 'KeyB',
]);

// Events with a bigger jump than this might be glitches (some systems send one
// huge movement value right after pointer lock starts).
const MAX_MOUSE_EVENT = 1500;

/**
 * Decide whether a mouse movement event is real. A big event is only dropped
 * when it comes out of nowhere: from rest, against the direction you were
 * moving, or far bigger than the event before it. A fast real flick builds up
 * over several events, so it passes; dropping every big event used to cut
 * fast flicks short on high-DPI mice with a low polling rate.
 */
export function isRealMouseMove(dx, dy, prev) {
  const axisOk = (v, before) =>
    Math.abs(v) <= MAX_MOUSE_EVENT ||
    (Math.abs(before) > MAX_MOUSE_EVENT / 4 &&
      Math.sign(before) === Math.sign(v) &&
      Math.abs(v) <= Math.abs(before) * 4);
  return axisOk(dx, prev.x) && axisOk(dy, prev.y);
}

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.wheel = 0;
    this.lastMove = { x: 0, y: 0 }; // previous mouse event, for the glitch filter
    this.locked = false;
    this.rawInput = false;
    this.lockTarget = null;
    this.onLockChange = null;
    this.onLockError = null;

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.reset());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (!isRealMouseMove(e.movementX, e.movementY, this.lastMove)) return;
      this.lastMove = { x: e.movementX, y: e.movementY };
      this.mouseX += e.movementX;
      this.mouseY += e.movementY;
    });

    // Mouse buttons are tracked like keys: 'Mouse0' is left, 'Mouse2' is right.
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      const code = 'Mouse' + e.button;
      if (!this.held.has(code)) this.pressed.add(code);
      this.held.add(code);
    });
    document.addEventListener('mouseup', (e) => this.held.delete('Mouse' + e.button));
    document.addEventListener('wheel', (e) => {
      if (this.locked && e.deltaY !== 0) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    document.addEventListener('contextmenu', (e) => {
      if (this.locked) e.preventDefault();
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = !!this.lockTarget && document.pointerLockElement === this.lockTarget;
      this.reset();
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('pointerlockerror', () => this.onLockError?.());
  }

  _onKey(e, isDown) {
    if (this.locked && GAME_KEYS.has(e.code)) e.preventDefault();
    if (isDown) {
      if (!e.repeat && !this.held.has(e.code)) this.pressed.add(e.code);
      this.held.add(e.code);
    } else {
      this.held.delete(e.code);
    }
  }

  isDown(code) {
    return this.held.has(code);
  }

  /** True while a press is waiting to be read by the next tick. */
  hasPendingPress(code) {
    return this.pressed.has(code);
  }

  /** True once per physical key press. */
  consumePressed(code) {
    const had = this.pressed.has(code);
    this.pressed.delete(code);
    return had;
  }

  consumeMouse() {
    const delta = { x: this.mouseX, y: this.mouseY };
    this.mouseX = 0;
    this.mouseY = 0;
    return delta;
  }

  /** Scroll steps since last call: +1 down, -1 up. */
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  reset() {
    this.wheel = 0;
    this.held.clear();
    this.pressed.clear();
    this.mouseX = 0;
    this.mouseY = 0;
    this.lastMove = { x: 0, y: 0 };
  }

  /**
   * Capture the mouse. Asks for raw (unaccelerated) input first, which Chrome,
   * Edge, and Brave support, then falls back to normal pointer lock.
   * Rejects if the browser refuses (e.g. clicking again too soon after Esc).
   */
  async lock(element, { raw = true } = {}) {
    this.lockTarget = element;
    if (!raw) {
      this.rawInput = false;
      await requestLock(element);
      return;
    }
    try {
      const usedPromise = await requestLock(element, { unadjustedMovement: true });
      this.rawInput = usedPromise;
    } catch (err) {
      if (err && err.name === 'NotSupportedError') {
        this.rawInput = false;
        await requestLock(element);
      } else {
        throw err;
      }
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

async function requestLock(element, options) {
  const result = options ? element.requestPointerLock(options) : element.requestPointerLock();
  if (result && typeof result.then === 'function') {
    await result;
    return true;
  }
  return false; // older browsers: no promise, options ignored
}
