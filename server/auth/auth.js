/**
 * Authentication — register, login, verify session tokens.
 */
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import {
  getPlayerByUsername,
  getPlayerByToken,
  createPlayer,
  updateSessionToken,
} from '../db/database.js';
import { DEFAULT_APPEARANCE } from '../../shared/fishCatalog.js';

const SALT_ROUNDS = 10;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

/**
 * Format player row for client consumption, parsing JSON columns.
 */
function formatPlayerForClient(playerRow) {
  if (!playerRow) return null;
  const { password_hash, ...player } = playerRow;

  if (typeof player.appearance === 'string') {
    try {
      player.appearance = JSON.parse(player.appearance);
    } catch (e) {
      console.warn('Failed to parse appearance for client:', e);
    }
  }

  if (typeof player.equipped_cosmetics === 'string') {
    try {
      player.equipped_cosmetics = JSON.parse(player.equipped_cosmetics);
    } catch (e) {
      console.warn('Failed to parse equipped_cosmetics for client:', e);
    }
  } else if (!player.equipped_cosmetics) {
    player.equipped_cosmetics = { bait: 'none', tackles: [] };
  }

  player.equippedRod = player.equipped_rod || 'bamboo_rod';

  return player;
}

/**
 * Register a new player account.
 * @param {string} username
 * @param {string} password
 * @param {object} [appearance] - Optional character appearance
 * @returns {{ token: string, player: object }}
 */
export async function register(username, password, appearance) {
  // Validate username
  if (!username || !USERNAME_RE.test(username)) {
    throw new Error('Username must be 3-16 characters (letters, numbers, underscores only).');
  }

  // Validate password
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }
  if (password.length > 128) {
    throw new Error('Password must be at most 128 characters.');
  }

  // Check uniqueness
  const existing = getPlayerByUsername(username);
  if (existing) {
    throw new Error('Username is already taken.');
  }

  // Hash password
  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  // Generate session token
  const session_token = uuidv4();

  // Merge appearance with defaults
  const playerAppearance = { ...DEFAULT_APPEARANCE, ...(appearance || {}) };

  // Create player
  createPlayer({
    username,
    password_hash,
    session_token,
    appearance: JSON.stringify(playerAppearance),
  });

  const playerRow = getPlayerByUsername(username);

  return { token: session_token, player: formatPlayerForClient(playerRow) };
}

/**
 * Log in an existing player.
 * @param {string} username
 * @param {string} password
 * @returns {{ token: string, player: object }}
 */
export async function login(username, password) {
  if (!username || !password) {
    throw new Error('Username and password are required.');
  }

  const player = getPlayerByUsername(username);
  if (!player) {
    throw new Error('Invalid username or password.');
  }

  const valid = await bcrypt.compare(password, player.password_hash);
  if (!valid) {
    throw new Error('Invalid username or password.');
  }

  // Generate new session token
  const token = uuidv4();
  updateSessionToken(player.id, token);

  // Re-fetch player row to get updated session token
  const updatedPlayer = getPlayerByUsername(username);

  return {
    token,
    player: { ...formatPlayerForClient(updatedPlayer), session_token: token, last_login: new Date().toISOString() },
  };
}

/**
 * Verify a session token.
 * @param {string} token
 * @returns {{ valid: boolean, player: object|null }}
 */
export function verify(token) {
  if (!token) {
    return { valid: false, player: null };
  }

  const player = getPlayerByToken(token);
  if (!player) {
    return { valid: false, player: null };
  }

  return { valid: true, player: formatPlayerForClient(player) };
}
