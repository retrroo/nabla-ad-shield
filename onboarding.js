/**
 * Nabla Ad Shield — Onboarding Controller
 * Enforces privacy consent, manages dormant-to-active transition,
 * and initializes particle constellation canvas.
 */

import { ParticleConstellation } from './shared/particle_canvas.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize background particle constellation
  const canvas = document.getElementById('constellation-canvas');
  if (canvas) {
    new ParticleConstellation(canvas, {
      particleCount: 55,
      maxDistance: 110,
      baseSpeed: 0.3
    });
  }

  const privacyToggle = document.getElementById('privacy-toggle');
  const cookieToggle = document.getElementById('cookie-toggle');
  const initializeBtn = document.getElementById('initialize-btn');
  const statusHint = document.getElementById('status-hint');

  // Verify current storage state
  const data = await chrome.storage.local.get(['enabled', 'initialized']);
  if (data.initialized && data.enabled) {
    // Already initialized
    statusHint.innerHTML = 'Shield status: <span class="status-active">Active</span> &mdash; Protection running';
    initializeBtn.textContent = 'Protection Already Active';
    initializeBtn.disabled = true;
    return;
  }

  // Mandatory toggle handler
  privacyToggle.addEventListener('change', () => {
    initializeBtn.disabled = !privacyToggle.checked;
    if (privacyToggle.checked) {
      initializeBtn.classList.add('ready-glow');
    } else {
      initializeBtn.classList.remove('ready-glow');
    }
  });

  // Action button: Initialize Protection
  initializeBtn.addEventListener('click', async () => {
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
