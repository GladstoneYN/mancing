/**
 * FishingHandler — cast, bite, catch, and fail logic.
 */
import { EVENTS } from '../../shared/events.js';
import {
  FISH,
  RARITIES,
  FISHING_SPOTS,
  getRodById,
  getBaitById,
  getFishById,
} from '../../shared/fishCatalog.js';
import {
  getPlayerById,
  updatePlayerCoins,
  addToInventory,
  getInventory,
  removeFromInventory,
  updatePlayerCosmetics,
  logFish,
  getFishLog,
} from '../db/database.js';

/** Active fishing sessions: socketId → { timer, fishData, size, spotId } */
const activeSessions = new Map();

/** Rarity multiplier for coin value calculation */
const RARITY_VALUE_MULTIPLIER = {
  COMMON: 1.0,
  UNCOMMON: 1.5,
  RARE: 2.5,
  EPIC: 4.0,
  LEGENDARY: 8.0,
};

/**
 * Clean up a fishing session (for disconnects, etc.)
 * @param {string} socketId
 */
export function cleanupSession(socketId) {
  const session = activeSessions.get(socketId);
  if (session) {
    clearTimeout(session.timer);
    activeSessions.delete(socketId);
  }
}

/**
 * Select a fish using weighted random selection.
 * @param {object} options
 * @param {number} options.spotRarityBonus - Bonus from fishing spot
 * @param {number} options.rodLegendaryBonus - Bonus from legendary rod
 * @param {number} options.baitRarityBoost - Bonus from bait
 * @returns {object} Selected fish from catalog
 */
function selectFish({ spotRarityBonus = 0, rodLegendaryBonus = 0, baitRarityBoost = 0 }) {
  const totalBoost = spotRarityBonus + rodLegendaryBonus + baitRarityBoost;

  // Build adjusted weights: boost shifts weight from common → rarer tiers
  const rarityKeys = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
  const baseWeights = rarityKeys.map(k => RARITIES[k].weight);

  // Shift weight: reduce common, redistribute to higher tiers
  const adjustedWeights = baseWeights.map((w, i) => {
    if (i === 0) {
      // Reduce common weight
      return Math.max(5, w - totalBoost * 100);
    }
    // Increase higher rarity weights proportionally
    return w + (totalBoost * 100 * (i / 10));
  });

  // Weighted random selection of rarity tier
  const totalWeight = adjustedWeights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let selectedRarity = 'COMMON';

  for (let i = 0; i < rarityKeys.length; i++) {
    roll -= adjustedWeights[i];
    if (roll <= 0) {
      selectedRarity = rarityKeys[i];
      break;
    }
  }

  // Get all fish of this rarity and pick one randomly
  const fishPool = FISH.filter(f => f.rarity === selectedRarity);
  if (fishPool.length === 0) {
    // Fallback to any common fish
    const commons = FISH.filter(f => f.rarity === 'COMMON');
    return commons[Math.floor(Math.random() * commons.length)];
  }

  return fishPool[Math.floor(Math.random() * fishPool.length)];
}

/**
 * Generate a random size for a fish.
 * @param {object} fish
 * @returns {number} Size rounded to 1 decimal
 */
function generateSize(fish) {
  // Use a bell-curve-ish distribution (average of two random values)
  const r1 = Math.random();
  const r2 = Math.random();
  const t = (r1 + r2) / 2; // tends toward middle
  const size = fish.minSize + t * (fish.maxSize - fish.minSize);
  return Math.round(size * 10) / 10;
}

/**
 * Calculate the coin value for a caught fish.
 * @param {object} fish - Fish catalog entry
 * @param {number} size - Caught size
 * @returns {number} Coin value
 */
function calculateValue(fish, size) {
  const sizeRatio = size / fish.maxSize;
  const rarityMult = RARITY_VALUE_MULTIPLIER[fish.rarity] || 1;
  const randomVariance = 0.85 + Math.random() * 0.3; // 0.85 - 1.15
  const value = fish.baseValue * sizeRatio * rarityMult * randomVariance;
  return Math.max(1, Math.round(value));
}

