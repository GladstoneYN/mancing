/**
 * Cozy Fishing Game — Main Server Entry Point
 */
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';

// Auth
import { register, login, verify } from './auth/auth.js';

// Database
import {
  getInventory,
  getInventoryByType,
  getInventoryItem,
  addToInventory,
  removeFromInventory,
  removeFromInventoryById,
  updatePlayerCoins,
  updatePlayerRod,
  updatePlayerCosmetics,
  updatePlayerAppearance,
  updatePlayerPosition,
  getPlayerById,
  getPlayerSafe,
  getFishLog,
} from './db/database.js';

// Game modules
import GameRoom from './game/GameRoom.js';
import { handleCast, handleCatch, handleFail, cleanupSession } from './game/FishingHandler.js';
import { handleMessage, getHistory, cleanupRateLimit } from './game/ChatHandler.js';

// Shared data
import { EVENTS } from '../shared/events.js';
import {
  RODS,
  TACKLES,
  BAITS,
  COSMETICS,
  getRodById,
  getTackleById,
  getBaitById,
  getCosmeticById,
  getFishById,
} from '../shared/fishCatalog.js';

// ─── Configuration ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// Dynamic CORS configuration reflecting the request origin
const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
};

// ─── Express App ─────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(cors(corsOptions));

// ─── REST Routes ─────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, appearance } = req.body;
    const result = await register(username, password, appearance);
    log(`Player registered: ${username}`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await login(username, password);
    log(`Player logged in: ${username}`);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ success: false, error: err.message });
  }
});

app.post('/api/verify', (req, res) => {
  try {
    const { token } = req.body;
    const result = verify(token);
    res.json({ success: result.valid, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ─── HTTP + Socket.io Server ─────────────────────────────────────────
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: corsOptions,
  pingInterval: 25000,
  pingTimeout: 60000,
});

// ─── Game Room ───────────────────────────────────────────────────────
const mainRoom = new GameRoom('main');
mainRoom.weather = 'sunny';
mainRoom.timeOfDay = 6.0; // starts at 6:00 AM sunrise

// Ping endpoint for keepalive and health checks
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    activePlayers: mainRoom.players.size,
  });
});

function changeWeather() {
  mainRoom.weather = Math.random() < 0.3 ? 'rainy' : 'sunny';
  io.emit(EVENTS.WEATHER_SYNC, { weather: mainRoom.weather });
  log(`Weather changed to: ${mainRoom.weather}`);
}
setInterval(changeWeather, 120000);

// Tick time of day on server: 24 game hours = 24 minutes (1440 seconds).
// Ticking every 1 second adds 24 / 1440 = 0.01666 game hours.
setInterval(() => {
  mainRoom.timeOfDay = (mainRoom.timeOfDay + (24 / 1440)) % 24;
}, 1000);

function syncTime() {
  io.emit(EVENTS.TIME_SYNC, { timeOfDay: mainRoom.timeOfDay });
}
// Periodically sync every 2 minutes to correct client clocks
setInterval(syncTime, 120000);


// ─── Socket.io Auth Middleware ───────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  const { valid, player } = verify(token);
  if (!valid || !player) {
    return next(new Error('Invalid or expired session token'));
  }

  // Attach player data to the socket
  socket.playerData = player;
  next();
});

