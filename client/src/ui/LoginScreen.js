/**
 * LoginScreen — Full-screen login/register overlay.
 * Tabs switch between Login (username+password → onLogin) and Register (→ onRegister).
 */
export class LoginScreen {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {{ onLogin(username: string, password: string): void, onRegister(): void }} callbacks
   */
  constructor(container, callbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.activeTab = 'login'; // 'login' | 'register'
    this.isLoading = false;
    this._listeners = [];

    this._build();
    this.container.appendChild(this.el);
  }

  // ─── DOM Construction ──────────────────────────────────
  _build() {
    // Overlay
    this.el = document.createElement('div');
    this.el.className = 'login-overlay';

    // Card
    const card = document.createElement('div');
    card.className = 'login-card glass-elevated';
    this.el.appendChild(card);

    // Title
    const title = document.createElement('h1');
    title.className = 'login-title';
    title.textContent = '🎣 Cozy Fishing';
    card.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.className = 'login-subtitle';
    subtitle.textContent = 'Fish, chat & hang out with friends';
    card.appendChild(subtitle);

    // Tabs
    const tabs = document.createElement('div');
    tabs.className = 'login-tabs';

    this.loginTab = document.createElement('button');
    this.loginTab.className = 'login-tab active';
    this.loginTab.textContent = 'Login';
    this._on(this.loginTab, 'click', () => this._switchTab('login'));

    this.registerTab = document.createElement('button');
    this.registerTab.className = 'login-tab';
    this.registerTab.textContent = 'Register';
    this._on(this.registerTab, 'click', () => this._switchTab('register'));

    tabs.appendChild(this.loginTab);
    tabs.appendChild(this.registerTab);
    card.appendChild(tabs);

    // Error area
    this.errorEl = document.createElement('div');
    this.errorEl.className = 'login-error';
    this.errorEl.style.display = 'none';
    card.appendChild(this.errorEl);

    // ─── Login Form ──────────────────────────────────
    this.loginForm = document.createElement('form');
    this.loginForm.className = 'login-form';
    this.loginForm.autocomplete = 'off';

    this.loginUsername = this._createInput('Username', 'text', 'login-user');
    this.loginPassword = this._createInput('Password', 'password', 'login-pass');
    
    // Remember me checkbox
    const rememberLabel = document.createElement('label');
    rememberLabel.className = 'login-remember';
    this.loginRemember = document.createElement('input');
    this.loginRemember.type = 'checkbox';
    this.loginRemember.name = 'login-remember';
    const rememberText = document.createTextNode(' Remember me');
    rememberLabel.appendChild(this.loginRemember);
    rememberLabel.appendChild(rememberText);

    this.loginBtn = document.createElement('button');
    this.loginBtn.type = 'submit';
    this.loginBtn.className = 'btn';
    this.loginBtn.textContent = 'Login';

    this.loginForm.appendChild(this.loginUsername);
    this.loginForm.appendChild(this.loginPassword);
    this.loginForm.appendChild(rememberLabel);
    this.loginForm.appendChild(this.loginBtn);

    this._on(this.loginForm, 'submit', (e) => {
      e.preventDefault();
      this._handleLogin();
    });

    card.appendChild(this.loginForm);

    // ─── Register Form ───────────────────────────────
    this.registerForm = document.createElement('form');
    this.registerForm.className = 'login-form';
    this.registerForm.style.display = 'none';

    const registerHint = document.createElement('p');
    registerHint.style.cssText = 'font-size: var(--text-sm); color: var(--text-secondary); text-align: center; margin-bottom: var(--sp-sm);';
    registerHint.textContent = 'Create a new account and design your character!';

    this.registerBtn = document.createElement('button');
    this.registerBtn.type = 'button';
    this.registerBtn.className = 'btn';
    this.registerBtn.textContent = 'Create Character →';
    this._on(this.registerBtn, 'click', () => this.callbacks.onRegister());

    this.registerForm.appendChild(registerHint);
    this.registerForm.appendChild(this.registerBtn);
    card.appendChild(this.registerForm);

    // Focus first input
    requestAnimationFrame(() => this.loginUsername.focus());
  }

  // ─── Helpers ───────────────────────────────────────────
  _createInput(placeholder, type, name) {
    const input = document.createElement('input');
    input.className = 'input';
    input.type = type;
    input.name = name;
    input.placeholder = placeholder;
    input.autocomplete = 'off';
    // Prevent game controls from firing while typing
    this._on(input, 'keydown', (e) => e.stopPropagation());
    return input;
  }

  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  _switchTab(tab) {
    this.activeTab = tab;
    this._hideError();

    if (tab === 'login') {
      this.loginTab.classList.add('active');
      this.registerTab.classList.remove('active');
      this.loginForm.style.display = '';
      this.registerForm.style.display = 'none';
      requestAnimationFrame(() => this.loginUsername.focus());
    } else {
      this.registerTab.classList.add('active');
      this.loginTab.classList.remove('active');
      this.loginForm.style.display = 'none';
      this.registerForm.style.display = '';
    }
  }

  _validate(username, password) {
    if (username.length < 3 || username.length > 16) {
      this.showError('Username must be 3–16 characters');
      return false;
    }
    if (password.length < 4) {
      this.showError('Password must be at least 4 characters');
      return false;
    }
    return true;
  }

  async _handleLogin() {
    if (this.isLoading) return;

    const username = this.loginUsername.value.trim();
    const password = this.loginPassword.value;
    const rememberMe = this.loginRemember.checked;

    if (!this._validate(username, password)) return;

    this._setLoading(true);
    try {
      await this.callbacks.onLogin(username, password, rememberMe);
    } catch {
      // Error is shown via showError callback
    } finally {
      this._setLoading(false);
    }
  }

  _setLoading(loading) {
    this.isLoading = loading;
    if (loading) {
      this.loginBtn.disabled = true;
      this.loginBtn.innerHTML = '<span class="spinner"></span>';
    } else {
      this.loginBtn.disabled = false;
      this.loginBtn.textContent = 'Login';
    }
  }

  _hideError() {
    this.errorEl.style.display = 'none';
  }

  // ─── Public API ────────────────────────────────────────
  showError(message) {
    this.errorEl.textContent = message;
    this.errorEl.style.display = '';
    // Re-trigger shake animation
    this.errorEl.style.animation = 'none';
    // Force reflow
    void this.errorEl.offsetWidth;
    this.errorEl.style.animation = '';
    this._setLoading(false);
  }

  destroy() {
    // Clean up all event listeners
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    this.el.remove();
  }
}
