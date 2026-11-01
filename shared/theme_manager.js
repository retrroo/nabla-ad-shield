/**
 * Nabla Ad Shield — Unified Theme Manager
 * Manages Dark & White (Light) mode across Popup, Diagnostics Console, and Onboarding.
 * Syncs seamlessly via chrome.storage.local and localStorage for zero-latency 0ms render.
 */

export class ThemeManager {
  constructor(options = {}) {
    this.onThemeChange = options.onThemeChange || null;
    this.theme = 'dark';
    this.init();
  }

  async init() {
    // 1. Synchronous localStorage check for instant 0ms painting
    try {
      const localTheme = localStorage.getItem('nabla_theme');
      if (localTheme === 'light' || localTheme === 'dark') {
        this.apply(localTheme, false);
      }
    } catch (e) {}

    // 2. Authoritative chrome.storage.local read
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const stored = await chrome.storage.local.get(['theme']);
        const theme = stored?.theme === 'light' ? 'light' : 'dark';
        this.apply(theme, true);

        // 3. Live storage listener for multi-view real-time sync
        chrome.storage.onChanged.addListener((changes, areaName) => {
          if (areaName === 'local' && changes.theme) {
            const newTheme = changes.theme.newValue === 'light' ? 'light' : 'dark';
            if (newTheme !== this.theme) {
              this.apply(newTheme, true);
            }
          }
        });
      }
    } catch (e) {}
  }

  getTheme() {
    return this.theme;
  }

  apply(theme, notify = true) {
    this.theme = theme;
    if (document.documentElement) {
      document.documentElement.setAttribute('data-theme', theme);
    }
    try {
      localStorage.setItem('nabla_theme', theme);
    } catch (e) {}

    if (notify && typeof this.onThemeChange === 'function') {
      try {
        this.onThemeChange(theme);
      } catch (e) {}
    }
  }

  async setTheme(theme) {
    const validTheme = theme === 'light' ? 'light' : 'dark';
    this.apply(validTheme, true);

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await chrome.storage.local.set({ theme: validTheme });
      }
    } catch (e) {}

    return validTheme;
  }

  async toggleTheme() {
    const nextTheme = this.theme === 'light' ? 'dark' : 'light';
    return await this.setTheme(nextTheme);
  }
}