// ─── Socket.io Connection Handler ────────────────────────────────────
io.on('connection', (socket) => {
  const playerData = socket.playerData;
  log(`Socket connected: ${playerData.username} (${socket.id})`);

  // --- Join Room ---
  let playerState;
  try {
    playerState = mainRoom.addPlayer(socket, playerData);
  } catch (err) {
    socket.emit(EVENTS.AUTH_ERROR, { error: err.message });
    socket.disconnect(true);
    return;
  }

  // Send room state to the joining player
  socket.emit(EVENTS.ROOM_STATE, {
    ...mainRoom.getState(),
    yourId: playerData.id,
  });

  // Send initial weather and time of day
  socket.emit(EVENTS.WEATHER_SYNC, { weather: mainRoom.weather });
  socket.emit(EVENTS.TIME_SYNC, { timeOfDay: mainRoom.timeOfDay });


  // Send chat history
  socket.emit(EVENTS.CHAT_HISTORY, getHistory());

  // Send player's inventory and fish log
  socket.emit(EVENTS.INVENTORY_UPDATE, {
    inventory: getInventory(playerData.id),
    fishLog: getFishLog(playerData.id),
    coins: playerData.coins,
  });

  // Broadcast to others that a new player joined
  mainRoom.broadcast(EVENTS.PLAYER_JOIN, playerState, socket);

  // --- Player Movement ---
  socket.on(EVENTS.PLAYER_MOVE, (data) => {
    try {
      mainRoom.updatePlayer(socket.id, data);
      const player = mainRoom.getPlayer(socket.id);
      if (player) {
        mainRoom.broadcast(EVENTS.PLAYER_SYNC, {
          id: player.id,
          position: player.position,
          rotation: player.rotation,
          state: player.state,
          heldFish: player.heldFish,
        }, socket);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling PLAYER_MOVE:`, err.message);
    }
  });

  // --- Player State Change ---
  socket.on(EVENTS.PLAYER_STATE, (data) => {
    try {
      const player = mainRoom.getPlayer(socket.id);
      if (player && data?.state) {
        player.state = data.state;
        mainRoom.broadcast(EVENTS.PLAYER_SYNC, {
          id: player.id,
          position: player.position,
          rotation: player.rotation,
          state: player.state,
        }, socket);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling PLAYER_STATE:`, err.message);
    }
  });

  // --- Player Emote ---
  socket.on(EVENTS.PLAYER_EMOTE, (data) => {
    try {
      const player = mainRoom.getPlayer(socket.id);
      if (player && data?.emote) {
        mainRoom.broadcast(EVENTS.PLAYER_EMOTE, {
          playerId: player.id,
          emote: data.emote,
        }, socket);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling PLAYER_EMOTE:`, err.message);
    }
  });

  // --- Fishing ---
  socket.on(EVENTS.FISH_CAST, (data) => {
    try {
      handleCast(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling FISH_CAST:`, err.message);
    }
  });

  socket.on(EVENTS.FISH_CATCH, (data) => {
    try {
      handleCatch(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling FISH_CATCH:`, err.message);
    }
  });

  socket.on(EVENTS.FISH_FAIL, (data) => {
    try {
      handleFail(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling FISH_FAIL:`, err.message);
    }
  });

  // --- Chat ---
  socket.on(EVENTS.CHAT_MESSAGE, (data) => {
    try {
      handleMessage(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling CHAT_MESSAGE:`, err.message);
    }
  });

  // --- Shop: Buy ---
  socket.on(EVENTS.SHOP_BUY, (data) => {
    try {
      handleShopBuy(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling SHOP_BUY:`, err.message);
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Purchase failed.' });
    }
  });

  // --- Shop: Sell ---
  socket.on(EVENTS.SHOP_SELL, (data) => {
    try {
      handleShopSell(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling SHOP_SELL:`, err.message);
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Sale failed.' });
    }
  });

  // --- Shop: Sell All ---
  socket.on(EVENTS.SHOP_SELL_ALL, () => {
    try {
      handleShopSellAll(socket, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling SHOP_SELL_ALL:`, err.message);
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Bulk sale failed.' });
    }
  });

  // --- Inventory: Equip ---
  socket.on(EVENTS.INVENTORY_EQUIP, (data) => {
    try {
      handleEquip(socket, data, mainRoom);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error handling INVENTORY_EQUIP:`, err.message);
    }
  });

  // --- Keepalive / Heartbeat ---
  socket.on('keepalive', () => {
    socket.emit('keepalive_ack');
  });

  // --- Disconnect ---
  socket.on(EVENTS.DISCONNECT, () => {
    const removed = mainRoom.removePlayer(socket.id);
    cleanupSession(socket.id);
    cleanupRateLimit(socket.id);

    if (removed) {
      try {
        updatePlayerPosition(removed.id, removed.position.x, removed.position.y, removed.position.z);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Failed to save player position on disconnect:`, err.message);
      }
      mainRoom.broadcast(EVENTS.PLAYER_LEAVE, {
        id: removed.id,
        username: removed.username,
      });
      log(`Player disconnected: ${removed.username}`);
    }
  });
});

