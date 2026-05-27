/**
 * InputManager — keyboard input with per-frame edge detection.
 * Tracks current & previous frame state for wasPressed / wasReleased queries.
 */
export class InputManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;

    /** @type {Set<string>} keys currently held down */
    this._current = new Set();
    /** @type {Set<string>} keys pressed since last update (accumulator) */
    this._pressedAccumulator = new Set();
    /** @type {Set<string>} keys released since last update (accumulator) */
    this._releasedAccumulator = new Set();
    /** @type {Set<string>} keys pressed during this frame */
    this._pressed = new Set();
    /** @type {Set<string>} keys released during this frame */
    this._released = new Set();

    // Bind handlers
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  /* ─── Frame Lifecycle ──────────────────────────────── */

  /**
   * Call at the START of each frame's update, BEFORE reading input.
   * Promotes accumulated inputs to frame-active sets and clears accumulator.
   */
  update() {
    this._pressed = new Set(this._pressedAccumulator);
    this._released = new Set(this._releasedAccumulator);
    this._pressedAccumulator.clear();
    this._releasedAccumulator.clear();
  }

  /* ─── Queries ──────────────────────────────────────── */

  /** Is key currently held down? */
  isDown(code) {
    return this._current.has(code);
  }

  /** Was key pressed THIS frame? */
  wasPressed(code) {
    return this._pressed.has(code);
  }

  /** Was key released THIS frame? */
  wasReleased(code) {
    return this._released.has(code);
  }

  /** Are any movement keys (WASD / arrows) currently held? */
  isMoving() {
    return (
      this._current.has('KeyW') ||
      this._current.has('KeyA') ||
      this._current.has('KeyS') ||
      this._current.has('KeyD') ||
      this._current.has('ArrowUp') ||
      this._current.has('ArrowDown') ||
      this._current.has('ArrowLeft') ||
      this._current.has('ArrowRight')
    );
  }

  /**
   * Get normalised movement direction from WASD / arrows.
   * @returns {{ x: number, z: number }}
   */
  getMovementVector() {
    let x = 0;
    let z = 0;

    if (this._current.has('KeyW') || this._current.has('ArrowUp')) z -= 1;
    if (this._current.has('KeyS') || this._current.has('ArrowDown')) z += 1;
    if (this._current.has('KeyA') || this._current.has('ArrowLeft')) x -= 1;
    if (this._current.has('KeyD') || this._current.has('ArrowRight')) x += 1;

    // Normalise so diagonal movement isn't faster
    const len = Math.sqrt(x * x + z * z);
    if (len > 0) {
      x /= len;
      z /= len;
    }

    return { x, z };
  }

  /* ─── Cleanup ──────────────────────────────────────── */

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  /* ─── Internal ─────────────────────────────────────── */

  _onKeyDown(e) {
    // Prevent defaults for game keys (but not when typing in an input/textarea)
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    // Prevent browser defaults for Tab, Space
    if (e.code === 'Tab' || e.code === 'Space') {
      e.preventDefault();
    }

    if (!this._current.has(e.code)) {
      this._pressedAccumulator.add(e.code);
    }
    this._current.add(e.code);
  }

  _onKeyUp(e) {
    if (this._current.has(e.code)) {
      this._releasedAccumulator.add(e.code);
    }
    this._current.delete(e.code);
  }
}
