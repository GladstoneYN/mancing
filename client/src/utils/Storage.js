/**
 * Storage — localStorage wrapper for session, settings, and preferences.
 */
const KEYS = {
  SESSION: 'cozy_fishing_session',
  SETTINGS: 'cozy_fishing_settings',
};

export const Storage = {
  // ─── Session ─────────────────────────────────────────
  getSession() {
    try {
      const raw = localStorage.getItem(KEYS.SESSION) || sessionStorage.getItem(KEYS.SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveSession(token, player, rememberMe = false) {
    const data = JSON.stringify({ token, player });
    if (rememberMe) {
      localStorage.setItem(KEYS.SESSION, data);
      sessionStorage.removeItem(KEYS.SESSION);
    } else {
      sessionStorage.setItem(KEYS.SESSION, data);
      localStorage.removeItem(KEYS.SESSION);
    }
  },

  clearSession() {
    localStorage.removeItem(KEYS.SESSION);
    sessionStorage.removeItem(KEYS.SESSION);
  },

  getToken() {
    const session = this.getSession();
    return session?.token || null;
  },

  // ─── Settings ────────────────────────────────────────
  getSettings() {
    try {
      const raw = localStorage.getItem(KEYS.SETTINGS);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  saveSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
  },

  getSetting(key, defaultValue = null) {
    const settings = this.getSettings();
    return settings[key] ?? defaultValue;
  },
};
