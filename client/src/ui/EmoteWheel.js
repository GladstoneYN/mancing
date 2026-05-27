/**
 * EmoteWheel — Cozy HTML/CSS radial overlay for quick emote selection.
 */
export class EmoteWheel {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {Function} onSelect — callback when an emote is triggered: (emoteId) => {}
   */
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.selectedEmote = null;

    this.emotes = [
      { id: 'wave',  label: 'Wave 👋',      emoji: '👋' },
      { id: 'jump',  label: 'Celebrate 🎉', emoji: '🎉' },
      { id: 'spin',  label: 'Spin 🌀',      emoji: '🌀' },
      { id: 'heart', label: 'Heart ❤️',     emoji: '❤️' },
      { id: 'laugh', label: 'Laugh 😂',     emoji: '😂' },
      { id: 'cry',   label: 'Cry 😭',       emoji: '😭' },
    ];

    this._build();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'emote-wheel-overlay';

    const wheel = document.createElement('div');
    wheel.className = 'emote-wheel glass-elevated';

    // Center indicator
    const center = document.createElement('div');
    center.className = 'emote-wheel-center';
    this.centerText = document.createElement('span');
    this.centerText.textContent = 'Select Emote';
    center.appendChild(this.centerText);
    wheel.appendChild(center);

    // Render radial wedges
    const radius = 95; // px from center
    this.buttons = [];

    this.emotes.forEach((emote, idx) => {
      const angle = (idx / this.emotes.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const btn = document.createElement('button');
      btn.className = 'emote-wheel-btn';
      btn.style.left = `calc(50% + ${x}px)`;
      btn.style.top = `calc(50% + ${y}px)`;

      btn.innerHTML = `
        <span class="emote-wheel-emoji">${emote.emoji}</span>
        <span class="emote-wheel-label">${emote.label.split(' ')[0]}</span>
      `;

      btn.addEventListener('mouseenter', () => {
        this.selectedEmote = emote.id;
        btn.classList.add('active');
        this.centerText.innerHTML = `<strong>${emote.label}</strong>`;
      });

      btn.addEventListener('mouseleave', () => {
        if (this.selectedEmote === emote.id) {
          this.selectedEmote = null;
        }
        btn.classList.remove('active');
        this.centerText.textContent = 'Select Emote';
      });

      // Also support direct click
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.trigger(emote.id);
      });

      wheel.appendChild(btn);
      this.buttons.push(btn);
    });

    this.el.appendChild(wheel);
    this.container.appendChild(this.el);
  }

  trigger(emoteId) {
    const id = emoteId || this.selectedEmote;
    if (id) {
      this.onSelect(id);
    }
    this.destroy();
  }

  destroy() {
    this.el.classList.add('fade-out');
    this.el.addEventListener('animationend', () => {
      this.el.remove();
    });
  }
}
