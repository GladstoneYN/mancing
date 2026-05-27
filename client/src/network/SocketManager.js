/**
 * SocketManager — manages the socket.io connection to the game server.
 */
import { io } from 'socket.io-client';
import { SERVER_URL } from '@/utils/Constants.js';

export class SocketManager {
  /**
   * @param {string} token — JWT auth token
   */
  constructor(token) {
    this._connected = false;

    this.socket = io(SERVER_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      transports: ['websocket', 'polling'],
    });

    // ─── Background Keep-Alive Worker ────────────────────
    // Prevents browser tab sleep/throttling from killing the socket connection when AFK
    const workerCode = `
      let timer = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(() => {
            self.postMessage('ping');
          }, 15000);
        } else if (e.data === 'stop') {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.workerUrl = URL.createObjectURL(blob);
    this.worker = new Worker(this.workerUrl);

    this.worker.onmessage = () => {
      if (this.socket && this._connected) {
        this.socket.emit('keepalive');
        // Fetch to keep HTTP traffic active as well
        const pingUrl = SERVER_URL ? `${SERVER_URL}/api/ping` : '/api/ping';
        fetch(pingUrl).catch(() => {});
      }
    };

    // ─── Connection lifecycle ────────────────────────────
    this.socket.on('connect', () => {
      this._connected = true;
      console.log(`[Socket] Connected — id: ${this.socket.id}`);
      if (this.worker) this.worker.postMessage('start');
    });

    this.socket.on('disconnect', (reason) => {
      this._connected = false;
      console.warn(`[Socket] Disconnected — ${reason}`);
      if (this.worker) this.worker.postMessage('stop');
    });

    this.socket.on('connect_error', (err) => {
      console.error(`[Socket] Connection error — ${err.message}`);
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log(`[Socket] Reconnected after ${attempt} attempt(s)`);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log(`[Socket] Reconnection attempt #${attempt}`);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('[Socket] Reconnection failed — giving up');
    });
  }

  /**
   * Register an event handler.
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    this.socket.on(event, handler);
    return this; // allow chaining
  }

  /**
   * Remove a specific event handler.
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    this.socket.off(event, handler);
    return this;
  }

  /**
   * Emit an event to the server.
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    this.socket.emit(event, data);
    return this;
  }

  /**
   * Whether the socket is currently connected.
   */
  isConnected() {
    return this._connected;
  }

  /**
   * Disconnect and remove all listeners.
   */
  destroy() {
    if (this.worker) {
      this.worker.postMessage('stop');
      this.worker.terminate();
      this.worker = null;
    }
    if (this.workerUrl) {
      URL.revokeObjectURL(this.workerUrl);
      this.workerUrl = null;
    }
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this._connected = false;
    console.log('[Socket] Destroyed');
  }
}
