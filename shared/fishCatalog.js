/**
 * Game Data Catalog — shared between client and server.
 * Contains all fish, rods, tackles, baits, cosmetics, and fishing spot data.
 */

// ─── Fish Behavior Types ─────────────────────────────────────────────
export const FISH_BEHAVIORS = {
  SMOOTH: 'smooth',   // Slow, steady sine wave — easiest
  MIXED: 'mixed',     // Cycles through patterns unpredictably
  SINKER: 'sinker',   // Fast downward acceleration
  FLOATER: 'floater', // Fast upward acceleration
  DART: 'dart',       // Erratic high-amplitude zipping — hardest
};

// ─── Rarity Definitions ──────────────────────────────────────────────
export const RARITIES = {
  COMMON:    { key: 'COMMON',    name: 'Common',    color: '#b8b8b8', glow: 'rgba(184,184,184,0.3)', weight: 50 },
  UNCOMMON:  { key: 'UNCOMMON',  name: 'Uncommon',  color: '#4ade80', glow: 'rgba(74,222,128,0.3)',  weight: 28 },
  RARE:      { key: 'RARE',      name: 'Rare',      color: '#60a5fa', glow: 'rgba(96,165,250,0.3)',  weight: 14 },
  EPIC:      { key: 'EPIC',      name: 'Epic',      color: '#c084fc', glow: 'rgba(192,132,252,0.3)', weight: 6  },
  LEGENDARY: { key: 'LEGENDARY', name: 'Legendary', color: '#fbbf24', glow: 'rgba(251,191,36,0.3)',  weight: 2  },
};

