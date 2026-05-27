/**
 * GameLoop — requestAnimationFrame loop with delta-time management.
 * Caps dt to prevent physics spirals on tab-away.
 */
export class GameLoop {
  /**
   * @param {(dt: number) => void} updateFn — called each frame with delta in seconds
   * @param {() => void} renderFn — called each frame after update
   */
  constructor(updateFn, renderFn) {
    this._update = updateFn;
    this._render = renderFn;

    this._running = false;
    this._paused = false;
    this._lastTime = 0;
    this._rafId = null;

    // Bind once so we can cleanly cancel
    this._tick = this._tick.bind(this);
  }

  /* ─── Public API ───────────────────────────────────── */

  start() {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._lastTime = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  pause() {
    this._paused = true;
  }

  resume() {
    if (!this._paused) return;
    this._paused = false;
    // Reset time so we don't get a huge dt spike
    this._lastTime = performance.now();
  }

  get isRunning() {
    return this._running;
  }

  get isPaused() {
    return this._paused;
  }

  /* ─── Internal ─────────────────────────────────────── */

  _tick(now) {
    if (!this._running) return;

    // Schedule next frame immediately
    this._rafId = requestAnimationFrame(this._tick);

    if (this._paused) {
      this._lastTime = now;
      return;
    }

    // Compute delta in seconds, cap at 100ms (10 FPS floor)
    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;

    this._update(dt);
    this._render();
  }
}