/**
 * Handle a player casting their fishing line.
 * @param {import('socket.io').Socket} socket
 * @param {{ spotId?: string, baitId?: string }} data
 * @param {import('./GameRoom.js').default} gameRoom
 */
export function handleCast(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  // Clean up any existing session
  cleanupSession(socket.id);

  // Resolve fishing spot
  const spot = FISHING_SPOTS.find(s => s.id === data?.spotId) || null;
  const spotRarityBonus = spot?.rarityBonus || 0;

  // Resolve rod
  const rod = getRodById(player.equippedRod) || getRodById('bamboo_rod');
  const rodLegendaryBonus = rod.legendaryBonus || 0;

  // Resolve bait automatically from player's equipped cosmetics
  let baitRarityBoost = 0;
  let waitReduction = 1.0;

  const dbPlayer = getPlayerById(player.id);
  let equippedCos = { bait: 'none', tackles: [] };
  if (dbPlayer && dbPlayer.equipped_cosmetics) {
    try {
      equippedCos = JSON.parse(dbPlayer.equipped_cosmetics);
    } catch (e) {}
  }

  if (equippedCos.bait && equippedCos.bait !== 'none') {
    const bait = getBaitById(equippedCos.bait);
    if (bait) {
      const hasBait = getInventory(player.id).equipment.find(item => item.id === equippedCos.bait);
      if (hasBait && hasBait.quantity > 0) {
        baitRarityBoost = bait.rarityBoost || 0;
        waitReduction = bait.waitReduction || 1.0;

        // Consume one bait
        removeFromInventory(player.id, 'bait', equippedCos.bait, 1);

        // If that was the last bait, unequip it automatically
        if (hasBait.quantity <= 1) {
          equippedCos.bait = 'none';
          updatePlayerCosmetics(player.id, equippedCos);
        }

        // Send inventory update to sync bait count on client
        socket.emit(EVENTS.INVENTORY_UPDATE, {
          inventory: getInventory(player.id)
        });
      } else {
        // Automatically unequip if bait not in inventory
        equippedCos.bait = 'none';
        updatePlayerCosmetics(player.id, equippedCos);
        socket.emit(EVENTS.INVENTORY_UPDATE, {
          inventory: getInventory(player.id)
        });
      }
    }
  }

  // Update player state
  player.state = 'fishing';

  // Calculate random wait time (2-8 seconds, reduced by bait)
  const baseWait = 2000 + Math.random() * 6000; // 2000-8000 ms
  const waitTime = Math.max(1500, baseWait * waitReduction);

  // Resolve rainy weather boost (+0.10 rarity bonus if raining)
  const weatherRarityBonus = gameRoom.weather === 'rainy' ? 0.10 : 0;

  // Select a fish
  const selectedFish = selectFish({
    spotRarityBonus,
    rodLegendaryBonus,
    baitRarityBoost: baitRarityBoost + weatherRarityBonus
  });
  const size = generateSize(selectedFish);

  // Set a timer for the fish to bite
  const timer = setTimeout(() => {
    // Make sure player is still connected and fishing
    const currentPlayer = gameRoom.getPlayer(socket.id);
    if (!currentPlayer || currentPlayer.state !== 'fishing') {
      activeSessions.delete(socket.id);
      return;
    }

    // Send FISH_BITE event to the player
    socket.emit(EVENTS.FISH_BITE, {
      fish: selectedFish,
      spotId: spot?.id || null,
    });

    // Update state to reeling
    currentPlayer.state = 'reeling';

    console.log(`[${new Date().toISOString()}] Fish bite for ${currentPlayer.username}: ${selectedFish.name} (${selectedFish.rarity}, ${size}cm)`);
  }, waitTime);

  // Store the session
  activeSessions.set(socket.id, {
    timer,
    fishData: selectedFish,
    size,
    spotId: spot?.id || null,
  });

  // Broadcast to others that this player is casting
  gameRoom.broadcast(EVENTS.PLAYER_SYNC, {
    id: player.id,
    position: player.position,
    rotation: player.rotation,
    state: 'fishing',
  }, socket);

  console.log(`[${new Date().toISOString()}] ${player.username} cast their line${spot ? ` at ${spot.name}` : ''}`);
}

