/**
 * ChatHandler — message validation, rate-limiting, persistence, and broadcasting.
 */
import { EVENTS } from '../../shared/events.js';
import { addChatMessage, getChatHistory as dbGetChatHistory } from '../db/database.js';

const MAX_MESSAGE_LENGTH = 200;
const RATE_LIMIT_WINDOW = 5000;   // 5 seconds
const RATE_LIMIT_MAX = 5;         // max messages per window

/** Per-socket rate limiting tracker: socketId → timestamp[] */
const rateLimitMap = new Map();

/**
 * Clean up rate-limit tracking for a disconnected socket.
 * @param {string} socketId
 */
export function cleanupRateLimit(socketId) {
  rateLimitMap.delete(socketId);
}

/**
 * Check if a socket is rate-limited.
 * @param {string} socketId
 * @returns {boolean}
 */
function isRateLimited(socketId) {
  const now = Date.now();
  let timestamps = rateLimitMap.get(socketId);

  if (!timestamps) {
    timestamps = [];
    rateLimitMap.set(socketId, timestamps);
  }

  // Remove timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] <= now - RATE_LIMIT_WINDOW) {
    timestamps.shift();
  }

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return true;
  }

  timestamps.push(now);
  return false;
}

/**
 * Handle an incoming chat message from a player.
 * @param {import('socket.io').Socket} socket
 * @param {{ text: string }} data
 * @param {import('./GameRoom.js').default} gameRoom
 */
export function handleMessage(socket, data, gameRoom) {
  const player = gameRoom.getPlayer(socket.id);
  if (!player) return;

  // Validate message text
  const text = typeof data?.text === 'string' ? data.text.trim() : '';
  if (text.length === 0) {
    socket.emit(EVENTS.CHAT_MESSAGE, { error: 'Message cannot be empty.' });
    return;
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    socket.emit(EVENTS.CHAT_MESSAGE, { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters).` });
    return;
  }

  // Rate limit check
  if (isRateLimited(socket.id)) {
    socket.emit(EVENTS.CHAT_MESSAGE, { error: 'Slow down! You are sending messages too fast.' });
    return;
  }

  // Persist to database
  try {
    addChatMessage(player.id, text);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to save chat message:`, err.message);
  }

  const timestamp = new Date().toISOString();

  // Broadcast to all players in the room (including sender)
  gameRoom.broadcast(EVENTS.CHAT_MESSAGE, {
    playerId: player.id,
    username: player.username,
    text,
    timestamp,
  });

  console.log(`[${new Date().toISOString()}] [Chat] ${player.username}: ${text}`);
}

/**
 * Get recent chat history.
 * @returns {Array<{ playerId: number, username: string, text: string, timestamp: string }>}
 */
export function getHistory() {
  try {
    const rows = dbGetChatHistory();
    return rows.map(row => ({
      playerId: row.player_id,
      username: row.username,
      text: row.message,
      timestamp: row.sent_at,
    }));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Failed to get chat history:`, err.message);
    return [];
  }
}
