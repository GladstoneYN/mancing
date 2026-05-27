/**
 * Database layer — better-sqlite3 wrapper with prepared statements.
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db;
let dbPath;

try {
  const dataDir = join(__dirname, '..', 'data');
  mkdirSync(dataDir, { recursive: true });
  dbPath = join(dataDir, 'fishing.db');
  db = new Database(dbPath);
  console.log(`[${new Date().toISOString()}] Database initialized successfully at ${dbPath}`);
} catch (err) {
  console.error(`[${new Date().toISOString()}] Failed to initialize database at default path, trying fallback to /tmp/fishing.db:`, err.message);
  try {
    const fallbackDir = '/tmp/fishing-game-data';
    mkdirSync(fallbackDir, { recursive: true });
    dbPath = join(fallbackDir, 'fishing.db');
    db = new Database(dbPath);
    console.log(`[${new Date().toISOString()}] Fallback database initialized successfully at ${dbPath}`);
  } catch (err2) {
    console.error(`[${new Date().toISOString()}] Failed to initialize fallback database at /tmp/fishing.db, using in-memory database:`, err2.message);
    dbPath = ':memory:';
    db = new Database(dbPath);
    console.log(`[${new Date().toISOString()}] In-memory database initialized successfully.`);
  }
}

// Enable WAL mode for better concurrent read performance (if not in-memory)
if (dbPath !== ':memory:') {
  try {
    db.pragma('journal_mode = WAL');
  } catch (e) {
    console.warn(`[${new Date().toISOString()}] Failed to enable WAL mode:`, e.message);
  }
}
db.pragma('foreign_keys = ON');

// ─── Initialize schema ──────────────────────────────────────────────
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// Migrations for existing DB files
try {
  db.exec("ALTER TABLE players ADD COLUMN last_position_x REAL NOT NULL DEFAULT 0.0");
  db.exec("ALTER TABLE players ADD COLUMN last_position_y REAL NOT NULL DEFAULT 0.0");
  db.exec("ALTER TABLE players ADD COLUMN last_position_z REAL NOT NULL DEFAULT 8.0");
  console.log(`[${new Date().toISOString()}] Database columns migrated successfully.`);
} catch (e) {
  // Columns already exist
}

console.log(`[${new Date().toISOString()}] Database schema and migrations verified.`);

// ─── Prepared Statements ─────────────────────────────────────────────

// -- Players --
const stmts = {
  getPlayerById: db.prepare('SELECT * FROM players WHERE id = ?'),
  getPlayerByUsername: db.prepare('SELECT * FROM players WHERE username = ?'),
  getPlayerByToken: db.prepare('SELECT * FROM players WHERE session_token = ?'),
  createPlayer: db.prepare(`
    INSERT INTO players (username, password_hash, session_token, appearance)
    VALUES (@username, @password_hash, @session_token, @appearance)
  `),
  updateSessionToken: db.prepare('UPDATE players SET session_token = ?, last_login = datetime(\'now\') WHERE id = ?'),
  updatePlayerCoins: db.prepare('UPDATE players SET coins = ? WHERE id = ?'),
  updatePlayerRod: db.prepare('UPDATE players SET equipped_rod = ? WHERE id = ?'),
  updatePlayerCosmetics: db.prepare('UPDATE players SET equipped_cosmetics = ? WHERE id = ?'),
  updatePlayerAppearance: db.prepare('UPDATE players SET appearance = ? WHERE id = ?'),
  updatePlayerPosition: db.prepare('UPDATE players SET last_position_x = ?, last_position_y = ?, last_position_z = ? WHERE id = ?'),

  // -- Inventory --
  getInventory: db.prepare('SELECT * FROM inventory WHERE player_id = ?'),
  getInventoryByType: db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_type = ?'),
  getInventoryItem: db.prepare('SELECT * FROM inventory WHERE player_id = ? AND item_type = ? AND item_id = ?'),
  addInventoryItem: db.prepare(`
    INSERT INTO inventory (player_id, item_type, item_id, quantity, metadata)
    VALUES (@player_id, @item_type, @item_id, @quantity, @metadata)
  `),
  updateInventoryQuantity: db.prepare('UPDATE inventory SET quantity = ? WHERE id = ?'),
  deleteInventoryItem: db.prepare('DELETE FROM inventory WHERE id = ?'),

  // -- Fish Log --
  getFishLog: db.prepare('SELECT * FROM fish_log WHERE player_id = ?'),
  getFishLogEntry: db.prepare('SELECT * FROM fish_log WHERE player_id = ? AND fish_id = ?'),
  insertFishLog: db.prepare(`
    INSERT INTO fish_log (player_id, fish_id, largest_size, total_caught)
    VALUES (@player_id, @fish_id, @largest_size, @total_caught)
  `),
  updateFishLog: db.prepare(`
    UPDATE fish_log SET total_caught = total_caught + 1, largest_size = MAX(largest_size, ?)
    WHERE player_id = ? AND fish_id = ?
  `),

  // -- Chat --
  getChatHistory: db.prepare(`
    SELECT cm.id, cm.player_id, p.username, cm.message, cm.sent_at
    FROM chat_messages cm
    JOIN players p ON p.id = cm.player_id
    ORDER BY cm.sent_at DESC
    LIMIT 50
  `),
  addChatMessage: db.prepare(`
    INSERT INTO chat_messages (player_id, message) VALUES (?, ?)
  `),
};

// ─── Exported Helper Functions ───────────────────────────────────────

/** Strip password_hash from a player row before returning. */
function sanitizePlayer(row) {
  if (!row) return null;
  const { password_hash, ...safe } = row;
  return safe;
}

