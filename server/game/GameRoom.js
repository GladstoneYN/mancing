/**
 * GameRoom — manages connected players in a single multiplayer room.
 */

const MAX_PLAYERS = 10;
const SPAWN_POINT = { x: 0, y: 0, z: 8 };

export default class GameRoom {
  constructor(name = 'main') {
    /** @type {string} */
    this.name = name;

    /**
     * Map of socketId → player state
     * @type {Map<string, object>}
     */
    this.players = new Map();

    /**
     * Map of socketId → Socket instance
     * @type {Map<string, import('socket.io').Socket>}
     */
    this.sockets = new Map();

    /**
     * Map of playerId → socketId  (reverse lookup)
     * @type {Map<number, string>}
     */
    this.playerIdToSocket = new Map();
  }

  /**
   * Check if the room is full.
   */
  isFull() {
    return this.players.size >= MAX_PLAYERS;
  }

  /**
   * Add a player to the room.
   * @param {import('socket.io').Socket} socket
   * @param {object} playerData - DB player row (sanitized)
   * @returns {object} The player state that was added
   */
  addPlayer(socket, playerData) {
    if (this.isFull()) {
      throw new Error('Room is full.');
    }

    const playerState = {
      id: playerData.id,
      username: playerData.username,
      appearance: typeof playerData.appearance === 'string'
        ? JSON.parse(playerData.appearance)
        : playerData.appearance,
      position: {
        x: playerData.last_position_x !== undefined ? playerData.last_position_x : SPAWN_POINT.x,
        y: playerData.last_position_y !== undefined ? playerData.last_position_y : SPAWN_POINT.y,
        z: playerData.last_position_z !== undefined ? playerData.last_position_z : SPAWN_POINT.z,
      },
      rotation: 0,
      state: 'idle',            // idle | walking | fishing | reeling
      equippedRod: playerData.equipped_rod || 'bamboo_rod',
    };

    this.players.set(socket.id, playerState);
    this.sockets.set(socket.id, socket);
    this.playerIdToSocket.set(playerData.id, socket.id);

    console.log(`[${new Date().toISOString()}] Player "${playerData.username}" joined room "${this.name}" (${this.players.size}/${MAX_PLAYERS})`);

    return playerState;
  }

  /**
   * Remove a player from the room.
   * @param {string} socketId
   * @returns {object|null} The removed player state, or null
   */
  removePlayer(socketId) {
    const playerState = this.players.get(socketId);
    if (!playerState) return null;

    this.players.delete(socketId);
    this.sockets.delete(socketId);
    this.playerIdToSocket.delete(playerState.id);

    console.log(`[${new Date().toISOString()}] Player "${playerState.username}" left room "${this.name}" (${this.players.size}/${MAX_PLAYERS})`);

    return playerState;
  }

  /**
   * Get a player state by socket ID.
   * @param {string} socketId
   * @returns {object|null}
   */
  getPlayer(socketId) {
    return this.players.get(socketId) || null;
  }

  /**
   * Get a player state by player database ID.
   * @param {number} playerId
   * @returns {object|null}
   */
  getPlayerById(playerId) {
    const socketId = this.playerIdToSocket.get(playerId);
    if (!socketId) return null;
    return this.players.get(socketId) || null;
  }

  /**
   * Get a socket by player database ID.
   * @param {number} playerId
   * @returns {import('socket.io').Socket|null}
   */
  getSocketByPlayerId(playerId) {
    const socketId = this.playerIdToSocket.get(playerId);
    if (!socketId) return null;
    return this.sockets.get(socketId) || null;
  }

  /**
   * Update a player's position and rotation.
   * @param {string} socketId
   * @param {{ position: object, rotation: object, state: string }} data
   */
  updatePlayer(socketId, data) {
    const player = this.players.get(socketId);
    if (!player) return;

    if (data.position) {
      player.position = {
        x: Number(data.position.x) || 0,
        y: Number(data.position.y) || 0,
        z: Number(data.position.z) || 0,
      };
    }
    if (data.rotation !== undefined) {
      player.rotation = typeof data.rotation === 'object'
        ? (Number(data.rotation.y) || 0)
        : (Number(data.rotation) || 0);
    }
    if (data.state) {
      player.state = data.state;
    }
    if (data.heldFish !== undefined) {
      player.heldFish = data.heldFish;
    }
  }

  /**
   * Get the full room state (all players).
   * @returns {{ name: string, players: object[], playerCount: number, maxPlayers: number }}
   */
  getState() {
    return {
      name: this.name,
      players: Array.from(this.players.values()),
      playerCount: this.players.size,
      maxPlayers: MAX_PLAYERS,
    };
  }

  /**
   * Broadcast an event to all players in the room.
   * @param {string} event
   * @param {*} data
   * @param {import('socket.io').Socket} [excludeSocket] - Socket to exclude
   */
  broadcast(event, data, excludeSocket = null) {
    for (const [socketId, socket] of this.sockets) {
      if (excludeSocket && socketId === excludeSocket.id) continue;
      socket.emit(event, data);
    }
  }
}
