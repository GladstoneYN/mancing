/**
 * NetSync — rate-limited position/rotation synchronisation to the server.
 */
import { NET } from '@/utils/Constants.js';
import { EVENTS } from '@shared/events.js';

const POS_EPSILON = 0.01;  // minimum position delta to count as "moved"
const ROT_EPSILON = 0.02;  // minimum rotation delta (radians)

export class NetSync {
  /**
   * @param {import('./SocketManager.js').SocketManager} socketManager
   * @param {object} localPlayer — must expose { position: {x,y,z}, rotation: number, state: string }
   */
  constructor(socketManager, localPlayer) {
    this.socket = socketManager;
    this.player = localPlayer;

    // Last sent values for dirty checking
    this._lastPos = { x: NaN, y: NaN, z: NaN };
    this._lastRot = NaN;
    this._lastState = null;
    this._lastHeldFishId = undefined;

    // Accumulator (seconds → ms comparison)
    this._accumMs = 0;
    this._sendRate = NET.POSITION_SEND_RATE; // ms
  }

  /**
   * Call every frame with delta time in seconds.
   * @param {number} dt — seconds since last frame
   */
  update(dt) {
    this._accumMs += dt * 1000;

    if (this._accumMs < this._sendRate) return;
    this._accumMs -= this._sendRate;

    // Guard: no socket or player
    if (!this.socket || !this.socket.isConnected() || !this.player) return;

    const pos = this.player.position;
    const rot = this.player.rotation;
    const state = this.player.state || 'idle';
    const heldFish = this.player.heldFish;
    const heldFishId = heldFish ? heldFish.id : null;

    // Dirty check — skip if nothing meaningful changed
    const posDirty =
      Math.abs(pos.x - this._lastPos.x) > POS_EPSILON ||
      Math.abs(pos.y - this._lastPos.y) > POS_EPSILON ||
      Math.abs(pos.z - this._lastPos.z) > POS_EPSILON;

    const rotDirty = Math.abs(rot - this._lastRot) > ROT_EPSILON;
    const stateDirty = state !== this._lastState;
    const heldFishDirty = heldFishId !== this._lastHeldFishId;

    if (!posDirty && !rotDirty && !stateDirty && !heldFishDirty) return;

    // Emit update
    this.socket.emit(EVENTS.PLAYER_MOVE, {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: rot,
      state,
      heldFish,
    });

    // Cache sent values
    this._lastPos.x = pos.x;
    this._lastPos.y = pos.y;
    this._lastPos.z = pos.z;
    this._lastRot = rot;
    this._lastState = state;
    this._lastHeldFishId = heldFishId;
  }
}