// ─── Shop: Buy Handler ──────────────────────────────────────────────
function handleShopBuy(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  const itemType = data?.itemType || data?.type;
  const itemId = data?.itemId || data?.id;
  const quantity = data?.quantity || 1;

  if (!itemType || !itemId) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Invalid item.' });
    return;
  }

  // Look up the item
  let item = null;
  let type = '';

  switch (itemType) {
    case 'rod':
      item = getRodById(itemId);
      type = 'rod';
      break;
    case 'tackle':
      item = getTackleById(itemId);
      type = 'tackle';
      break;
    case 'bait':
      item = getBaitById(itemId);
      type = 'bait';
      break;
    case 'cosmetic':
      item = getCosmeticById(itemId);
      type = 'cosmetic';
      break;
    default:
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Unknown item type.' });
      return;
  }

  if (!item) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Item not found.' });
    return;
  }

  // For rods and cosmetics: check if already owned (non-stackable)
  if (type === 'rod' || type === 'cosmetic') {
    const owned = getInventoryItem(player.id, type, itemId);
    if (owned) {
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'You already own this item.' });
      return;
    }
  }

  const totalCost = item.cost * quantity;

  // Check coins
  const dbPlayer = getPlayerById(player.id);
  if (!dbPlayer || dbPlayer.coins < totalCost) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Not enough coins.' });
    return;
  }

  // Deduct coins and add to inventory
  const newBalance = dbPlayer.coins - totalCost;
  updatePlayerCoins(player.id, newBalance);
  addToInventory(player.id, type, itemId, quantity);

  const inventory = getInventory(player.id);

  socket.emit(EVENTS.SHOP_RESULT, {
    success: true,
    action: 'buy',
    item: { type, id: itemId, name: item.name },
    quantity,
    cost: totalCost,
    newBalance,
    message: `Successfully bought ${quantity}x ${item.name} for ${totalCost} coins!`,
  });

  socket.emit(EVENTS.INVENTORY_UPDATE, {
    inventory,
    coins: newBalance,
    fishLog: getFishLog(player.id),
  });

  log(`${player.username} bought ${quantity}x ${item.name} for ${totalCost} coins`);
}

// ─── Shop: Sell Handler ──────────────────────────────────────────────
function handleShopSell(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  // Validate shop proximity (Shop center is at x=15, z=10)
  const dx = player.position.x - 15;
  const dz = player.position.z - 10;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > 6.0) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: "You must be at the shop (house) to sell items." });
    return;
  }

  const itemType = data?.itemType || data?.type;
  const itemId = data?.itemId || data?.id;
  const quantity = data?.quantity || 1;

  if (!itemType || !itemId) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Invalid item.' });
    return;
  }

  // Only fish can be sold for now (other items sold at half price)
  let sellValue = 0;

  if (itemType === 'fish') {
    // Look up in shared catalog for base value
    const fishDef = getFishById(itemId);
    if (!fishDef) {
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Unknown fish.' });
      return;
    }
    // Sell value = base value * 0.75
    sellValue = Math.max(1, Math.round(fishDef.baseValue * 0.75)) * quantity;
  } else if (itemType === 'bait' || itemType === 'tackle') {
    // Sell at half purchase price
    let item = itemType === 'bait' ? getBaitById(itemId) : getTackleById(itemId);
    if (!item) {
      socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'Unknown item.' });
      return;
    }
    sellValue = Math.max(1, Math.round(item.cost * 0.5)) * quantity;
  } else {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'This item cannot be sold.' });
    return;
  }

  // Check if player has the item
  const owned = getInventoryItem(player.id, itemType, itemId);
  if (!owned || owned.quantity < quantity) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: 'You don\'t have enough of this item.' });
    return;
  }

  // Remove from inventory and add coins
  removeFromInventory(player.id, itemType, itemId, quantity);
  const dbPlayer = getPlayerById(player.id);
  const newBalance = dbPlayer.coins + sellValue;
  updatePlayerCoins(player.id, newBalance);

  const inventory = getInventory(player.id);

  let displayName = itemId;
  if (itemType === 'fish') displayName = getFishById(itemId)?.name || itemId;
  else if (itemType === 'bait') displayName = getBaitById(itemId)?.name || itemId;
  else if (itemType === 'tackle') displayName = getTackleById(itemId)?.name || itemId;

  socket.emit(EVENTS.SHOP_RESULT, {
    success: true,
    action: 'sell',
    item: { type: itemType, id: itemId },
    quantity,
    earnings: sellValue,
    newBalance,
    message: `Successfully sold ${quantity}x ${displayName} for ${sellValue} coins!`,
  });

  socket.emit(EVENTS.INVENTORY_UPDATE, {
    inventory,
    coins: newBalance,
    fishLog: getFishLog(player.id),
  });

  log(`${player.username} sold ${quantity}x ${itemId} for ${sellValue} coins`);
}

