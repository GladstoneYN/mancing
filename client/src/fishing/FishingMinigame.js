/**
 * FishingMinigame — Stardew Valley–style fishing mechanic.
 *
 * A DOM-based overlay with a vertical bar, a bouncing fish icon,
 * a player-controlled green zone, and a progress meter. The zone has
 * satisfying physics (momentum, gravity, bounce). Fish AI varies by
 * behavior type. Progress fills when the fish is inside the zone and
 * drains when outside.
 */
import { FISHING } from '@/utils/Constants.js';
import { FishingRod } from '@/fishing/FishingRod.js';
import { getRarityColor, getRarityGlow, getFishDisplayName } from '@/fishing/FishData.js';
import { RARITIES } from '@shared/fishCatalog.js';
import { soundManager } from '@/utils/SoundManager.js';

const {
  BAR_HEIGHT,
  BASE_ZONE_HEIGHT,
  GRAVITY,
  THRUST,
  MAX_VELOCITY,
  BOUNCE_FACTOR,
  PROGRESS_FILL_RATE,
  PROGRESS_DRAIN_RATE,
} = FISHING;

const FISH_ICON_SIZE = 36;       // px — matches CSS
const BAR_INNER_HEIGHT = 400;    // usable pixel height (matches CSS height minus border, but we keep it == BAR_HEIGHT)
const RESULT_DISPLAY_MS = 2500;  // how long to show the result card

// ─── Fish AI helpers ─────────────────────────────────────────────────
function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ─────────────────────────────────────────────────────────────────────
export class FishingMinigame {
  /**
   * @param {HTMLElement} container — #fishing-container
   */
  constructor(container) {
    this.container = container;
  }

  /**
   * Start the mini-game and return a Promise that resolves to { caught: boolean }.
   *
   * @param {object} fishData — { id, name, emoji, rarity, behavior, difficulty, baseValue, minSize, maxSize, description }
   * @param {string} rodId    — e.g. 'bamboo_rod'
   * @param {string[]} [equippedTackleIds] — IDs of equipped tackles
   */
  start(fishData, rodId, equippedTackleIds = []) {
    return new Promise((resolve) => {
      // ── Rod setup ───────────────────────────────────────
      const rod = new FishingRod(rodId, equippedTackleIds);

      // ── Computed values ─────────────────────────────────
      const zoneHeight = rod.getZoneHeight(BASE_ZONE_HEIGHT);
      const maxFishY = BAR_HEIGHT - FISH_ICON_SIZE;
      const maxZoneY = BAR_HEIGHT - zoneHeight;

      this._reelSoundTimer = 0;

      // ── Game state ──────────────────────────────────────
      let zoneY = BAR_HEIGHT * 0.5 - zoneHeight / 2; // start in center
      let zoneVelocity = 0;
      let thrusting = false;
      let hasInteracted = false;

      let fishY = randomBetween(BAR_HEIGHT * 0.3, BAR_HEIGHT * 0.7);
      let fishVelocity = 0;
      let fishTargetY = fishY;
      let fishTargetTimer = randomBetween(1, 3);

      // For MIXED behavior: currently active sub-behavior
      let mixedBehavior = pickMixedBehavior();
      let mixedTimer = randomBetween(2, 4);

      let progress = 0.3; // start at 30%
      let running = true;
      let rafId = null;
      let lastTime = null;

      // ── Build DOM ───────────────────────────────────────
      this.container.classList.add('active');
      const overlay = this._buildDOM(fishData, zoneHeight);

      // Cache DOM references
      const fishEl = overlay.querySelector('.fishing-fish');
      const zoneEl = overlay.querySelector('.fishing-zone');
      const progressFill = overlay.querySelector('.fishing-progress-fill');
      const fishNameEl = overlay.querySelector('.fishing-fish-name');

      // Rarity colour glow on fish name
      if (fishNameEl) {
        fishNameEl.style.textShadow = getRarityGlow(fishData.rarity);
        fishNameEl.style.color = getRarityColor(fishData.rarity);
      }

      // ── Input handlers ──────────────────────────────────
      const onKeyDown = (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          thrusting = true;
          hasInteracted = true;
        }
      };
      const onKeyUp = (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          thrusting = false;
        }
      };
      const onMouseDown = (e) => {
        // Only left-click
        if (e.button === 0) {
          thrusting = true;
          hasInteracted = true;
        }
      };
      const onMouseUp = (e) => {
        if (e.button === 0) thrusting = false;
      };

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      overlay.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);

