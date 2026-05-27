/**
 * FishingSpot — glowing ring markers on the water surface
 * that pulse gently to show where the player can fish.
 */
import * as THREE from 'three';
import { FISHING_SPOTS } from '@shared/fishCatalog.js';
import { WORLD } from '@/utils/Constants.js';

export class FishingSpot {
  /**
   * @param {THREE.Scene} scene
   * @param {object} spotData — { id, name, x, z, rarityBonus }
   */
  constructor(scene, spotData) {
    this.scene = scene;
    this.id = spotData.id;
    this.name = spotData.name;
    this.position = new THREE.Vector3(
      spotData.x,
      WORLD.WATER_LEVEL + 0.06,
      spotData.z
    );
    this.rarityBonus = spotData.rarityBonus;

    // Outer ring
    const ringGeo = new THREE.RingGeometry(0.8, 1.2, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this._ringMat = new THREE.MeshBasicMaterial({
      color: 0x76d7c4,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._ring = new THREE.Mesh(ringGeo, this._ringMat);
    this._ring.position.copy(this.position);
    scene.add(this._ring);

    // Inner glow disc
    const innerGeo = new THREE.CircleGeometry(0.65, 16);
    innerGeo.rotateX(-Math.PI / 2);
    this._innerMat = new THREE.MeshBasicMaterial({
      color: 0x76d7c4,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this._inner = new THREE.Mesh(innerGeo, this._innerMat);
    this._inner.position.copy(this.position);
    this._inner.position.y += 0.01;
    scene.add(this._inner);

    // Random phase offset so spots don't pulse in sync
    this._time = Math.random() * Math.PI * 2;
  }

  /** Animate the glow pulse. */
  update(dt) {
    this._time += dt;
    this._ringMat.opacity = 0.3 + Math.sin(this._time * 2) * 0.15;
    this._innerMat.opacity = 0.1 + Math.sin(this._time * 2 + 0.5) * 0.08;
    this._ring.rotation.y += dt * 0.3; // slow spin
  }

  /**
   * Is the player close enough to interact?
   * @param {THREE.Vector3} playerPos
   * @param {number} maxDist
   */
  isNearby(playerPos, maxDist) {
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    return Math.sqrt(dx * dx + dz * dz) < maxDist;
  }

  /**
   * Factory — create all fishing spots from the shared catalog.
   * @param {THREE.Scene} scene
   * @returns {FishingSpot[]}
   */
  static createAll(scene) {
    return FISHING_SPOTS.map((data) => new FishingSpot(scene, data));
  }
}