// ─── Fish Catalog ────────────────────────────────────────────────────
// difficulty: 15–110 (higher = more aggressive movement, less idle time)
export const FISH = [
  // ══ COMMON (difficulty 15–30) ══
  { id: 'carp',       name: 'Carp',         emoji: '🐟', rarity: 'COMMON', behavior: 'smooth',  difficulty: 15, baseValue: 10,  minSize: 20,  maxSize: 50,  description: 'A humble freshwater fish. Steady and reliable.' },
  { id: 'sunfish',    name: 'Sunfish',      emoji: '🌞', rarity: 'COMMON', behavior: 'smooth',  difficulty: 18, baseValue: 15,  minSize: 8,   maxSize: 22,  description: 'Small and cheerful, loves sunny shallows.' },
  { id: 'sardine',    name: 'Sardine',      emoji: '🐟', rarity: 'COMMON', behavior: 'smooth',  difficulty: 20, baseValue: 12,  minSize: 5,   maxSize: 15,  description: 'A tiny silvery fish that travels in schools.' },
  { id: 'anchovy',    name: 'Anchovy',      emoji: '🐟', rarity: 'COMMON', behavior: 'mixed',   difficulty: 22, baseValue: 18,  minSize: 4,   maxSize: 12,  description: 'Small but feisty. Surprisingly spirited.' },
  { id: 'perch',      name: 'Perch',        emoji: '🐟', rarity: 'COMMON', behavior: 'smooth',  difficulty: 25, baseValue: 20,  minSize: 15,  maxSize: 35,  description: 'A common lake fish with pretty stripes.' },

  // ══ UNCOMMON (difficulty 30–50) ══
  { id: 'bass',       name: 'Bass',         emoji: '🐟', rarity: 'UNCOMMON', behavior: 'mixed',   difficulty: 35, baseValue: 35,  minSize: 20,  maxSize: 55,  description: 'A popular sport fish. Puts up a decent fight.' },
  { id: 'trout',      name: 'Rainbow Trout',emoji: '🌈', rarity: 'UNCOMMON', behavior: 'mixed',   difficulty: 38, baseValue: 45,  minSize: 25,  maxSize: 60,  description: 'Beautiful iridescent scales shimmer in the light.' },
  { id: 'catfish',    name: 'Catfish',      emoji: '🐱', rarity: 'UNCOMMON', behavior: 'sinker',  difficulty: 40, baseValue: 50,  minSize: 30,  maxSize: 70,  description: 'A whiskered bottom-dweller. Loves the deep.' },
  { id: 'walleye',    name: 'Walleye',      emoji: '👁️', rarity: 'UNCOMMON', behavior: 'mixed',   difficulty: 42, baseValue: 55,  minSize: 25,  maxSize: 60,  description: 'Big glassy eyes that glow in moonlight.' },
  { id: 'bluegill',   name: 'Bluegill',     emoji: '💙', rarity: 'UNCOMMON', behavior: 'floater', difficulty: 45, baseValue: 40,  minSize: 10,  maxSize: 30,  description: 'A pretty little panfish with a blue shimmer.' },

  // ══ RARE (difficulty 50–70) ══
  { id: 'salmon',     name: 'Salmon',       emoji: '🐠', rarity: 'RARE', behavior: 'dart',   difficulty: 55, baseValue: 120, minSize: 40,  maxSize: 80,  description: 'A powerful swimmer fighting upstream.' },
  { id: 'tuna',       name: 'Tuna',         emoji: '🐟', rarity: 'RARE', behavior: 'dart',   difficulty: 60, baseValue: 150, minSize: 50,  maxSize: 120, description: 'A sleek, powerful ocean dweller.' },
  { id: 'pike',       name: 'Northern Pike', emoji: '🦷', rarity: 'RARE', behavior: 'dart',   difficulty: 62, baseValue: 140, minSize: 45,  maxSize: 100, description: 'A toothy predator lurking in the reeds.' },
  { id: 'red_snapper',name: 'Red Snapper',  emoji: '🔴', rarity: 'RARE', behavior: 'mixed',  difficulty: 58, baseValue: 130, minSize: 30,  maxSize: 65,  description: 'A vibrant reef fish with ruby scales.' },
  { id: 'sturgeon',   name: 'Sturgeon',     emoji: '🦕', rarity: 'RARE', behavior: 'sinker', difficulty: 65, baseValue: 200, minSize: 60,  maxSize: 150, description: 'An ancient armored giant of the deep.' },

  // ══ EPIC (difficulty 70–90) ══
  { id: 'swordfish',    name: 'Swordfish',    emoji: '⚔️', rarity: 'EPIC', behavior: 'dart',    difficulty: 78, baseValue: 400, minSize: 80,  maxSize: 200, description: 'Cuts through water like a blade through silk.' },
  { id: 'pufferfish',   name: 'Pufferfish',   emoji: '🐡', rarity: 'EPIC', behavior: 'floater', difficulty: 75, baseValue: 350, minSize: 15,  maxSize: 40,  description: 'Adorable but angry. Inflates when stressed.' },
  { id: 'anglerfish',   name: 'Anglerfish',   emoji: '🔦', rarity: 'EPIC', behavior: 'sinker',  difficulty: 80, baseValue: 500, minSize: 20,  maxSize: 50,  description: 'Lures prey with its hypnotic light.' },
  { id: 'electric_eel', name: 'Electric Eel',  emoji: '⚡', rarity: 'EPIC', behavior: 'dart',    difficulty: 85, baseValue: 600, minSize: 50,  maxSize: 150, description: 'Shocking personality. Literally.' },

  // ══ LEGENDARY (difficulty 90–110) ══
  { id: 'ghost_fish',   name: 'Ghost Fish',    emoji: '👻', rarity: 'LEGENDARY', behavior: 'dart',    difficulty: 95,  baseValue: 1500, minSize: 30,  maxSize: 80,  description: 'A translucent specter from the abyss. Is it even real?' },
  { id: 'solar_koi',    name: 'Solar Koi',     emoji: '☀️', rarity: 'LEGENDARY', behavior: 'floater', difficulty: 100, baseValue: 2500, minSize: 40,  maxSize: 90,  description: 'Glows with the warmth of a miniature sun.' },
  { id: 'kraken_tooth',  name: "Kraken's Tooth", emoji: '🦑', rarity: 'LEGENDARY', behavior: 'sinker',  difficulty: 105, baseValue: 3500, minSize: 100, maxSize: 300, description: 'Not a fish — a fragment of something far larger...' },
  { id: 'void_bass',    name: 'Void Bass',     emoji: '🌑', rarity: 'LEGENDARY', behavior: 'dart',    difficulty: 110, baseValue: 5000, minSize: 50,  maxSize: 120, description: 'Caught between dimensions. Stare too long and it stares back.' },
];