      // ── FISH AI: pick a new target ──────────────────────
      function pickMixedBehavior() {
        const opts = ['smooth', 'sinker', 'floater', 'dart'];
        return opts[Math.floor(Math.random() * opts.length)];
      }

      function pickFishTarget(behavior, difficulty) {
        switch (behavior) {
          case 'sinker':
            // 70% chance bottom third
            return Math.random() < 0.7
              ? randomBetween(0, maxFishY * 0.3)
              : randomBetween(0, maxFishY);

          case 'floater':
            // 70% chance top third
            return Math.random() < 0.7
              ? randomBetween(maxFishY * 0.7, maxFishY)
              : randomBetween(0, maxFishY);

          case 'dart':
            // Large jumps across the bar
            return randomBetween(0, maxFishY);

          case 'smooth':
          default:
            return randomBetween(maxFishY * 0.1, maxFishY * 0.9);
        }
      }

      function getFishSpeed(behavior, difficulty) {
        switch (behavior) {
          case 'dart':
            return 120 + difficulty * 1.5;
          case 'sinker':
          case 'floater':
            return 80 + difficulty * 1.0;
          case 'smooth':
          default:
            return 60 + difficulty * 0.8;
        }
      }

      function getTargetChangeInterval(behavior, difficulty) {
        const difficultyFactor = 1 - (difficulty / 150); // higher difficulty → shorter intervals
        switch (behavior) {
          case 'dart':
            return randomBetween(0.5, 1.5) * difficultyFactor + 0.3;
          case 'smooth':
            return randomBetween(1.5, 3.0) * difficultyFactor + 0.5;
          case 'sinker':
          case 'floater':
            return randomBetween(1.0, 2.5) * difficultyFactor + 0.4;
          default:
            return randomBetween(1.0, 3.0);
        }
      }

      // ── Game loop ───────────────────────────────────────
      const tick = (timestamp) => {
        if (!running) return;

        if (lastTime === null) {
          lastTime = timestamp;
          rafId = requestAnimationFrame(tick);
          return;
        }

        const rawDt = (timestamp - lastTime) / 1000;
        const dt = Math.min(rawDt, 0.05); // cap at 50ms to avoid spiral-of-death
        lastTime = timestamp;

        // ──── 1. Green zone physics ────────────────────────
        if (thrusting) {
          zoneVelocity += THRUST * dt;
        } else {
          zoneVelocity -= GRAVITY * dt;
        }

        // Clamp velocity
        zoneVelocity = clamp(zoneVelocity, -MAX_VELOCITY, MAX_VELOCITY);

        // Apply velocity
        zoneY += zoneVelocity * dt;

        // Bottom bounce
        if (zoneY <= 0) {
          zoneY = 0;
          if (rod.hasTackleEffect('noBounce')) {
            zoneVelocity = 0;
          } else {
            zoneVelocity = Math.abs(zoneVelocity) * BOUNCE_FACTOR;
          }
        }

        // Top clamp (no bounce at top — just stop)
        if (zoneY >= maxZoneY) {
          zoneY = maxZoneY;
          zoneVelocity = Math.min(zoneVelocity, 0);
        }

        // ──── 2. Fish AI ───────────────────────────────────
        // Determine active behavior (handle MIXED)
        let activeBehavior = fishData.behavior;
        if (fishData.behavior === 'mixed') {
          mixedTimer -= dt;
          if (mixedTimer <= 0) {
            mixedBehavior = pickMixedBehavior();
            mixedTimer = randomBetween(2, 4);
            // Also force a new target on behavior switch
            fishTargetY = pickFishTarget(mixedBehavior, fishData.difficulty);
            fishTargetTimer = getTargetChangeInterval(mixedBehavior, fishData.difficulty);
          }
          activeBehavior = mixedBehavior;
        }

        // Target change timer
        fishTargetTimer -= dt;
        if (fishTargetTimer <= 0) {
          fishTargetY = pickFishTarget(activeBehavior, fishData.difficulty);
          fishTargetTimer = getTargetChangeInterval(activeBehavior, fishData.difficulty);
        }

        // Move fish toward target
        const speed = getFishSpeed(activeBehavior, fishData.difficulty);
        const direction = fishTargetY - fishY;
        const absDist = Math.abs(direction);

        if (absDist > 1) {
          // Directional speed bias for sinker/floater
          let effectiveSpeed = speed;
          if (activeBehavior === 'sinker') {
            effectiveSpeed = direction < 0 ? speed * 1.4 : speed * 0.6;
          } else if (activeBehavior === 'floater') {
            effectiveSpeed = direction > 0 ? speed * 1.4 : speed * 0.6;
          }

          // Use a spring-like approach: accelerate toward target, with damping
          const maxStep = effectiveSpeed * dt;
          if (absDist < maxStep) {
            fishY = fishTargetY;
          } else {
            fishY += Math.sign(direction) * maxStep;
          }
        }

        // Add micro-jitter for dart behavior (keeps it feeling alive)
        if (activeBehavior === 'dart') {
          fishY += (Math.random() - 0.5) * fishData.difficulty * 0.04;
        }

        fishY = clamp(fishY, 0, maxFishY);

        // ──── 3. Progress ──────────────────────────────────
        const fishCenter = fishY + FISH_ICON_SIZE / 2;
        const zoneTop = zoneY + zoneHeight;
        const fishInZone = fishCenter >= zoneY && fishCenter <= zoneTop;

        if (fishInZone) {
          let fillRate = PROGRESS_FILL_RATE;
          const fastFillVal = rod.getTackleValue('fastFill');
          if (fastFillVal !== null) {
            fillRate *= (1 + fastFillVal);
          }
          progress += fillRate * dt;

          if (hasInteracted) {
            this._reelSoundTimer -= dt;
            if (this._reelSoundTimer <= 0) {
              soundManager.playReelClick();
              this._reelSoundTimer = 0.08;
            }
          }
        } else {
          let drainRate = PROGRESS_DRAIN_RATE;
          drainRate *= rod.getDrainMultiplier();
          const slowDrainVal = rod.getTackleValue('slowDrain');
          if (slowDrainVal !== null) {
            drainRate *= slowDrainVal;
          }
          if (!hasInteracted) {
            drainRate *= 0.15; // Slow drain before player moves
          }
          progress -= drainRate * dt;
          this._reelSoundTimer = 0;
        }

        progress = clamp(progress, 0, 1);

        // ──── 4. Visual updates ────────────────────────────
        // Fish position (bottom-up)
        fishEl.style.bottom = `${fishY}px`;

        // Zone position
        zoneEl.style.bottom = `${zoneY}px`;
        zoneEl.style.height = `${zoneHeight}px`;

        // Zone state classes
        if (fishInZone) {
          zoneEl.classList.add('capturing');
          fishEl.classList.add('in-zone');
        } else {
          zoneEl.classList.remove('capturing');
          fishEl.classList.remove('in-zone');
        }

        // Progress bar
        const progressPct = progress * 100;
        progressFill.style.height = `${progressPct}%`;

        // Progress state classes
        progressFill.classList.toggle('draining', progress < 0.5 && !fishInZone);
        progressFill.classList.toggle('critical', progress < 0.2);

        // ──── 5. Win / lose check ──────────────────────────
        if (progress >= 1.0) {
          endGame(true);
          return;
        }
        if (progress <= 0.0) {
          endGame(false);
          return;
        }

        rafId = requestAnimationFrame(tick);
      };

