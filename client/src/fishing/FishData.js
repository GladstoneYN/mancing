/**
 * FishData — display helpers for fish information.
 */
import { RARITIES } from '@shared/fishCatalog.js';

/**
 * Return a display string like "🐟 Carp"
 */
export function getFishDisplayName(fish) {
  return `${fish.emoji} ${fish.name}`;
}

/**
 * Return the CSS color for a rarity key (e.g. 'COMMON' → '#b8b8b8')
 */
export function getRarityColor(rarity) {
  const r = RARITIES[rarity];
  return r ? r.color : '#b8b8b8';
}

/**
 * Return a CSS box-shadow / text-shadow glow string for a rarity.
 */
export function getRarityGlow(rarity) {
  const r = RARITIES[rarity];
  return r ? `0 0 12px ${r.glow}, 0 0 24px ${r.glow}` : 'none';
}

/**
 * Format a fish size in centimetres, e.g. 42.3 → "42.3 cm"
 */
export function formatSize(size) {
  return `${Number(size).toFixed(1)} cm`;
}

/**
 * Format a coin value with thousands separator, e.g. 1250 → "1,250 🪙"
 */
export function formatValue(value) {
  return `${Number(value).toLocaleString()} 🪙`;
}