// ─── Rods ────────────────────────────────────────────────────────────
export const RODS = [
  { id: 'bamboo_rod',      name: 'Bamboo Rod',      emoji: '🎣', cost: 0,     barSizeMultiplier: 1.0,  drainMultiplier: 1.0,  castDistance: 1.0, tackleSlots: 0, legendaryBonus: 0,    description: 'Simple and humble. Everyone starts somewhere.' },
  { id: 'fiberglass_rod',  name: 'Fiberglass Rod',  emoji: '🎣', cost: 200,   barSizeMultiplier: 1.15, drainMultiplier: 0.85, castDistance: 1.2, tackleSlots: 0, legendaryBonus: 0,    description: 'Smoother action, forgiving on the reel.' },
  { id: 'carbon_rod',      name: 'Carbon Rod',      emoji: '🎣', cost: 800,   barSizeMultiplier: 1.3,  drainMultiplier: 0.75, castDistance: 1.5, tackleSlots: 1, legendaryBonus: 0,    description: 'Lightweight and strong. Casts like a dream.' },
  { id: 'irridium_rod',     name: 'Iridium Rod',     emoji: '🎣', cost: 2500,  barSizeMultiplier: 1.45, drainMultiplier: 0.65, castDistance: 1.8, tackleSlots: 2, legendaryBonus: 0,    description: 'Top-tier craftsmanship. Accepts bait and tackle.' },
  { id: 'legendary_rod',   name: 'Legendary Rod',   emoji: '🎣', cost: 10000, barSizeMultiplier: 1.6,  drainMultiplier: 0.55, castDistance: 2.0, tackleSlots: 2, legendaryBonus: 0.15, description: 'Forged in starlight. The fish come to you.' },
];

// ─── Tackles ─────────────────────────────────────────────────────────
export const TACKLES = [
  { id: 'trap_bobber',  name: 'Trap Bobber',  emoji: '⛓️', cost: 100, effect: 'slowDrain', value: 0.5,  description: 'Progress drains 50% slower when fish is outside the bar.' },
  { id: 'lead_bobber',  name: 'Lead Bobber',  emoji: '⚓', cost: 150, effect: 'noBounce',  value: true, description: 'Prevents the green bar from bouncing at the bottom.' },
  { id: 'cork_bobber',  name: 'Cork Bobber',  emoji: '🔴', cost: 120, effect: 'barSize',   value: 0.25, description: 'Increases green bar size by 25%.' },
  { id: 'barbed_hook',  name: 'Barbed Hook',  emoji: '📌', cost: 180, effect: 'fastFill',  value: 0.3,  description: 'Progress fills 30% faster when fish is inside the bar.' },
];

// ─── Baits ───────────────────────────────────────────────────────────
export const BAITS = [
  { id: 'basic_bait',   name: 'Basic Bait',   emoji: '🐛', cost: 5,  waitReduction: 0.5,  rarityBoost: 0,    description: 'Reduces wait time before a fish bites.' },
  { id: 'quality_bait', name: 'Quality Bait', emoji: '🐞', cost: 15, waitReduction: 0.3,  rarityBoost: 0.1,  description: 'Better chance of uncommon+ fish.' },
  { id: 'golden_bait',  name: 'Golden Bait',  emoji: '🐝', cost: 50, waitReduction: 0.25, rarityBoost: 0.25, description: 'Significantly better chance of rare+ fish.' },
];

