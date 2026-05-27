import { RARITIES } from '@shared/fishCatalog.js';
import { getRarityColor, getRarityGlow } from '@/fishing/FishData.js';

export class FishRevealWindow {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {object} catchData — server response from FISH_RESULT
   * @param {Function} onDismiss — callback when window is closed
   */
  constructor(container, catchData, onDismiss) {
    this.container = container;
    this.data = catchData;
    this.onDismiss = onDismiss;

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'fish-reveal-overlay';

    const { fish, size, value, isNewRecord, isFirstCatch } = this.data;
    const rarityData = RARITIES[fish.rarity] || RARITIES.COMMON;
    const color = getRarityColor(fish.rarity);
    const glow = getRarityGlow(fish.rarity);

    let badgesHtml = '';
    if (isNewRecord) {
      badgesHtml += `<span class="reveal-badge badge-record">👑 New Record!</span>`;
    }
    if (isFirstCatch) {
      badgesHtml += `<span class="reveal-badge badge-first">✨ First Catch!</span>`;
    }

    this.el.innerHTML = `
      <div class="fish-reveal-panel glass-elevated rarity-${fish.rarity.toLowerCase()}">
        <div class="reveal-glow-bg" style="background: radial-gradient(circle, ${color}33 0%, transparent 70%)"></div>
        
        <div class="reveal-header">
          <span class="reveal-emoji">${fish.emoji}</span>
          <h2 class="reveal-title" style="color: ${color}; text-shadow: ${glow}">${fish.name}</h2>
          <span class="tag tag-${fish.rarity.toLowerCase()}">${rarityData.name}</span>
        </div>

        ${badgesHtml ? `<div class="reveal-badges">${badgesHtml}</div>` : ''}

        <div class="reveal-body">
          <div class="reveal-stat-card">
            <span class="reveal-stat-label">Length</span>
            <span class="reveal-stat-value">${size.toFixed(1)} cm</span>
          </div>
          <div class="reveal-stat-card">
            <span class="reveal-stat-label">Market Value</span>
            <span class="reveal-stat-value">💰 ${value} 🪙</span>
          </div>
          
          <div class="reveal-description">
            <p>"${fish.description}"</p>
          </div>
          
          <div class="reveal-help-text">
            Added to inventory. Bring it to the Fish Shop to sell!
          </div>
        </div>

        <div class="reveal-footer">
          <button class="btn btn-primary btn-dismiss">Awesome!</button>
        </div>
      </div>
    `;

    this.container.appendChild(this.el);

    // Dismiss on button click
    const dismissBtn = this.el.querySelector('.btn-dismiss');
    dismissBtn.addEventListener('click', () => this.destroy());

    // Also support keyboard dismiss
    this._keyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        this.destroy();
      }
    };
    window.addEventListener('keydown', this._keyHandler);
  }

  destroy() {
    window.removeEventListener('keydown', this._keyHandler);
    this.el.classList.add('fade-out');
    this.el.addEventListener('animationend', () => {
      this.el.remove();
      this.onDismiss();
    });
  }
}
