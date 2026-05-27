/**
 * CameraController — third-person orbit camera.
 * Right-click drag to rotate, scroll to zoom. Smooth lerp follow.
 */
import * as THREE from 'three';
import { CAMERA } from '@/utils/Constants.js';

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera — from World
   * @param {HTMLCanvasElement} canvas
   */
  constructor(camera, canvas) {
    this._camera = camera;
    this._canvas = canvas;

    // Orbit state
    this._azimuth = Math.PI;          // horizontal angle (behind player by default)
    this._polar = 0.8;                // vertical angle (slightly above)
    this._distance = CAMERA.DISTANCE; // distance from target

    // Smooth position for lerping
    this._currentPos = new THREE.Vector3();
    this._targetLookAt = new THREE.Vector3();
    this._currentLookAt = new THREE.Vector3();

    // Mouse tracking
    this._isDragging = false;

    // Bind handlers
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onContextMenu = (e) => e.preventDefault();

    canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  /* ─── Public API ───────────────────────────────────── */

  /**
   * Update camera position each frame.
   * @param {THREE.Vector3} targetPosition — player world position
   * @param {number} targetRotation — player Y rotation (unused for free orbit)
   * @param {number} dt — delta time in seconds
   */
  update(targetPosition, targetRotation, dt) {
    let targetDist = this._distance;
    let targetPol = this._polar;
    let targetAz = this._azimuth;

    if (this._isZoomedIn) {
      targetDist = this._zoomDistance;
      targetPol = this._zoomPolar;
      // To smoothly transition to in-front:
      let diff = this._zoomAzimuth - this._azimuth;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      targetAz = this._azimuth + diff;
    } else {
      // Clamp polar angle and distance
      this._polar = THREE.MathUtils.clamp(this._polar, CAMERA.MIN_POLAR, CAMERA.MAX_POLAR);
      this._distance = THREE.MathUtils.clamp(this._distance, CAMERA.MIN_DISTANCE, CAMERA.MAX_DISTANCE);
      targetDist = this._distance;
      targetPol = this._polar;
      targetAz = this._azimuth;
    }

    // Desired camera position on orbit sphere around target
    const sinPolar = Math.sin(targetPol);
    const cosPolar = Math.cos(targetPol);
    const sinAzimuth = Math.sin(targetAz);
    const cosAzimuth = Math.cos(targetAz);

    const desiredX = targetPosition.x + targetDist * sinAzimuth * sinPolar;
    const desiredY = targetPosition.y + (this._isZoomedIn ? 0.35 : 1.0) + targetDist * cosPolar;
    const desiredZ = targetPosition.z + targetDist * cosAzimuth * sinPolar;

    // Smooth lerp camera position
    const lerpFactor = 1 - Math.exp(-CAMERA.LERP_SPEED * dt);
    this._currentPos.lerp(new THREE.Vector3(desiredX, desiredY, desiredZ), lerpFactor);

    this._camera.position.copy(this._currentPos);

    // Look at player head/chest level
    this._targetLookAt.set(
      targetPosition.x,
      targetPosition.y + (this._isZoomedIn ? 0.95 : 1.2), // slightly lower height when zoomed
      targetPosition.z
    );
    this._currentLookAt.lerp(this._targetLookAt, lerpFactor);
    this._camera.lookAt(this._currentLookAt);

    // Update internal angles to prevent snapping when zoom is turned off
    if (this._isZoomedIn) {
      this._distance = THREE.MathUtils.lerp(this._distance, targetDist, lerpFactor);
      this._polar = THREE.MathUtils.lerp(this._polar, targetPol, lerpFactor);
      this._azimuth = THREE.MathUtils.lerp(this._azimuth, targetAz, lerpFactor);
    }
  }

  /**
   * Zoom the camera in front of the player's face/chest.
   * @param {boolean} enabled
   * @param {number} [targetRotation=0] - The player's Y rotation
   */
  setZoomedIn(enabled, targetRotation = 0) {
    this._isZoomedIn = enabled;
    if (enabled) {
      this._zoomDistance = 2.0;
      this._zoomPolar = 1.25; // look slightly upwards towards the player
      // Position camera in front of the player (offset by player rotation angle)
      // Since azimuth is the angle from player to camera:
      // If player is looking at targetRotation, the camera should be at targetRotation (facing the player)
      this._zoomAzimuth = targetRotation;
    }
  }

  /** @returns {THREE.PerspectiveCamera} */
  getCamera() {
    return this._camera;
  }

  /* ─── Cleanup ──────────────────────────────────────── */

  destroy() {
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this._canvas.removeEventListener('wheel', this._onWheel);
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
  }

  /* ─── Mouse Handlers ───────────────────────────────── */

  _onMouseDown(e) {
    // Right-click or middle-click to orbit
    if (e.button === 2 || e.button === 1) {
      this._isDragging = true;
    }
  }

  _onMouseMove(e) {
    if (!this._isDragging) return;

    this._azimuth -= e.movementX * CAMERA.MOUSE_SENSITIVITY;
    this._polar -= e.movementY * CAMERA.MOUSE_SENSITIVITY;
  }

  _onMouseUp(e) {
    if (e.button === 2 || e.button === 1) {
      this._isDragging = false;
    }
  }

  _onWheel(e) {
    e.preventDefault();
    this._distance += e.deltaY * 0.01 * CAMERA.ZOOM_SPEED;
  }
}