// -- Player helpers --

export function getPlayerById(id) {
  return stmts.getPlayerById.get(id);
}

export function getPlayerByUsername(username) {
  return stmts.getPlayerByUsername.get(username);
}

export function getPlayerByToken(token) {
  return stmts.getPlayerByToken.get(token);
}

export function getPlayerSafe(id) {
  return sanitizePlayer(stmts.getPlayerById.get(id));
}

export function getPlayerByTokenSafe(token) {
  return sanitizePlayer(stmts.getPlayerByToken.get(token));
}

export function createPlayer({ username, password_hash, session_token, appearance }) {
  const result = stmts.createPlayer.run({ username, password_hash, session_token, appearance });
  return { id: result.lastInsertRowid, ...sanitizePlayer(stmts.getPlayerById.get(result.lastInsertRowid)) };
}

export function updateSessionToken(playerId, token) {
  stmts.updateSessionToken.run(token, playerId);
}

export function updatePlayerCoins(playerId, coins) {
  stmts.updatePlayerCoins.run(coins, playerId);
}

export function updatePlayerRod(playerId, rodId) {
  stmts.updatePlayerRod.run(rodId, playerId);
}

export function updatePlayerCosmetics(playerId, cosmetics) {
  stmts.updatePlayerCosmetics.run(JSON.stringify(cosmetics), playerId);
}

export function updatePlayerAppearance(playerId, appearance) {
  stmts.updatePlayerAppearance.run(JSON.stringify(appearance), playerId);
}

export function updatePlayerPosition(playerId, x, y, z) {
  stmts.updatePlayerPosition.run(x, y, z, playerId);
}

// -- Inventory helpers --

