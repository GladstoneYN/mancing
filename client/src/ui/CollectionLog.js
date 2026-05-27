/**
 * CollectionLog — Book-themed modal overlay tracking caught specimens, sizes, and achievements.
 */
import { FISH, RARITIES } from '@shared/fishCatalog.js';
import { getRarityColor, getRarityGlow } from '@/fishing/FishData.js';

export class CollectionLog {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {object} playerData — cached local player data (with playerData.fishLog)
   * @param {Function} onDismiss — close callback
   */
  constructor(container, playerData, onDismiss) {
    this.container = container;
    this.playerData = playerData;
    this.onDismiss = onDismiss;

    this._listeners = [];
    this.selectedFish = null;
    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'collection-log-overlay';
    this._on(this.el, 'click', (e) => {
      if (e.target === this.el) this.destroy();
    });

    // Main Journal Panel
    const panel = document.createElement('div');
    panel.className = 'collection-log-panel glass-elevated';
    this._on(panel, 'click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'collection-log-header';
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 1.8rem;">📖</span>
        <h2 class="collection-log-title">Specimen Journal</h2>
      </div>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'inventory-close';
    closeBtn.textContent = '×';
    this._on(closeBtn, 'click', () => this.destroy());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Parse Catch History & Calculate Progress
    const logMap = new Map();
    if (this.playerData.fishLog && Array.isArray(this.playerData.fishLog)) {
      this.playerData.fishLog.forEach(row => {
        logMap.set(row.fish_id, row);
      });
    }

    const uniqueCaught = logMap.size;
    const totalSpecimens = FISH.length; // 19
    const completionPercent = Math.round((uniqueCaught / totalSpecimens) * 100);

    // Completion percentage bar
    const statsBar = document.createElement('div');
    statsBar.className = 'collection-stats-bar';
    statsBar.innerHTML = `
      <div class="collection-progress-text">
        <span>Completion Progress</span>
        <strong>${uniqueCaught} / ${totalSpecimens} (${completionPercent}%)</strong>
      </div>
      <div class="collection-progress-bg">
        <div class="collection-progress-fill" style="width: ${completionPercent}%; background: linear-gradient(90deg, var(--primary-dim) 0%, var(--primary) 100%);"></div>
      </div>
    `;
    panel.appendChild(statsBar);

    // Book Split Content
    const content = document.createElement('div');
    content.className = 'collection-log-content';

    // Left Page: specimen grid
    const leftPage = document.createElement('div');
    leftPage.className = 'collection-log-left';

    const grid = document.createElement('div');
    grid.className = 'collection-log-grid';

    FISH.forEach(spec => {
      const caughtRow = logMap.get(spec.id);
      const isCaught = !!caughtRow;

      const slot = document.createElement('div');
      slot.className = `collection-log-slot ${isCaught ? 'caught' : 'locked'}`;
      if (isCaught) {
        slot.style.borderColor = `${getRarityColor(spec.rarity)}44`;
        slot.innerHTML = `<span class="collection-slot-emoji">${spec.emoji}</span>`;
      } else {
        slot.innerHTML = `<span class="collection-slot-emoji locked-spec">❓</span>`;
      }

      this._on(slot, 'click', () => this.selectSpecimen(spec, caughtRow));
      grid.appendChild(slot);
    });

    leftPage.appendChild(grid);
    content.appendChild(leftPage);

    // Right Page: detail Spec Card
    this.rightPage = document.createElement('div');
    this.rightPage.className = 'collection-log-right';
    content.appendChild(this.rightPage);
    panel.appendChild(content);

    // Bottom Page: Achievements
    const achievementsSection = document.createElement('div');
    achievementsSection.className = 'collection-achievements';
    achievementsSection.innerHTML = `<h3 class="achievements-section-title">🏆 Angling Achievements</h3>`;

    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'achievements-badges';

    // Rarity groupings
    const checkRarityComplete = (rarity) => {
      const pool = FISH.filter(f => f.rarity === rarity);
      return pool.every(f => logMap.has(f.id));
    };

    const achievementsList = [
      { id: 'common',    name: 'Novice Angler',  desc: 'Catch all Common fish',      complete: checkRarityComplete('COMMON'),    emoji: '🟢' },
      { id: 'uncommon',  name: 'Expert Angler',  desc: 'Catch all Uncommon fish',    complete: checkRarityComplete('UNCOMMON'),  emoji: '🔵' },
      { id: 'rare',      name: 'Master Angler',  desc: 'Catch all Rare fish',        complete: checkRarityComplete('RARE'),      emoji: '🟣' },
      { id: 'epic',      name: 'Apex Fisher',    desc: 'Catch all Epic fish',        complete: checkRarityComplete('EPIC'),      emoji: '🟡' },
      { id: 'legendary', name: 'Abyss Walker',   desc: 'Catch all Legendary fish',   complete: checkRarityComplete('LEGENDARY'), emoji: '👑' },
      { id: 'perfect',   name: 'Perfect Catch',  desc: 'Catch all 19 unique fish',   complete: uniqueCaught === totalSpecimens,  emoji: '🏆' },
    ];

    achievementsList.forEach(ach => {
      const badge = document.createElement('div');
      badge.className = `achievement-badge ${ach.complete ? 'unlocked' : 'locked'}`;
      badge.title = `${ach.name}: ${ach.desc}`;
      badge.innerHTML = `
        <span class="achievement-badge-emoji">${ach.emoji}</span>
        <span class="achievement-badge-name">${ach.name.split(' ')[0]}</span>
      `;
      badgesContainer.appendChild(badge);
    });

    achievementsSection.appendChild(badgesContainer);
    panel.appendChild(achievementsSection);

    this.el.appendChild(panel);
    this.container.appendChild(this.el);

    // Initial Selection (First caught specimen, or first specimen in catalog if none)
    let initialSpec = FISH[0];
    let initialRow = logMap.get(initialSpec.id);
    for (const spec of FISH) {
      if (logMap.has(spec.id)) {
        initialSpec = spec;
        initialRow = logMap.get(spec.id);
        break;
      }
    }
    this.selectSpecimen(initialSpec, initialRow);

    // Esc dismiss support
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.destroy();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  selectSpecimen(spec, caughtRow) {
    // Highlight slot in grid
    const slots = this.el.querySelectorAll('.collection-log-slot');
    const index = FISH.findIndex(f => f.id === spec.id);
    slots.forEach((s, idx) => {
      s.classList.toggle('selected', idx === index);
    });

    this.selectedFish = spec;
    this.rightPage.innerHTML = '';

    const color = getRarityColor(spec.rarity);
    const glow = getRarityGlow(spec.rarity);

    if (caughtRow) {
      this.rightPage.innerHTML = `
        <div class="spec-detail-glow" style="background: radial-gradient(circle, ${color}1e 0%, transparent 70%);"></div>
        <div class="spec-header">
          <span class="spec-emoji-large">${spec.emoji}</span>
          <h3 class="spec-name" style="color: ${color}; text-shadow: ${glow};">${spec.name}</h3>
          <span class="tag tag-${spec.rarity.toLowerCase()}">${RARITIES[spec.rarity].name}</span>
        </div>

        <div class="spec-history">
          <div class="spec-stat-mini">
            <span class="spec-stat-lbl">Times Logged</span>
            <span class="spec-stat-val">${caughtRow.total_caught}</span>
          </div>
          <div class="spec-stat-mini">
            <span class="spec-stat-lbl">Largest Length</span>
            <span class="spec-stat-val">${caughtRow.largest_size.toFixed(1)} cm</span>
          </div>
        </div>

        <div class="spec-info-card">
          <div class="spec-info-row">
            <span>Size Range</span>
            <strong>${spec.minSize} - ${spec.maxSize} cm</strong>
          </div>
          <div class="spec-info-row">
            <span>Base Value</span>
            <strong>💰 ${spec.baseValue} 🪙</strong>
          </div>
          <div class="spec-info-row">
            <span>Movement Type</span>
            <strong style="text-transform: capitalize;">${spec.behavior}</strong>
          </div>
        </div>

        <div class="spec-description">
          <p>"${spec.description}"</p>
        </div>
      `;
    } else {
      this.rightPage.innerHTML = `
        <div class="spec-header locked-card">
          <span class="spec-emoji-large locked-spec">❓</span>
          <h3 class="spec-name" style="color: var(--text-muted);">Undiscovered Specimen</h3>
          <span class="tag tag-common">Unknown</span>
        </div>

        <div class="spec-locked-prompt">
          <p>You have not logged this species in your journal yet.</p>
          <div style="font-size: var(--text-xs); color: var(--text-muted); line-height: 1.5; margin-top: var(--sp-md);">
            💡 <em>Hint: Rarity: ${RARITIES[spec.rarity].name}. Try utilizing higher tier rods, specific tackles, or casting into premium spots when it rains!</em>
          </div>
        </div>
      `;
    }
  }

  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  destroy() {
    document.removeEventListener('keydown', this._keyHandler);
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.el.classList.add('fade-out');
    this.el.addEventListener('animationend', () => {
      this.el.remove();
      if (this.onDismiss) this.onDismiss();
    });
  }
}