/**
 * Handle a successful fish catch (mini-game passed).
 * @param {import('socket.io').Socket} socket
 * @param {object} data
 * @param {import('./GameRoom.js').default} gameRoom
 */
export function handleCatch(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  const session = activeSessions.get(socket.id);
  if (!session) {
    socket.emit(EVENTS.FISH_RESULT, { error: 'No active fishing session.' });
    return;
  }

  const { fishData, size } = session;
  activeSessions.delete(socket.id);

  // Calculate coin value
  const value = calculateValue(fishData, size);

  try {
    // Get current player from DB
    const dbPlayer = getPlayerById(player.id);
    if (!dbPlayer) {
      socket.emit(EVENTS.FISH_RESULT, { error: 'Player not found.' });
      return;
    }

    // Unchanged coins balance (no auto-sell)
    const newBalance = dbPlayer.coins;

    // Add fish to inventory
    addToInventory(player.id, 'fish', fishData.id, 1, {
      size,
      caughtAt: new Date().toISOString(),
    });

    // Update fish log
    const logResult = logFish(player.id, fishData.id, size);

    // Get updated inventory
    const inventory = getInventory(player.id);

    // Update player state
    player.state = 'idle';

    // Send result to the catching player
    socket.emit(EVENTS.FISH_RESULT, {
      success: true,
      fish: {
        id: fishData.id,
        name: fishData.name,
        emoji: fishData.emoji,
        rarity: fishData.rarity,
        description: fishData.description,
      },
      size,
      value,
      newBalance,
      isNewRecord: logResult.isNewRecord,
      isFirstCatch: logResult.isFirstCatch,
      totalCaught: logResult.total_caught,
      largestSize: logResult.largest_size,
      inventory,
      fishLog: getFishLog(player.id),
    });

    // Broadcast to other players: someone caught a fish!
    gameRoom.broadcast(EVENTS.FISH_SHOW, {
      playerId: player.id,
      username: player.username,
      fish: {
        id: fishData.id,
        name: fishData.name,
        emoji: fishData.emoji,
        rarity: fishData.rarity,
      },
      size,
    }, socket);

    // Broadcast server-wide announcement for RARE, EPIC, or LEGENDARY catches
    if (['RARE', 'EPIC', 'LEGENDARY'].includes(fishData.rarity)) {
      gameRoom.broadcast(EVENTS.CHAT_MESSAGE, {
        system: true,
        text: `🏆 [Announcement] ${player.username} just caught a ${fishData.rarity} ${fishData.emoji} ${fishData.name} (${size} cm)!`,
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[${new Date().toISOString()}] ${player.username} caught ${fishData.name} (${size}cm) for ${value} coins!`);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing catch for ${player.username}:`, err.message);
    socket.emit(EVENTS.FISH_RESULT, { error: 'Failed to process catch. Please try again.' });
    player.state = 'idle';
  }
}

/**
 * Handle a failed catch (mini-game lost / fish escaped).
 * @param {import('socket.io').Socket} socket
 * @param {object} data
 * @param {import('./GameRoom.js').default} gameRoom
 */
export function handleFail(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  const session = activeSessions.get(socket.id);
  if (session) {
    const { fishData, size } = session;
    activeSessions.delete(socket.id);
    console.log(`[${new Date().toISOString()}] ${player.username} lost ${fishData.name} (${size}cm)`);
  }

  // Update player state
  player.state = 'idle';

  // Broadcast state change
  gameRoom.broadcast(EVENTS.PLAYER_SYNC, {
    id: player.id,
    position: player.position,
    rotation: player.rotation,
    state: 'idle',
  }, socket);
}
