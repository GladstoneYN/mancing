/**
 * main.js — Game Entry Point
 * Orchestrates all subsystems: auth, 3D world, networking, UI, fishing.
 */
import './styles/index.css';
import './styles/ui.css';
import './styles/fishing.css';

import { EVENTS } from '@shared/events.js';
import { Storage } from './utils/Storage.js';
import { SERVER_URL } from './utils/Constants.js';

import { GameLoop } from './game/GameLoop.js';
import { World } from './game/World.js';
import { Player } from './game/Player.js';
import { RemotePlayer } from './game/RemotePlayer.js';
import { CameraController } from './game/Camera.js';
import { InputManager } from './game/InputManager.js';
import { FishingSpot } from './game/FishingSpot.js';

import { FishingMinigame } from './fishing/FishingMinigame.js';

import { LoginScreen } from './ui/LoginScreen.js';
import { CharacterCreator } from './ui/CharacterCreator.js';
import { ChatPanel } from './ui/ChatPanel.js';
import { HUD } from './ui/HUD.js';
import { Inventory } from './ui/Inventory.js';
import { Shop } from './ui/Shop.js';
import { Notification } from './ui/Notification.js';
import { FishRevealWindow } from './ui/FishRevealWindow.js';

import { SocketManager } from './network/SocketManager.js';
import { NetSync } from './network/NetSync.js';
import { soundManager } from './utils/SoundManager.js';
import { EmoteWheel } from './ui/EmoteWheel.js';
import { CollectionLog } from './ui/CollectionLog.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.uiContainer = document.getElementById('ui-container');
    this.fishingContainer = document.getElementById('fishing-container');
    this.notificationContainer = document.getElementById('notification-container');

    // State
    this.remotePlayers = new Map();
    this.fishingSpots = [];
    this.playerData = null;
    this.isFishing = false;
    this.interactPromptEl = null;

    // Systems (initialized in startGame)
    this.world = null;
    this.player = null;
    this.camera = null;
    this.input = null;
    this.gameLoop = null;
    this.socket = null;
    this.netSync = null;
    this.fishingMinigame = null;

    // UI
    this.loginScreen = null;
    this.characterCreator = null;
    this.chatPanel = null;
    this.hud = null;
    this.inventory = null;
    this.collectionLog = null;
  }

  // ─── Boot ────────────────────────────────────────────
  async init() {
    // Disable browser right-click context menu
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Lazy init AudioContext on user interaction to unlock Web Audio
    const initAudio = () => {
      soundManager.init();
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('keydown', initAudio);

    const session = Storage.getSession();
    if (session?.token) {
      try {
        const res = await fetch(`${SERVER_URL}/api/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: session.token }),
        });
        const data = await res.json();
        if (data.valid) {
          this.playerData = data.player;
          Storage.saveSession(session.token, data.player);
          this.startGame();
          return;
        }
      } catch (e) {
        console.warn('Session verification failed:', e);
      }
      Storage.clearSession();
    }
    this.showLogin();
  }

  // ─── Auth Screens ────────────────────────────────────
  showLogin() {
    this.loginScreen = new LoginScreen(this.uiContainer, {
      onLogin: async (username, password, rememberMe) => {
        try {
          const res = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          Storage.saveSession(data.token, data.player, rememberMe);
          this.playerData = data.player;
          this.loginScreen.destroy();
          this.loginScreen = null;
          this.startGame();
        } catch (e) {
          this.loginScreen.showError(e.message);
        }
      },
      onRegister: () => {
        this.loginScreen.destroy();
        this.loginScreen = null;
        this.showCharacterCreator();
      },
    });
  }

  showCharacterCreator() {
    this.characterCreator = new CharacterCreator(this.uiContainer, {
      onComplete: async (username, password, appearance) => {
        try {
          const res = await fetch(`${SERVER_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, appearance }),
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error);
          Storage.saveSession(data.token, data.player, true);
          this.playerData = data.player;
          this.characterCreator.destroy();
          this.characterCreator = null;
          this.startGame();
        } catch (e) {
          this.characterCreator.showError(e.message);
        }
      },
      onBack: () => {
        this.characterCreator.destroy();
        this.characterCreator = null;
        this.showLogin();
      },
    });
  }

  // ─── Game Initialization ─────────────────────────────
  startGame() {
    // 3D World
    this.world = new World(this.canvas);
    this.camera = new CameraController(this.world.camera, this.canvas);
    this.input = new InputManager(this.canvas);

    // Local player
    this.player = new Player(this.world.scene, this.playerData);

    // Fishing spots
    this.fishingSpots = FishingSpot.createAll(this.world.scene);

    // Fishing mini-game
    this.fishingMinigame = new FishingMinigame(this.fishingContainer);

    // Networking
    this.socket = new SocketManager(Storage.getToken());
    this.netSync = new NetSync(this.socket, this.player);
    this.setupNetworkEvents();

    // UI
    this.chatPanel = new ChatPanel(this.uiContainer, this.socket);
    this.hud = new HUD(this.uiContainer, this.playerData, {
      onOpenJournal: () => {
        if (this.collectionLog) {
          this.collectionLog.destroy();
          this.collectionLog = null;
          soundManager.playClick();
        } else {
          this.collectionLog = new CollectionLog(this.uiContainer, this.playerData, () => {
            this.collectionLog = null;
          });
          soundManager.playClick();
        }
      }
    });
    this.inventory = new Inventory(this.uiContainer, this.playerData, this.socket);
    this.shop = new Shop(this.uiContainer, this.playerData, this.socket);

    // Game loop
    this.gameLoop = new GameLoop(
      (dt) => this.update(dt),
      () => this.render()
    );
    this.gameLoop.start();
  }

  // ─── Network Events ──────────────────────────────────
  setupNetworkEvents() {
    // Room state on connect
    this.socket.on(EVENTS.ROOM_STATE, (state) => {
      state.players.forEach((p) => {
        if (p.id !== this.playerData.id) {
          this.addRemotePlayer(p);
          const remote = this.remotePlayers.get(p.id);
          if (remote && p.heldFish) {
            remote.setHeldFish(p.heldFish);
          }
        }
      });
      if (state.chatHistory) {
        this.chatPanel.loadHistory(state.chatHistory);
      }
    });

    // Player join/leave
    this.socket.on(EVENTS.PLAYER_JOIN, (data) => {
      this.addRemotePlayer(data);
      Notification.show(this.notificationContainer, `${data.username} joined! 🎣`, 'info');
    });

    this.socket.on(EVENTS.PLAYER_LEAVE, (data) => {
      this.removeRemotePlayer(data.id);
      Notification.show(this.notificationContainer, `${data.username} left`, 'info');
    });

    // Position sync
    this.socket.on(EVENTS.PLAYER_SYNC, (data) => {
      const remote = this.remotePlayers.get(data.id);
      if (remote) {
        remote.setTarget(data.position, data.rotation, data.state);
        if (data.appearance) {
          remote.updateAppearance(data.appearance);
        }
        if (data.heldFish !== undefined) {
          remote.setHeldFish(data.heldFish);
        }
      }
    });

    // Chat
    this.socket.on(EVENTS.CHAT_MESSAGE, (data) => {
      this.chatPanel.addMessage(data);
      if (data.playerId !== this.playerData.id) {
        const remote = this.remotePlayers.get(data.playerId);
        if (remote) remote.showSpeechBubble(data.text);
      }
    });

    // Fishing — server says a fish bit
    this.socket.on(EVENTS.FISH_BITE, async (data) => {
      this.player.state = 'reeling';
      soundManager.playAlert();
      soundManager.playSplash();
      
      // Remove waiting indicator, start mini-game
      const result = await this.fishingMinigame.start(data.fish, this.playerData.equippedRod || 'bamboo_rod', this.playerData.equippedTackles || []);
      if (result.caught) {
        this.socket.emit(EVENTS.FISH_CATCH, { fishId: data.fish.id, spotId: data.spotId });
      } else {
        this.socket.emit(EVENTS.FISH_FAIL, { spotId: data.spotId });
        Notification.show(this.notificationContainer, 'The fish got away...', 'warning');
        this.isFishing = false;
        this.player.stopFishing();
      }
    });

    // Fishing — server confirms catch + awards
    this.socket.on(EVENTS.FISH_RESULT, (data) => {
      soundManager.playCatch();
      // Zoom camera on player
      this.camera.setZoomedIn(true, this.player.rotation);

      // Make player hold it in their hands
      this.player.showCaughtFish(data.fish);

      // Display detailed fish reveal window
      new FishRevealWindow(this.uiContainer, data, () => {
        this.camera.setZoomedIn(false);
        this.player.hideCaughtFish();
        this.isFishing = false;
        this.player.stopFishing();
      });

      this.hud.updateCoins(data.newBalance);
      this.shop.updateCoins(data.newBalance);
      this.inventory.updateCoins(data.newBalance);
      if (data.fishLog) {
        this.playerData.fishLog = data.fishLog;
      }
      if (data.inventory) {
        this.inventory.refresh(data.inventory);
        this.shop.refresh(data.inventory);
      }
    });

    // Inventory updates
    this.socket.on(EVENTS.INVENTORY_UPDATE, (data) => {
      // 1. First update the local playerData state cache
      if (data.coins !== undefined) {
        this.playerData.coins = data.coins;
      }
      if (data.equippedRod) {
        this.playerData.equippedRod = data.equippedRod;
      }
      if (data.appearance) {
        this.playerData.appearance = data.appearance;
        this.player.updateAppearance(data.appearance);
      }
      if (data.fishLog) {
        this.playerData.fishLog = data.fishLog;
      }
      if (data.inventory) {
        if (data.inventory.equippedBait) this.playerData.equippedBait = data.inventory.equippedBait;
        if (data.inventory.equippedTackles) this.playerData.equippedTackles = data.inventory.equippedTackles;
      }

      // 2. Then refresh all UI components using the updated playerData
      if (data.inventory) {
        this.inventory.refresh(data.inventory);
        this.shop.refresh(data.inventory);
        if (this.player && this.player.heldFish) {
          const stillHasFish = data.inventory.fish.some(f => f.id === this.player.heldFish.id);
          if (!stillHasFish) {
            this.player.setHeldFish(null);
          }
        }
      }
      if (data.coins !== undefined) {
        this.hud.updateCoins(data.coins);
        this.shop.updateCoins(data.coins);
        this.inventory.updateCoins(data.coins);
      }
      if (data.equippedRod) {
        this.hud.updateRod(data.equippedRod);
      }
    });

    // Other player showing fish
    this.socket.on(EVENTS.FISH_SHOW, (data) => {
      const remote = this.remotePlayers.get(data.playerId);
      if (remote) remote.showFishCatch(data.fish, data.size);
    });

    // Emotes sync from other players
    this.socket.on(EVENTS.PLAYER_EMOTE, (data) => {
      if (data.playerId !== this.playerData.id) {
        const remote = this.remotePlayers.get(data.playerId);
        if (remote) {
          remote.playEmote(data.emote);
        }
      }
    });

    // Weather Sync from server
    this.socket.on(EVENTS.WEATHER_SYNC, (data) => {
      if (this.world) {
        this.world.setWeather(data.weather);
      }
      if (this.hud) {
        this.hud.updateWeather(data.weather);
      }
      if (data.weather === 'rainy') {
        soundManager.startRainSound();
      } else {
        soundManager.stopRainSound();
      }
    });

    // Time Sync from server
    this.socket.on(EVENTS.TIME_SYNC, (data) => {
      if (this.world) {
        this.world.setTimeOfDay(data.timeOfDay);
      }
    });

    // Shop result
    this.socket.on(EVENTS.SHOP_RESULT, (data) => {
      if (data.error) {
        Notification.show(this.notificationContainer, data.error, 'danger');
        soundManager.playLost();
      } else {
        Notification.show(this.notificationContainer, data.message || 'Transaction successful!', 'success');
        if (data.action === 'buy') {
          soundManager.playUpgrade();
        } else {
          soundManager.playClick();
        }
        this.hud.updateCoins(data.newBalance);
        this.shop.updateCoins(data.newBalance);
        this.inventory.updateCoins(data.newBalance);
        if (data.inventory) {
          this.inventory.refresh(data.inventory);
          this.shop.refresh(data.inventory);
          if (this.player && this.player.heldFish) {
            const stillHasFish = data.inventory.fish.some(f => f.id === this.player.heldFish.id);
            if (!stillHasFish) {
              this.player.setHeldFish(null);
            }
          }
        }
        if (data.equippedRod) this.playerData.equippedRod = data.equippedRod;
      }
    });
  }

  // ─── Game Loop ───────────────────────────────────────
  update(dt) {
    this.input.update();

    // Toggle inventory
    if (this.input.wasPressed('KeyI') || this.input.wasPressed('Tab')) {
      if (this.shop.isOpen()) this.shop.close();
      this.inventory.setNearShop(this.isNearShop());
      this.inventory.toggle();
      soundManager.playClick();
    }

    // Chat focus
    if (this.input.wasPressed('Enter') && !this.chatPanel.isFocused()) {
      this.chatPanel.focus();
      return;
    }

    const uiCapturing = this.chatPanel.isFocused() || this.inventory.isOpen() || this.shop.isOpen() || !!this.emoteWheel;

    // Emote Wheel (hold Q)
    if (this.input.isDown('KeyQ') && !uiCapturing && !this.isFishing) {
      if (!this.emoteWheel) {
        this.emoteWheel = new EmoteWheel(this.uiContainer, (emoteId) => {
          this.socket.emit(EVENTS.PLAYER_EMOTE, { emote: emoteId });
          this.player.playEmote(emoteId);
        });
      }
    } else if (this.emoteWheel) {
      this.emoteWheel.trigger();
      this.emoteWheel = null;
    }

    // Fishing / Selling interaction
    if (this.input.wasPressed('KeyE') && !this.isFishing && !uiCapturing) {
      const spot = this.findNearbyFishingSpot();
      if (spot) {
        this.startFishing(spot);
      } else if (this.isNearShop()) {
        if (this.inventory.isOpen()) this.inventory.close();
        this.shop.toggle();
        soundManager.playClick();
      }
    }

    // Player movement (only when not fishing and UI is not capturing)
    if (!this.isFishing && !uiCapturing) {
      this.player.update(dt, this.input, this.world, this.camera);
    }

    // Remote players
    this.remotePlayers.forEach((rp) => rp.update(dt));

    // World animations (water, particles)
    this.world.update(dt);

    // Update HUD digital clock
    if (this.hud && this.world) {
      this.hud.updateTime(this.world.timeOfDay);
    }

    // Camera follow
    this.camera.update(this.player.position, this.player.rotation, dt);

    // Procedural bird chirps during sunny daytime (between 6 AM and 6 PM)
    if (this.world && this.world.timeOfDay >= 6.0 && this.world.timeOfDay <= 18.0 && this.world.weather !== 'rainy') {
      if (!this._birdChirpTimer) this._birdChirpTimer = 15 + Math.random() * 15;
      this._birdChirpTimer -= dt;
      if (this._birdChirpTimer <= 0) {
        soundManager.playBirdChirp();
        this._birdChirpTimer = 15 + Math.random() * 15;
      }
    }

    // Network sync
    this.netSync.update(dt);

    // Fishing spots glow
    this.fishingSpots.forEach((spot) => spot.update(dt));

    // Interaction prompt
    this.updateInteractPrompt();
  }

  render() {
    this.world.render(this.camera.getCamera());
  }

  // ─── Fishing ─────────────────────────────────────────
  findNearbyFishingSpot() {
    const pos = this.player.position;
    for (const spot of this.fishingSpots) {
      if (spot.isNearby(pos, 3.5)) return spot;
    }
    return null;
  }

  startFishing(spot) {
    this.isFishing = true;
    this.player.startFishing(spot.position);
    this.socket.emit(EVENTS.FISH_CAST, { spotId: spot.id });
    Notification.show(this.notificationContainer, 'Casting line... 🎣', 'info');
    soundManager.playCast();
    setTimeout(() => {
      if (this.isFishing) {
        soundManager.playSplash();
      }
    }, 600);
  }

  isNearShop() {
    if (!this.player) return false;
    const pos = this.player.position;
    const dx = pos.x - 15;
    const dz = pos.z - 10;
    return Math.sqrt(dx * dx + dz * dz) < 6.0;
  }

  // ─── Interaction Prompt ──────────────────────────────
  updateInteractPrompt() {
    const spot = this.findNearbyFishingSpot();
    if (spot && !this.isFishing) {
      if (this.interactPromptEl && this.interactPromptType !== 'fish') {
        this.interactPromptEl.remove();
        this.interactPromptEl = null;
      }
      if (!this.interactPromptEl) {
        this.interactPromptEl = document.createElement('div');
        this.interactPromptEl.className = 'interact-prompt glass';
        this.interactPromptEl.innerHTML = 'Press <kbd>E</kbd> to fish at <strong>' + spot.name + '</strong>';
        this.uiContainer.appendChild(this.interactPromptEl);
        this.interactPromptType = 'fish';
      }
    } else if (this.isNearShop() && !this.isFishing && !this.inventory.isOpen() && !this.shop.isOpen()) {
      if (this.interactPromptEl && this.interactPromptType !== 'shop') {
        this.interactPromptEl.remove();
        this.interactPromptEl = null;
      }
      if (!this.interactPromptEl) {
        this.interactPromptEl = document.createElement('div');
        this.interactPromptEl.className = 'interact-prompt glass';
        this.interactPromptEl.innerHTML = 'Press <kbd>E</kbd> to <strong>Open Shop / Sell Fish</strong>';
        this.uiContainer.appendChild(this.interactPromptEl);
        this.interactPromptType = 'shop';
      }
    } else if (this.interactPromptEl) {
      this.interactPromptEl.remove();
      this.interactPromptEl = null;
      this.interactPromptType = null;
    }
  }

  // ─── Remote Players ──────────────────────────────────
  addRemotePlayer(data) {
    if (this.remotePlayers.has(data.id)) return;
    const remote = new RemotePlayer(this.world.scene, data, this.canvas, this.fishingSpots);
    this.remotePlayers.set(data.id, remote);
  }

  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (remote) {
      remote.destroy();
      this.remotePlayers.delete(id);
    }
  }
}

// ─── Start ─────────────────────────────────────────────
const game = new Game();
window.game = game;
game.init();