// ─── Shop: Sell All Handler ──────────────────────────────────────────
function handleShopSellAll(socket, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  // Validate shop proximity (Shop center is at x=15, z=10)
  const dx = player.position.x - 15;
  const dz = player.position.z - 10;
  const distance = Math.sqrt(dx * dx + dz * dz);
  if (distance > 6.0) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: "You must be at the shop (house) to sell items." });
    return;
  }

  const { fish } = getInventory(player.id);
  if (!fish || fish.length === 0) {
    socket.emit(EVENTS.SHOP_RESULT, { success: false, error: "You have no fish to sell." });
    return;
  }

  let totalEarnings = 0;
  let soldCount = 0;

  for (const item of fish) {
    const fishDef = getFishById(item.id);
    if (!fishDef) continue;

    // Sell value = base value * 0.75
    const sellValue = Math.max(1, Math.round(fishDef.baseValue * 0.75)) * item.quantity;
    totalEarnings += sellValue;
    soldCount += item.quantity;

    // Delete row from database by unique id
    removeFromInventoryById(item.dbId);
  }

  const dbPlayer = getPlayerById(player.id);
  const newBalance = dbPlayer.coins + totalEarnings;
  updatePlayerCoins(player.id, newBalance);

  const inventory = getInventory(player.id);

  socket.emit(EVENTS.SHOP_RESULT, {
    success: true,
    action: 'sell_all',
    earnings: totalEarnings,
    newBalance,
    message: `Successfully sold all ${soldCount} fish for ${totalEarnings} coins!`,
  });

  socket.emit(EVENTS.INVENTORY_UPDATE, {
    inventory,
    coins: newBalance,
    fishLog: getFishLog(player.id),
  });

  log(`${player.username} sold all fish (${soldCount}) for ${totalEarnings} coins`);
}

