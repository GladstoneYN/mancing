/**
 * Socket.io event constants — shared between client and server.
 * Import from both sides to keep event names in sync.
 */
export const EVENTS = {
  // === Connection ===
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  CONNECT_ERROR: 'connect_error',

  // === Authentication ===
  AUTH_SUCCESS: 'auth:success',
  AUTH_ERROR: 'auth:error',

  // === Room ===
  ROOM_STATE: 'room:state',       // Server → Client: full room state on join

  // === Player ===
  PLAYER_JOIN: 'player:join',     // Server → All: new player joined
  PLAYER_LEAVE: 'player:leave',   // Server → All: player disconnected
  PLAYER_MOVE: 'player:move',     // Client → Server: local position update
  PLAYER_SYNC: 'player:sync',     // Server → All: broadcast position
  PLAYER_STATE: 'player:state',   // Client → Server: state change (idle/walk/fish)
  PLAYER_EMOTE: 'player:emote',   // Both: emote animation

  // === Fishing ===
  FISH_CAST: 'fish:cast',         // Client → Server: cast line at a spot
  FISH_BITE: 'fish:bite',         // Server → Client: fish bites! (includes fish data for mini-game)
  FISH_CATCH: 'fish:catch',       // Client → Server: player caught the fish (mini-game success)
  FISH_FAIL: 'fish:fail',         // Client → Server: fish escaped (mini-game fail)
  FISH_RESULT: 'fish:result',     // Server → Client: confirmed catch with rewards
  FISH_SHOW: 'fish:show',         // Server → All: player is showing off a fish

  // === Chat ===
  CHAT_MESSAGE: 'chat:message',   // Both: chat message
  CHAT_HISTORY: 'chat:history',   // Server → Client: recent message history

  // === Shop ===
  SHOP_BUY: 'shop:buy',           // Client → Server: purchase item
  SHOP_SELL: 'shop:sell',         // Client → Server: sell fish/item
  SHOP_SELL_ALL: 'shop:sell_all', // Client → Server: sell all fish
  SHOP_RESULT: 'shop:result',     // Server → Client: transaction result

  // === Inventory ===
  INVENTORY_UPDATE: 'inventory:update', // Server → Client: inventory changed
  INVENTORY_EQUIP: 'inventory:equip',   // Client → Server: equip item

  // === Weather ===
  WEATHER_SYNC: 'weather:sync',         // Server → All: sync current weather state
  TIME_SYNC: 'time:sync',               // Server → All: sync current time of day
};