// ─── Cosmetics ───────────────────────────────────────────────────────
export const COSMETICS = [
  // Hats
  { id: 'beanie',       name: 'Cozy Beanie',    type: 'hat',       cost: 50,  description: 'Warm and snug.' },
  { id: 'bucket_hat',   name: 'Bucket Hat',     type: 'hat',       cost: 75,  description: 'Classic fisher look.' },
  { id: 'cowboy_hat',   name: 'Cowboy Hat',     type: 'hat',       cost: 150, description: 'Yeehaw, partner.' },
  { id: 'witch_hat',    name: 'Witch Hat',      type: 'hat',       cost: 300, description: 'Spooky but cute.' },
  { id: 'crown',        name: 'Golden Crown',   type: 'hat',       cost: 500, description: 'Royalty of the pond.' },
  { id: 'party_hat',    name: 'Party Hat',      type: 'hat',       cost: 100, description: 'Every day is a celebration!' },
  // Accessories
  { id: 'round_glasses',name: 'Round Glasses',  type: 'accessory', cost: 80,  description: 'Scholarly vibes.' },
  { id: 'sunglasses',   name: 'Cool Shades',    type: 'accessory', cost: 100, description: 'Too cool for this pond.' },
  { id: 'scarf',        name: 'Cozy Scarf',     type: 'accessory', cost: 120, description: 'For breezy lake evenings.' },
  { id: 'backpack',     name: 'Explorer Pack',  type: 'accessory', cost: 200, description: 'Adventure awaits!' },
];

// ─── Fishing Spots ───────────────────────────────────────────────────
export const FISHING_SPOTS = [
  { id: 'dock_end',    name: 'End of Dock',    x: 0,    z: -26.5, rarityBonus: 0.1  },
  { id: 'dock_left',   name: 'Dock (Left)',    x: -3.5, z: -16, rarityBonus: 0    },
  { id: 'dock_right',  name: 'Dock (Right)',   x: 3.5,  z: -16, rarityBonus: 0    },
  { id: 'shore_west',  name: 'Rocky Shore',    x: -14,  z: -3.5, rarityBonus: -0.05 },
  { id: 'shore_east',  name: 'Sandy Cove',     x: 14,   z: -3.5, rarityBonus: 0.05  },
];

// ─── Character Appearance Defaults ───────────────────────────────────
export const DEFAULT_APPEARANCE = {
  bodyColor: '#76d7c4',
  hat: 'none',
  accessory: 'none',
};

export const BODY_COLORS = [
  { id: 'teal',     hex: '#76d7c4' },
  { id: 'coral',    hex: '#f0a0a0' },
  { id: 'lavender', hex: '#b0a0d0' },
  { id: 'peach',    hex: '#f5c6a0' },
  { id: 'mint',     hex: '#a0e0c0' },
  { id: 'sky',      hex: '#a0c8f0' },
  { id: 'rose',     hex: '#e8a0bf' },
  { id: 'butter',   hex: '#f0e0a0' },
  { id: 'lilac',    hex: '#d0a0e0' },
  { id: 'sage',     hex: '#b0c8a0' },
  { id: 'cloud',    hex: '#e0dcd0' },
  { id: 'sunset',   hex: '#f0b878' },
];

// ─── Helpers ─────────────────────────────────────────────────────────
export function getFishById(id) {
  return FISH.find(f => f.id === id);
}

export function getFishByRarity(rarity) {
  return FISH.filter(f => f.rarity === rarity);
}

export function getRodById(id) {
  return RODS.find(r => r.id === id);
}

export function getCosmeticById(id) {
  return COSMETICS.find(c => c.id === id);
}

export function getTackleById(id) {
  return TACKLES.find(t => t.id === id);
}

export function getBaitById(id) {
  return BAITS.find(b => b.id === id);
}
