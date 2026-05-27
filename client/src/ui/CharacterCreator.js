/**
 * CharacterCreator — Two-step registration: credentials → appearance customization.
 * Live avatar preview updates as user picks body color, hat, and accessory.
 */
import { BODY_COLORS, COSMETICS, DEFAULT_APPEARANCE } from '@shared/fishCatalog.js';

const HATS = COSMETICS.filter(c => c.type === 'hat');
const ACCESSORIES = COSMETICS.filter(c => c.type === 'accessory');

// Simple emoji mapping for hat preview
const HAT_EMOJI = {
  beanie: '🧶', bucket_hat: '🎩', cowboy_hat: '🤠',
  witch_hat: '🧙', crown: '👑', party_hat: '🥳',
};

export class CharacterCreator {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {{ onComplete(username, password, appearance): void, onBack(): void }} callbacks
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this._listeners = [];

    // State
    this.step = 1;
    this.username = '';
    this.password = '';
    this.appearance = { ...DEFAULT_APPEARANCE };

    this._build();
    this.container.appendChild(this.el);
  }

  // ─── DOM Construction ──────────────────────────────────
  _build() {
    // Overlay
    this.el = document.createElement('div');
    this.el.className = 'login-overlay';

    // Card
    this.card = document.createElement('div');
    this.card.className = 'creator-card glass-elevated';
    this.el.appendChild(this.card);

    // Title
    this.titleEl = document.createElement('h1');
    this.titleEl.className = 'creator-title';
    this.titleEl.textContent = '✨ Create Your Character';
    this.card.appendChild(this.titleEl);

    // Error area
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'login-error';
    this.errorEl.style.display = 'none';
    this.card.appendChild(this.errorEl);

    // Step 1: Credentials
    this._buildStep1();
    // Step 2: Appearance (hidden)
    this._buildStep2();

    this._showStep(1);
  }

  _buildStep1() {
    this.step1 = document.createElement('div');
    this.step1.className = 'login-form';

    const step1Label = document.createElement('span');
    step1Label.className = 'creator-label';
    step1Label.textContent = 'Choose your name & password';
    this.step1.appendChild(step1Label);

    this.usernameInput = this._createInput('Username (3–16 chars)', 'text');
    this.passwordInput = this._createInput('Password (4+ chars)', 'password');

    this.step1.appendChild(this.usernameInput);
    this.step1.appendChild(this.passwordInput);

    // Buttons
    const btns = document.createElement('div');
    btns.className = 'creator-buttons';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.type = 'button';
    backBtn.textContent = '← Back';
    this._on(backBtn, 'click', () => this.callbacks.onBack());

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn';
    nextBtn.type = 'button';
    nextBtn.textContent = 'Next →';
    this._on(nextBtn, 'click', () => this._goToStep2());

    btns.appendChild(backBtn);
    btns.appendChild(nextBtn);
    this.step1.appendChild(btns);

    this.card.appendChild(this.step1);
  }

  _buildStep2() {
    this.step2 = document.createElement('div');
    this.step2.style.display = 'none';

    // ─── Preview ─────────────────────────────────
    this.previewContainer = document.createElement('div');
    this.previewContainer.className = 'creator-preview';
    this._buildPreview();
    this.step2.appendChild(this.previewContainer);

    // ─── Body Color ──────────────────────────────
    const colorSection = document.createElement('div');
    colorSection.className = 'creator-section';

    const colorLabel = document.createElement('span');
    colorLabel.className = 'creator-label';
    colorLabel.textContent = '🎨 Body Color';
    colorSection.appendChild(colorLabel);

    const colorGrid = document.createElement('div');
    colorGrid.className = 'creator-colors';

    this.swatches = [];
    for (const color of BODY_COLORS) {
      const swatch = document.createElement('div');
      swatch.className = 'creator-color-swatch';
      if (color.hex === this.appearance.bodyColor) {
        swatch.classList.add('selected');
      }
      swatch.style.backgroundColor = color.hex;
      swatch.title = color.id;

      this._on(swatch, 'click', () => {
        this.appearance.bodyColor = color.hex;
        this._updateSwatchSelection();
        this._updatePreview();
      });

      this.swatches.push({ el: swatch, hex: color.hex });
      colorGrid.appendChild(swatch);
    }
    colorSection.appendChild(colorGrid);
    this.step2.appendChild(colorSection);

    // ─── Buttons ─────────────────────────────────
    const btns = document.createElement('div');
    btns.className = 'creator-buttons';

    const backBtn = document.createElement('button');
    backBtn.className = 'btn btn-secondary';
    backBtn.type = 'button';
    backBtn.textContent = '← Back';
    this._on(backBtn, 'click', () => this._goToStep1());

    this.submitBtn = document.createElement('button');
    this.submitBtn.className = 'btn';
    this.submitBtn.type = 'button';
    this.submitBtn.textContent = 'Start Fishing! 🎣';
    this._on(this.submitBtn, 'click', () => this._handleComplete());

    btns.appendChild(backBtn);
    btns.appendChild(this.submitBtn);
    this.step2.appendChild(btns);

    this.card.appendChild(this.step2);
  }

  // ─── Avatar Preview ────────────────────────────────────
  _buildPreview() {
    this.avatarEl = document.createElement('div');
    this.avatarEl.className = 'creator-avatar';

    // Hat area (positioned above head)
    this.hatPreviewEl = document.createElement('div');
    this.hatPreviewEl.style.cssText = 'font-size: 1.4rem; height: 24px; text-align: center; margin-bottom: -4px;';
    this.avatarEl.appendChild(this.hatPreviewEl);

    // Head
    this.headEl = document.createElement('div');
    this.headEl.className = 'creator-avatar-head';
    this.headEl.style.backgroundColor = this.appearance.bodyColor;

    // Eyes
    const eyes = document.createElement('div');
    eyes.className = 'creator-avatar-eyes';
    const leftEye = document.createElement('div');
    leftEye.className = 'creator-avatar-eye';
    const rightEye = document.createElement('div');
    rightEye.className = 'creator-avatar-eye';
    eyes.appendChild(leftEye);
    eyes.appendChild(rightEye);
    this.headEl.appendChild(eyes);
    this.avatarEl.appendChild(this.headEl);

    // Body
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'creator-avatar-body';
    this.bodyEl.style.backgroundColor = this.appearance.bodyColor;
    this.avatarEl.appendChild(this.bodyEl);

    // Accessory label
    this.accPreviewEl = document.createElement('div');
    this.accPreviewEl.style.cssText = 'font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--sp-sm); text-align: center;';
    this.avatarEl.appendChild(this.accPreviewEl);

    this.previewContainer.appendChild(this.avatarEl);
  }

  _updatePreview() {
    // Color
    this.headEl.style.backgroundColor = this.appearance.bodyColor;
    this.bodyEl.style.backgroundColor = this.appearance.bodyColor;

    // Hat emoji
    if (this.appearance.hat !== 'none') {
      this.hatPreviewEl.textContent = HAT_EMOJI[this.appearance.hat] || '🎩';
    } else {
      this.hatPreviewEl.textContent = '';
    }

    // Accessory
    if (this.appearance.accessory !== 'none') {
      const acc = ACCESSORIES.find(a => a.id === this.appearance.accessory);
      this.accPreviewEl.textContent = acc ? acc.name : '';
    } else {
      this.accPreviewEl.textContent = '';
    }
  }

  _updateSwatchSelection() {
    for (const { el, hex } of this.swatches) {
      el.classList.toggle('selected', hex === this.appearance.bodyColor);
    }
  }

  // ─── Step Navigation ───────────────────────────────────
  _showStep(step) {
    this.step = step;
    this._hideError();
    if (step === 1) {
      this.step1.style.display = '';
      this.step2.style.display = 'none';
      this.titleEl.textContent = '✨ Create Your Character';
      requestAnimationFrame(() => this.usernameInput.focus());
    } else {
      this.step1.style.display = 'none';
      this.step2.style.display = '';
      this.titleEl.textContent = '🎨 Customize Appearance';
      this._updatePreview();
    }
  }

  _goToStep2() {
    const username = this.usernameInput.value.trim();
    const password = this.passwordInput.value;

    if (username.length < 3 || username.length > 16) {
      this.showError('Username must be 3–16 characters');
      return;
    }
    if (password.length < 4) {
      this.showError('Password must be at least 4 characters');
      return;
    }

    this.username = username;
    this.password = password;
    this._showStep(2);
  }

  _goToStep1() {
    this._showStep(1);
  }

  // ─── Submit ────────────────────────────────────────────
  async _handleComplete() {
    this.submitBtn.disabled = true;
    this.submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      await this.callbacks.onComplete(this.username, this.password, { ...this.appearance });
    } catch {
      // Error shown via showError
    } finally {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'Start Fishing! 🎣';
    }
  }

  // ─── Helpers ───────────────────────────────────────────
  _createInput(placeholder, type) {
    const input = document.createElement('input');
    input.className = 'input';
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    this._on(input, 'keydown', (e) => e.stopPropagation());
    return input;
  }

  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  _hideError() {
    this.errorEl.style.display = 'none';
  }

  // ─── Public API ────────────────────────────────────────
  showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.style.display = '';
    this.errorEl.style.animation = 'none';
    void this.errorEl.offsetWidth;
    this.errorEl.style.animation = '';

    // Reset submit button if on step 2
    if (this.step === 2) {
      this.submitBtn.disabled = false;
      this.submitBtn.textContent = 'Start Fishing! 🎣';
    }
  }

  destroy() {
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.el.remove();
  }
}
