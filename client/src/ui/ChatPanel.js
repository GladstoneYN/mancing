/**
 * ChatPanel — Fixed-position chat overlay with message list, input, and unread badge.
 * Blocks keyboard propagation when input is focused to prevent game controls.
 */
import { EVENTS } from '@shared/events.js';

export class ChatPanel {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {object} socketManager — SocketManager instance with .emit()
   */
  constructor(container, socketManager) {
    this.container = container;
    this.socket = socketManager;
    this._listeners = [];
    this._focused = false;
    this._minimized = false;
    this._unreadCount = 0;
    this._maxMessages = 100;

    this._build();
    this.container.appendChild(this.el);
  }

  // ─── DOM Construction ──────────────────────────────────
  _build() {
    // Panel
    this.el = document.createElement('div');
    this.el.className = 'chat-panel glass';

    // Header (clickable to minimize/expand)
    const header = document.createElement('div');
    header.className = 'chat-header';

    const titleArea = document.createElement('div');
    titleArea.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const title = document.createElement('span');
    title.className = 'chat-header-title';
    title.textContent = '💬 Chat';
    titleArea.appendChild(title);

    this.badgeEl = document.createElement('span');
    this.badgeEl.className = 'chat-header-badge';
    titleArea.appendChild(this.badgeEl);

    header.appendChild(titleArea);

    // Minimize arrow
    this.toggleIcon = document.createElement('span');
    this.toggleIcon.style.cssText = 'font-size: var(--text-sm); color: var(--text-muted); transition: transform 0.2s;';
    this.toggleIcon.textContent = '▼';
    header.appendChild(this.toggleIcon);

    this._on(header, 'click', () => this._toggleMinimize());
    this.el.appendChild(header);

    // Messages container
    this.messagesEl = document.createElement('div');
    this.messagesEl.className = 'chat-messages';
    this.el.appendChild(this.messagesEl);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'chat-input-row';

    this.inputEl = document.createElement('input');
    this.inputEl.className = 'chat-input input';
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Say something...';
    this.inputEl.maxLength = 200;
    this.inputEl.autocomplete = 'off';

    // Block key propagation so game controls don't fire
    this._on(this.inputEl, 'keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        this._sendMessage();
      }
      if (e.key === 'Escape') {
        this.inputEl.blur();
      }
    });

    this._on(this.inputEl, 'focus', () => {
      this._focused = true;
      // Clear unread when focused
      this._unreadCount = 0;
      this.badgeEl.classList.remove('visible');
      // Expand if minimized
      if (this._minimized) this._toggleMinimize();
    });

    this._on(this.inputEl, 'blur', () => {
      this._focused = false;
    });

    const sendBtn = document.createElement('button');
    sendBtn.className = 'chat-send-btn btn btn-sm';
    sendBtn.textContent = '→';
    sendBtn.title = 'Send message';
    this._on(sendBtn, 'click', () => this._sendMessage());

    inputRow.appendChild(this.inputEl);
    inputRow.appendChild(sendBtn);
    this.el.appendChild(inputRow);
  }

  // ─── Internal Methods ──────────────────────────────────
  _toggleMinimize() {
    this._minimized = !this._minimized;
    this.el.classList.toggle('minimized', this._minimized);
    this.toggleIcon.style.transform = this._minimized ? 'rotate(180deg)' : '';
  }

  _sendMessage() {
    const text = this.inputEl.value.trim();
    if (!text) return;

    this.socket.emit(EVENTS.CHAT_MESSAGE, { text });
    this.inputEl.value = '';
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  _createMessageEl(data) {
    // System messages
    if (data.system) {
      const msg = document.createElement('div');
      msg.className = 'chat-msg chat-msg-system';
      msg.textContent = data.text;
      return msg;
    }

    // Normal player messages
    const msg = document.createElement('div');
    msg.className = 'chat-msg';

    const name = document.createElement('span');
    name.className = 'chat-msg-name';
    name.textContent = data.username || 'Player';
    // Deterministic color per player name
    name.style.color = this._nameColor(data.username || '');

    const text = document.createElement('span');
    text.className = 'chat-msg-text';
    text.textContent = data.text;

    msg.appendChild(name);
    msg.appendChild(text);
    return msg;
  }

  _nameColor(name) {
    // Stable pastel color based on username hash
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 72%)`;
  }

  _trimMessages() {
    while (this.messagesEl.children.length > this._maxMessages) {
      this.messagesEl.removeChild(this.messagesEl.firstChild);
    }
  }

  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  // ─── Public API ────────────────────────────────────────
  /**
   * Add a single message to the chat.
   * @param {{ playerId?: string, username?: string, text: string, system?: boolean, timestamp?: number }} data
   */
  addMessage(data) {
    const el = this._createMessageEl(data);
    this.messagesEl.appendChild(el);
    this._trimMessages();
    this._scrollToBottom();

    // Show unread badge if not focused
    if (!this._focused) {
      this._unreadCount++;
      this.badgeEl.classList.add('visible');
    }
  }

  /**
   * Load an array of past messages (e.g. from CHAT_HISTORY).
   * @param {Array} messages
   */
  loadHistory(messages) {
    // Clear existing
    this.messagesEl.innerHTML = '';

    if (messages.length > 0) {
      // System divider
      const divider = this._createMessageEl({ system: true, text: '— Chat history —' });
      this.messagesEl.appendChild(divider);

      for (const msg of messages) {
        const el = this._createMessageEl(msg);
        this.messagesEl.appendChild(el);
      }
    }

    this._scrollToBottom();
  }

  /** Focus the chat input */
  focus() {
    if (this._minimized) this._toggleMinimize();
    this.inputEl.focus();
  }

  /** @returns {boolean} Whether the chat input is focused */
  isFocused() {
    return this._focused;
  }

  destroy() {
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.el.remove();
  }
}