export function getInventory(playerId) {
  const flat = stmts.getInventory.all(playerId).map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata || '{}'),
  }));

  const player = stmts.getPlayerById.get(playerId);
  const equippedRod = player?.equipped_rod || 'bamboo_rod';
  
  let appearance = { hat: 'none', accessory: 'none' };
  if (player?.appearance) {
    try {
      appearance = typeof player.appearance === 'string'
        ? JSON.parse(player.appearance)
        : player.appearance;
    } catch (e) {
      console.warn('Failed to parse player appearance:', e);
    }
  }

  const fishList = flat.filter(item => item.item_type === 'fish').map(item => ({
    id: item.item_id,
    dbId: item.id,
    quantity: item.quantity,
    size: item.metadata?.size,
    caughtAt: item.metadata?.caughtAt,
  }));

  let equippedCos = { bait: 'none', tackles: [] };
  if (player?.equipped_cosmetics) {
    try {
      equippedCos = JSON.parse(player.equipped_cosmetics);
    } catch (e) {
      console.warn('Failed to parse player equipped_cosmetics:', e);
    }
  }

  const equipmentList = flat.filter(item => item.item_type === 'rod' || item.item_type === 'tackle' || item.item_type === 'bait').map(item => {
    let equipped = false;
    if (item.item_type === 'rod') {
      equipped = (item.item_id === equippedRod);
    } else if (item.item_type === 'bait') {
      equipped = (equippedCos.bait === item.item_id);
    } else if (item.item_type === 'tackle') {
      equipped = (equippedCos.tackles || []).includes(item.item_id);
    }
    return {
      id: item.item_id,
      dbId: item.id,
      quantity: item.quantity,
      equipped,
    };
  });

  // Make sure bamboo_rod is always shown in equipment, marked as equipped if it's the player's equipped rod
  const hasBamboo = equipmentList.some(item => item.id === 'bamboo_rod');
  if (!hasBamboo) {
    equipmentList.unshift({
      id: 'bamboo_rod',
      dbId: -1,
      quantity: 1,
      equipped: equippedRod === 'bamboo_rod',
    });
  }

  const cosmeticsList = flat.filter(item => item.item_type === 'cosmetic').map(item => ({
    id: item.item_id,
    dbId: item.id,
    quantity: item.quantity,
    equipped: appearance.hat === item.item_id || appearance.accessory === item.item_id,
  }));

  return {
    fish: fishList,
    equipment: equipmentList,
    cosmetics: cosmeticsList,
    equippedBait: equippedCos.bait || 'none',
    equippedTackles: equippedCos.tackles || [],
  };
}

export function getInventoryByType(playerId, itemType) {
  return stmts.getInventoryByType.all(playerId, itemType).map(row => ({
    ...row,
    metadata: JSON.parse(row.metadata || '{}'),
  }));
}

export function getInventoryItem(playerId, itemType, itemId) {
  const row = stmts.getInventoryItem.get(playerId, itemType, itemId);
  if (!row) return null;
  return { ...row, metadata: JSON.parse(row.metadata || '{}') };
}

export function addToInventory(playerId, itemType, itemId, quantity = 1, metadata = {}) {
  const existing = stmts.getInventoryItem.get(playerId, itemType, itemId);
  if (existing && itemType !== 'fish') {
    // Stack non-fish items (fish have unique metadata per catch)
    stmts.updateInventoryQuantity.run(existing.quantity + quantity, existing.id);
    return { ...existing, quantity: existing.quantity + quantity };
  }
  const result = stmts.addInventoryItem.run({
    player_id: playerId,
    item_type: itemType,
    item_id: itemId,
    quantity,
    metadata: JSON.stringify(metadata),
  });
  return { id: result.lastInsertRowid, player_id: playerId, item_type: itemType, item_id: itemId, quantity, metadata };
}

export function removeFromInventory(playerId, itemType, itemId, quantity = 1) {
  const existing = stmts.getInventoryItem.get(playerId, itemType, itemId);
  if (!existing) return false;
  if (existing.quantity <= quantity) {
    stmts.deleteInventoryItem.run(existing.id);
  } else {
    stmts.updateInventoryQuantity.run(existing.quantity - quantity, existing.id);
  }
  return true;
}

export function removeFromInventoryById(inventoryId) {
  stmts.deleteInventoryItem.run(inventoryId);
}

// -- Fish Log helpers --

export function getFishLog(playerId) {
  return stmts.getFishLog.all(playerId);
}

export function logFish(playerId, fishId, size) {
  const existing = stmts.getFishLogEntry.get(playerId, fishId);
  if (existing) {
    stmts.updateFishLog.run(size, playerId, fishId);
    return {
      ...existing,
      total_caught: existing.total_caught + 1,
      largest_size: Math.max(existing.largest_size, size),
      isNewRecord: size > existing.largest_size,
      isFirstCatch: false,
    };
  }
  stmts.insertFishLog.run({ player_id: playerId, fish_id: fishId, largest_size: size, total_caught: 1 });
  return { player_id: playerId, fish_id: fishId, largest_size: size, total_caught: 1, isNewRecord: true, isFirstCatch: true };
}

// -- Chat helpers --

export function getChatHistory() {
  return stmts.getChatHistory.all().reverse(); // oldest first
}

export function addChatMessage(playerId, message) {
  const result = stmts.addChatMessage.run(playerId, message);
  return result.lastInsertRowid;
}

// -- Raw DB access (for transactions, etc.) --
export function getDb() {
  return db;
}

export default db;
