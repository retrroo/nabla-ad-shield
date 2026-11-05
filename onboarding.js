/**
 * Nabla Ad Shield — Onboarding Controller
 * Enforces privacy consent, manages dormant-to-active transition,
 * and initializes particle constellation canvas.
 */

import { ParticleConstellation } from './shared/particle_canvas.js';
import { ThemeManager } from './shared/theme_manager.js';

document.addEventListener('DOMContentLoaded', async () => {
  let constellationInstance = null;
  const canvas = document.getElementById('constellation-canvas');
  if (canvas) {
    const currentTheme = document.documentElement?.getAttribute('data-theme') || 'dark';
    constellationInstance = new ParticleConstellation(canvas, {
      particleCount: 55,
      maxDistance: 110,
      baseSpeed: 0.3,
      theme: currentTheme
    });
  }

  const themeManager = new ThemeManager({
    onThemeChange: (theme) => {
      if (constellationInstance) {
        constellationInstance.setTheme(theme);
      }
    }
  });

  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', async () => {
      await themeManager.toggleTheme();
    });
  }

  const privacyToggle = document.getElementById('privacy-toggle');
  const cookieToggle = document.getElementById('cookie-toggle');
  const initializeBtn = document.getElementById('initialize-btn');
  const statusHint = document.getElementById('status-hint');

  // Verify current storage state
  const data = await chrome.storage.local.get(['enabled', 'initialized']);
  const isAlreadyActive = Boolean(data.initialized && data.enabled);
  if (isAlreadyActive) {
    statusHint.innerHTML = 'Shield status: <span class="status-active">Active</span> &mdash; Protection running';
    initializeBtn.textContent = 'Close Onboarding';
    initializeBtn.disabled = false;
    initializeBtn.classList.add('ready-glow');
    if (privacyToggle) privacyToggle.checked = true;
  }

  // Mandatory toggle handler
  privacyToggle.addEventListener('change', () => {
    if (isAlreadyActive && !privacyToggle.checked) {
      initializeBtn.disabled = true;
      initializeBtn.classList.remove('ready-glow');
    } else {
      initializeBtn.disabled = !privacyToggle.checked;
      if (privacyToggle.checked) {
        initializeBtn.classList.add('ready-glow');
        if (isAlreadyActive) {
          initializeBtn.textContent = 'Re-apply Settings';
        }
      } else {
        initializeBtn.classList.remove('ready-glow');
      }
    }
  });

  if (cookieToggle) {
    cookieToggle.addEventListener('change', () => {
      if (isAlreadyActive && privacyToggle.checked) {
        initializeBtn.textContent = 'Re-apply Settings';
      }
    });
  }

  // Action button: Initialize Protection
  initializeBtn.addEventListener('click', async () => {
    if (initializeBtn.textContent === 'Close Onboarding') {
      window.close();
      return;
    }

    if (!privacyToggle.checked) return;

    initializeBtn.disabled = true;
    initializeBtn.textContent = 'Activating Shield Engine...';

    const cookieAutoReject = cookieToggle.checked;

    try {
      // Send IPC message to background service worker
      const response = await chrome.runtime.sendMessage({
        type: 'INITIALIZE_PROTECTION',
        cookieAutoReject
      });

      if (response && response.success) {
        statusHint.innerHTML = 'Shield status: <span class="status-active">Active</span> &mdash; Pure Web Activated';
        initializeBtn.textContent = 'Shield Initialized ✓';
        initializeBtn.style.backgroundColor = '#FFFFFF';
        initializeBtn.style.color = '#000000';

        // Graceful completion notice
        setTimeout(() => {
          initializeBtn.textContent = 'Close Onboarding';
          initializeBtn.disabled = false;
          initializeBtn.onclick = () => {
            window.close();
          };
        }, 1200);
      }
    } catch (err) {
      console.error('Failed to initialize Nabla shield:', err);
      initializeBtn.textContent = 'Error Initializing — Retry';
      initializeBtn.disabled = false;
    }
  });
});
