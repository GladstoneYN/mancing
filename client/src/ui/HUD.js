/**
 * HUD — Top-left heads-up display showing player name, coins, and equipped rod.
 * Coin display has a spring "bump" animation when the value changes.
 */
import { getRodById } from '@shared/fishCatalog.js';
import { soundManager } from '../utils/SoundManager.js';

export class HUD {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {{ username: string, coins: number, equippedRod?: string }} playerData
   * @param {object} [options] — callbacks
   * @param {Function} [options.onOpenJournal] — callback to open the collection log book
   */
  constructor(container, playerData, options = {}) {
    this.container = container;
    this._listeners = [];
    this._bumpTimeout = null;
    this.onOpenJournal = options.onOpenJournal;

    this._build(playerData);
    this.container.appendChild(this.el);
  }

  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  // ─── DOM Construction ──────────────────────────────────
  _build(data) {
    this.el = document.createElement('div');
    this.el.className = 'hud glass';

    // Player name
    const nameItem = this._createItem();
    const nameIcon = document.createElement('span');
    nameIcon.className = 'hud-icon';
    nameIcon.textContent = '🧑';
    const nameText = document.createElement('span');
    nameText.className = 'hud-player-name';
    nameText.textContent = data.username || 'Player';
    nameItem.appendChild(nameIcon);
    nameItem.appendChild(nameText);
    this.el.appendChild(nameItem);

    // Separator
    this.el.appendChild(this._createSeparator());

    // Coins
    const coinsItem = this._createItem();
    const coinsIcon = document.createElement('span');
    coinsIcon.className = 'hud-icon';
    coinsIcon.textContent = '💰';
    this.coinsEl = document.createElement('span');
    this.coinsEl.className = 'hud-coins';
    this.coinsEl.textContent = this._formatCoins(data.coins || 0);
    coinsItem.appendChild(coinsIcon);
    coinsItem.appendChild(this.coinsEl);
    this.el.appendChild(coinsItem);

    // Separator
    this.el.appendChild(this._createSeparator());

    // Rod
    const rodItem = this._createItem();
    const rodIcon = document.createElement('span');
    rodIcon.className = 'hud-icon';
    rodIcon.textContent = '🎣';
    this.rodEl = document.createElement('span');
    this.rodEl.className = 'hud-rod';
    const rod = getRodById(data.equippedRod || 'bamboo_rod');
    this.rodEl.textContent = rod ? rod.name : 'Bamboo Rod';
    rodItem.appendChild(rodIcon);
    rodItem.appendChild(this.rodEl);
    this.el.appendChild(rodItem);

    // Separator
    this.el.appendChild(this._createSeparator());

    // Weather
    const weatherItem = this._createItem();
    this.weatherEl = document.createElement('span');
    this.weatherEl.className = 'hud-weather';
    this.weatherEl.textContent = '☀️ Sunny';
    weatherItem.appendChild(this.weatherEl);
    this.el.appendChild(weatherItem);
 
    // Separator
    this.el.appendChild(this._createSeparator());

    // Time
    const timeItem = this._createItem();
    const timeIcon = document.createElement('span');
    timeIcon.className = 'hud-icon';
    timeIcon.textContent = '⏰';
    this.timeEl = document.createElement('span');
    this.timeEl.className = 'hud-time';
    this.timeEl.textContent = '06:00 AM';
    timeItem.appendChild(timeIcon);
    timeItem.appendChild(this.timeEl);
    this.el.appendChild(timeItem);

    // Separator
    this.el.appendChild(this._createSeparator());

    // Book button (clickable Journal icon)
    const bookItem = this._createItem();
    const bookBtn = document.createElement('button');
    bookBtn.className = 'hud-book-btn';
    bookBtn.innerHTML = '📖 <span class="hud-book-lbl">Journal</span>';
    bookBtn.title = 'Open Specimen Journal';
    this._on(bookBtn, 'click', () => {
      if (this.onOpenJournal) this.onOpenJournal();
    });
    bookItem.appendChild(bookBtn);
    this.el.appendChild(bookItem);

    // Separator
    this.el.appendChild(this._createSeparator());

    // Mute button
    const muteItem = this._createItem();
    const muteBtn = document.createElement('button');
    muteBtn.className = 'hud-mute-btn';
    
    const updateMuteIcon = () => {
      muteBtn.innerHTML = soundManager.muted 
        ? '🔇 <span class="hud-book-lbl">Muted</span>' 
        : '🔊 <span class="hud-book-lbl">Mute</span>';
      muteBtn.title = soundManager.muted ? 'Unmute Audio' : 'Mute Audio';
    };
    updateMuteIcon();

    this._on(muteBtn, 'click', () => {
      soundManager.toggleMute();
      updateMuteIcon();
      if (!soundManager.muted) {
        soundManager.playClick();
      }
    });
    muteItem.appendChild(muteBtn);
    this.el.appendChild(muteItem);
  }

  _createItem() {
    const item = document.createElement('div');
    item.className = 'hud-item';
    return item;
  }

  _createSeparator() {
    const sep = document.createElement('div');
    sep.className = 'hud-separator';
    return sep;
  }

  _formatCoins(amount) {
    return Number(amount).toLocaleString();
  }

  // ─── Public API ────────────────────────────────────────
  /**
   * Update coin display with bump animation.
   * @param {number} amount — new total coin balance
   */
  updateCoins(amount) {
    this.coinsEl.textContent = this._formatCoins(amount);

    // Trigger bump animation
    this.coinsEl.classList.add('bump');
    if (this._bumpTimeout) clearTimeout(this._bumpTimeout);
    this._bumpTimeout = setTimeout(() => {
      this.coinsEl.classList.remove('bump');
      this._bumpTimeout = null;
    }, 250);
  }

  /**
   * Update the equipped rod display.
   * @param {string} rodId — rod ID from RODS catalog
   */
  updateRod(rodId) {
    const rod = getRodById(rodId);
    this.rodEl.textContent = rod ? rod.name : rodId;
  }

  /**
   * Update the weather display.
   * @param {string} weather — sunny or rainy
   */
  updateWeather(weather) {
    if (!this.weatherEl) return;
    this.weatherEl.textContent = weather === 'rainy' ? '🌧️ Rainy' : '☀️ Sunny';
  }

  /**
   * Update the digital clock display.
   * @param {number} timeOfDay — float between 0 and 24
   */
  updateTime(timeOfDay) {
    if (!this.timeEl) return;
    const totalMinutes = Math.floor(timeOfDay * 60);
    let hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour should be 12
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    const hoursStr = hours < 10 ? '0' + hours : hours;
    this.timeEl.textContent = `${hoursStr}:${minutesStr} ${ampm}`;
  }

  destroy() {
    if (this._bumpTimeout) clearTimeout(this._bumpTimeout);
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.el.remove();
  }
}