      // ── End game ────────────────────────────────────────
      const endGame = (caught) => {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);

        // Remove input listeners
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        overlay.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mouseup', onMouseUp);

        // Remove the game overlay
        overlay.remove();

        if (caught) {
          // Resolve immediately for caught fish (so main.js handles server data presentation)
          this.container.classList.remove('active');
          resolve({ caught: true });
        } else {
          soundManager.playLost();
          // Show escaped result screen
          this._showResult(fishData, false, () => {
            this.container.classList.remove('active');
            resolve({ caught: false });
          });
        }
      };

      // ── Start the loop ──────────────────────────────────
      rafId = requestAnimationFrame(tick);
    });
  }

  // ─── DOM builders ─────────────────────────────────────────────────

  /**
   * Build the game DOM overlay and append it to this.container.
   * Returns the overlay element.
   */
  _buildDOM(fishData, zoneHeight) {
    const overlay = document.createElement('div');
    overlay.className = 'fishing-overlay';

    const rarityData = RARITIES[fishData.rarity] || RARITIES.COMMON;
    const difficultyPct = clamp((fishData.difficulty / 110) * 100, 0, 100);

    overlay.innerHTML = `
      <div class="fishing-game">
        <!-- Main fishing bar -->
        <div class="fishing-bar-container">
          <div class="fishing-bar-bg"></div>
          <div class="fishing-bar-waves"></div>
          <div class="fishing-fish" style="bottom: ${BAR_HEIGHT * 0.5}px">${fishData.emoji}</div>
          <div class="fishing-zone" style="bottom: ${BAR_HEIGHT * 0.5 - zoneHeight / 2}px; height: ${zoneHeight}px"></div>
        </div>

        <!-- Progress bar -->
        <div class="fishing-progress-container">
          <div class="fishing-progress-fill" style="height: 30%"></div>
          <div class="fishing-progress-marker" style="bottom: 100%"></div>
        </div>

        <!-- Info panel -->
        <div class="fishing-info">
          <div class="fishing-fish-name">${fishData.emoji} ${fishData.name}</div>
          <span class="fishing-fish-rarity tag tag-${fishData.rarity.toLowerCase()}">${rarityData.name}</span>
          <div class="fishing-difficulty">
            Difficulty
            <div class="fishing-difficulty-bar">
              <div class="fishing-difficulty-fill" style="width: ${difficultyPct}%; background: ${this._getDifficultyColor(difficultyPct)}"></div>
            </div>
          </div>
          <div class="fishing-hint">
            Hold <kbd>SPACE</kbd> or <kbd>CLICK</kbd><br>to move the bar up
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(overlay);
    return overlay;
  }

  /**
   * Return a colour that shifts from green → yellow → red based on difficulty %.
   */
  _getDifficultyColor(pct) {
    if (pct < 35) return '#7dcea0';  // green
    if (pct < 55) return '#f0c674';  // gold
    if (pct < 75) return '#f4a460';  // orange
    return '#e57373';                // red
  }

  /**
   * Show the result screen after the mini-game ends.
   * @param {object} fishData
   * @param {boolean} caught
   * @param {Function} onDismiss — called after the result is dismissed
   */
  _showResult(fishData, caught, onDismiss) {
    const result = document.createElement('div');
    result.className = 'fishing-result';

    const rarityClass = `rarity-${fishData.rarity.toLowerCase()}`;
    const rarityData = RARITIES[fishData.rarity] || RARITIES.COMMON;

    if (caught) {
      // Generate a random size in the fish's range
      const size = randomBetween(fishData.minSize, fishData.maxSize);
      const sizeStr = `${size.toFixed(1)} cm`;
      const valueStr = `${fishData.baseValue.toLocaleString()} 🪙`;

      result.innerHTML = `
        <div class="fishing-result-backdrop"></div>
        <div class="fishing-result-card glass-elevated ${rarityClass}">
          ${this._buildSparkles(rarityData.color)}
          <div class="fishing-result-emoji">${fishData.emoji}</div>
          <div class="fishing-result-title caught">🎉 Caught!</div>
          <div class="fishing-result-fish-name" style="color: ${rarityData.color}">${fishData.name}</div>
          <span class="tag tag-${fishData.rarity.toLowerCase()}" style="margin: 6px auto">${rarityData.name}</span>
          <div class="fishing-result-details">
            <div class="fishing-result-detail">
              <span class="fishing-result-detail-value">${sizeStr}</span>
              <span class="fishing-result-detail-label">Size</span>
            </div>
            <div class="fishing-result-detail">
              <span class="fishing-result-detail-value">${valueStr}</span>
              <span class="fishing-result-detail-label">Value</span>
            </div>
          </div>
          <div class="fishing-result-desc">"${fishData.description}"</div>
        </div>
      `;
    } else {
      result.innerHTML = `
        <div class="fishing-result-backdrop"></div>
        <div class="fishing-result-card glass-elevated">
          <div class="fishing-result-emoji">💨</div>
          <div class="fishing-result-title escaped">It got away...</div>
          <div class="fishing-result-desc" style="margin-top: 8px">The ${fishData.name} slipped off the hook.</div>
        </div>
      `;
    }

    this.container.appendChild(result);

    // Dismiss logic
    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      window.removeEventListener('keydown', dismissOnKey);
      window.removeEventListener('mousedown', dismissOnClick);
      if (autoTimer) clearTimeout(autoTimer);
      result.remove();
      onDismiss();
    };

    const dismissOnKey = () => dismiss();
    const dismissOnClick = () => dismiss();

    // Small delay before accepting dismiss input (prevent accidental dismiss)
    setTimeout(() => {
      window.addEventListener('keydown', dismissOnKey);
      window.addEventListener('mousedown', dismissOnClick);
    }, 300);

    const autoTimer = setTimeout(dismiss, RESULT_DISPLAY_MS);
  }

  /**
   * Build sparkle particle HTML (decorative, for caught screen).
   */
  _buildSparkles(color) {
    let html = '<div class="sparkle-container">';
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const size = 4 + Math.random() * 6;
      const delay = Math.random() * 0.8;
      html += `<div class="sparkle" style="
        left: ${x}%;
        top: ${y}%;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        animation-delay: ${delay}s;
      "></div>`;
    }
    html += '</div>';
    return html;
  }
}