// ─── Equip Handler ───────────────────────────────────────────────────
function handleEquip(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  const itemType = data?.itemType || data?.type;
  const itemId = data?.itemId || data?.id;

  if (!itemType || !itemId) {
    socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Invalid equip request.' });
    return;
  }

  switch (itemType) {
    case 'rod': {
      // Verify player owns the rod (or it's the default bamboo rod)
      if (itemId !== 'bamboo_rod') {
        const owned = getInventoryItem(player.id, 'rod', itemId);
        if (!owned) {
          socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'You don\'t own this rod.' });
          return;
        }
      }
      const rod = getRodById(itemId);
      if (!rod) {
        socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Unknown rod.' });
        return;
      }
      updatePlayerRod(player.id, itemId);
      player.equippedRod = itemId;
      socket.emit(EVENTS.INVENTORY_UPDATE, {
        equippedRod: itemId,
        inventory: getInventory(player.id),
        fishLog: getFishLog(player.id)
      });
      log(`${player.username} equipped ${rod.name}`);
      break;
    }
    case 'cosmetic': {
      const appearance = typeof player.appearance === 'string'
        ? JSON.parse(player.appearance)
        : { ...player.appearance };

      if (itemId === 'none') {
        const cosType = data?.cosmeticType || data?.cosType;
        if (cosType === 'hat') {
          appearance.hat = 'none';
        } else if (cosType === 'accessory') {
          appearance.accessory = 'none';
        } else {
          socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Unknown cosmetic slot.' });
          return;
        }

        player.appearance = appearance;
        updatePlayerAppearance(player.id, appearance);

        // Broadcast appearance change
        gameRoom.broadcast(EVENTS.PLAYER_SYNC, {
          id: player.id,
          position: player.position,
          rotation: player.rotation,
          state: player.state,
          appearance,
        });

        socket.emit(EVENTS.INVENTORY_UPDATE, {
          appearance,
          inventory: getInventory(player.id),
          fishLog: getFishLog(player.id)
        });
        log(`${player.username} unequipped cosmetic`);
        break;
      }

      const cosmetic = getCosmeticById(itemId);
      if (!cosmetic) {
        socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Unknown cosmetic.' });
        return;
      }
      // Verify ownership
      const owned = getInventoryItem(player.id, 'cosmetic', itemId);
      if (!owned) {
        socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'You don\'t own this cosmetic.' });
        return;
      }

      if (cosmetic.type === 'hat') {
        appearance.hat = itemId;
      } else if (cosmetic.type === 'accessory') {
        appearance.accessory = itemId;
      }

      player.appearance = appearance;
      updatePlayerAppearance(player.id, appearance);

      // Broadcast appearance change
      gameRoom.broadcast(EVENTS.PLAYER_SYNC, {
        id: player.id,
        position: player.position,
        rotation: player.rotation,
        state: player.state,
        appearance,
      });

      socket.emit(EVENTS.INVENTORY_UPDATE, {
        appearance,
        inventory: getInventory(player.id),
        fishLog: getFishLog(player.id)
      });
      log(`${player.username} equipped ${cosmetic.name}`);
      break;
    }
    case 'bait': {
      const dbPlayer = getPlayerById(player.id);
      let equippedCos = { bait: 'none', tackles: [] };
      if (dbPlayer && dbPlayer.equipped_cosmetics) {
        try {
          equippedCos = JSON.parse(dbPlayer.equipped_cosmetics);
        } catch (e) {}
      }

      if (itemId === 'none') {
        equippedCos.bait = 'none';
      } else {
        const owned = getInventoryItem(player.id, 'bait', itemId);
        if (!owned || owned.quantity <= 0) {
          socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'You don\'t own any of this bait.' });
          return;
        }
        equippedCos.bait = itemId;
      }

      updatePlayerCosmetics(player.id, equippedCos);
      socket.emit(EVENTS.INVENTORY_UPDATE, {
        inventory: getInventory(player.id),
        fishLog: getFishLog(player.id)
      });
      log(`${player.username} set equipped bait to: ${itemId}`);
      break;
    }
    case 'tackle': {
      const dbPlayer = getPlayerById(player.id);
      let equippedCos = { bait: 'none', tackles: [] };
      if (dbPlayer && dbPlayer.equipped_cosmetics) {
        try {
          equippedCos = JSON.parse(dbPlayer.equipped_cosmetics);
        } catch (e) {}
      }

      if (!equippedCos.tackles) equippedCos.tackles = [];

      if (itemId === 'none') {
        equippedCos.tackles = [];
      } else {
        const owned = getInventoryItem(player.id, 'tackle', itemId);
        if (!owned || owned.quantity <= 0) {
          socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'You don\'t own this tackle.' });
          return;
        }

        const rod = getRodById(player.equippedRod || 'bamboo_rod') || getRodById('bamboo_rod');
        const slotsLimit = rod.tackleSlots || 0;

        if (slotsLimit <= 0) {
          socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Your current rod doesn\'t have tackle slots.' });
          return;
        }

        const idx = equippedCos.tackles.indexOf(itemId);
        if (idx >= 0) {
          equippedCos.tackles.splice(idx, 1);
        } else {
          if (equippedCos.tackles.length >= slotsLimit) {
            equippedCos.tackles.shift();
          }
          equippedCos.tackles.push(itemId);
        }
      }

      updatePlayerCosmetics(player.id, equippedCos);
      socket.emit(EVENTS.INVENTORY_UPDATE, {
        inventory: getInventory(player.id),
        fishLog: getFishLog(player.id)
      });
      log(`${player.username} updated equipped tackles to: [${equippedCos.tackles.join(', ')}]`);
      break;
    }
    default:
      socket.emit(EVENTS.INVENTORY_UPDATE, { error: 'Cannot equip this item type.' });
  }
}

// ─── Start Server ────────────────────────────────────────────────────
httpServer.listen(PORT, '0.0.0.0', () => {
  log(`🎣 Cozy Fishing Server running on port ${PORT}`);
  log(`   CORS origin: Dynamic (origin reflection)`);
  log(`   WebSocket path: /socket.io`);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────
process.on('SIGINT', () => {
  log('Shutting down gracefully...');
  io.close();
  httpServer.close(() => {
    log('Server closed.');
    process.exit(0);
  });
});

process.on('uncaughtException', (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[${new Date().toISOString()}] Unhandled Rejection:`, reason);
});
