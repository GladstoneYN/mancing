/**
 * FishingRod — wraps rod data from the shared catalog and provides
 * stat helpers for the fishing mini-game.
 */
import { getRodById, TACKLES } from '@shared/fishCatalog.js';

export class FishingRod {
  /**
   * @param {string} rodId — e.g. 'bamboo_rod'
   * @param {string[]} [equippedTackleIds] — IDs of currently equipped tackles
   */
  constructor(rodId, equippedTackleIds = []) {
    const data = getRodById(rodId);
    if (!data) {
      throw new Error(`Unknown rod: ${rodId}`);
    }

    this.id = data.id;
    this.name = data.name;
    this.barSizeMultiplier = data.barSizeMultiplier;
    this.drainMultiplier = data.drainMultiplier;
    this.castDistance = data.castDistance;
    this.tackleSlots = data.tackleSlots;
    this.legendaryBonus = data.legendaryBonus;
    this.description = data.description;

    // Resolve equipped tackles (limited by available slots)
    this.equippedTackles = equippedTackleIds
      .slice(0, this.tackleSlots)
      .map(id => TACKLES.find(t => t.id === id))
      .filter(Boolean);
  }

  /**
   * Return the green zone pixel height, with rod multiplier and cork bobber bonus.
   * @param {number} baseHeight — BASE_ZONE_HEIGHT from constants
   */
  getZoneHeight(baseHeight) {
    let multiplier = this.barSizeMultiplier;

    // Cork bobber (barSize effect) stacks additively
    const corkBobber = this.equippedTackles.find(t => t.effect === 'barSize');
    if (corkBobber) {
      multiplier += corkBobber.value;
    }

    return baseHeight * multiplier;
  }

  /**
   * Return the drain multiplier for this rod.
   */
  getDrainMultiplier() {
    return this.drainMultiplier;
  }

  /**
   * Check whether any equipped tackle provides a given effect.
   * @param {string} effectName — e.g. 'slowDrain', 'fastFill', 'noBounce', 'barSize'
   */
  hasTackleEffect(effectName) {
    return this.equippedTackles.some(t => t.effect === effectName);
  }

  /**
   * Return the value for a tackle effect, or null if not equipped.
   * @param {string} effectName
   */
  getTackleValue(effectName) {
    const tackle = this.equippedTackles.find(t => t.effect === effectName);
    return tackle ? tackle.value : null;
  }
}
