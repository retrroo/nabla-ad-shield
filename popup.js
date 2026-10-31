/**
 * Nabla Ad Shield — Popup Controller
 * Manages master toggle, domain whitelisting, live telemetry,
 * cookie auto-rejection, and background constellation canvas.
 */

import { ParticleConstellation } from './shared/particle_canvas.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize background particle constellation
  const canvas = document.getElementById('popup-canvas');
  if (canvas) {
    new ParticleConstellation(canvas, {
      particleCount: 30,
      maxDistance: 70,
      baseSpeed: 0.25
    });
  }

  // DOM element references
  const statusPill = document.getElementById('status-pill');
  const statusText = document.getElementById('status-text');
  const globalIndicator = document.getElementById('global-state-indicator');
  const masterToggleBtn = document.getElementById('master-toggle-btn');
  const masterToggleLabel = document.getElementById('master-toggle-label');
  const tabBlockedEl = document.getElementById('tab-blocked-counter');
  const totalBlockedEl = document.getElementById('total-blocked-counter');
  const currentDomainLabel = document.getElementById('current-domain-label');
  const domainSubtext = document.getElementById('domain-subtext');
  const domainWhitelistBtn = document.getElementById('domain-whitelist-btn');
  const cookieRejectToggle = document.getElementById('cookie-reject-toggle');

  let activeTabId = null;
  let activeTabUrl = null;
  let currentDomain = null;
  let isSiteWhitelisted = false;
  let isGlobalEnabled = false;

  // 2. Query active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId = tab.id;
      activeTabUrl = tab.url;
    }
  } catch (err) {
    console.error('Failed to query active tab:', err);
  }

  // 3. Fetch comprehensive popup state from background service worker
  async function loadState() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_POPUP_DATA',
        tabId: activeTabId,
        tabUrl: activeTabUrl
      });

      if (!response) return;

      isGlobalEnabled = Boolean(response.enabled);
      currentDomain = response.currentDomain;
      isSiteWhitelisted = Boolean(response.isWhitelisted);

      renderGlobalState(isGlobalEnabled);
      renderDomainState(currentDomain, isSiteWhitelisted);
      renderCounters(response.tabBlocked, response.totalThreatsNeutralized);

      cookieRejectToggle.checked = Boolean(response.cookieAutoReject);
    } catch (err) {
      console.error('Error fetching popup data:', err);
    }
  }

  // Render global switch and status pill
  function renderGlobalState(enabled) {
    if (enabled) {
      statusPill.className = 'status-pill active-status';
      statusText.textContent = 'ACTIVE';
      globalIndicator.textContent = 'ENABLED';
      globalIndicator.style.color = '#FFFFFF';
      masterToggleBtn.classList.add('active');
      masterToggleLabel.textContent = 'Shield Enabled';
    } else {
      statusPill.className = 'status-pill paused-status';
      statusText.textContent = 'PAUSED';
      globalIndicator.textContent = 'PAUSED';
      globalIndicator.style.color = '#888888';
      masterToggleBtn.classList.remove('active');
      masterToggleLabel.textContent = 'Protection Paused';
    }
  }

  // Render per-domain controls
  function renderDomainState(domain, whitelisted) {
    if (!domain) {
      currentDomainLabel.textContent = 'Internal / Local Page';
      domainSubtext.textContent = 'No network filters applied';
      domainWhitelistBtn.style.display = 'none';
      return;
    }

    currentDomainLabel.textContent = domain;
    domainWhitelistBtn.style.display = 'block';

    if (whitelisted) {
      domainSubtext.textContent = 'Protection paused on this site';
      domainWhitelistBtn.textContent = 'Resume Site';
      domainWhitelistBtn.classList.add('resumed');
    } else {
      domainSubtext.textContent = 'Shield active for this site';
      domainWhitelistBtn.textContent = 'Pause Site';
      domainWhitelistBtn.classList.remove('resumed');
    }
  }

  // Smooth counter animation
  function animateValue(element, start, end, duration = 400) {
    if (start === end) {
      element.textContent = end.toLocaleString();
      return;
    }
    const range = end - start;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + range * eased);
      element.textContent = current.toLocaleString();
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  function renderCounters(tabCount, totalCount) {
    animateValue(tabBlockedEl, 0, tabCount || 0);
    animateValue(totalBlockedEl, 0, totalCount || 0);
  }

  // Event: Master Switch Toggle
  masterToggleBtn.addEventListener('click', async () => {
    masterToggleBtn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'TOGGLE_GLOBAL' });
      if (res && res.success) {
        isGlobalEnabled = res.enabled;
        renderGlobalState(isGlobalEnabled);
      }
    } catch (err) {
      console.error('Failed to toggle global shield:', err);
    } finally {
      masterToggleBtn.disabled = false;
    }
  });

  // Event: Domain Whitelist Toggle
  domainWhitelistBtn.addEventListener('click', async () => {
    if (!currentDomain) return;
    domainWhitelistBtn.disabled = true;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TOGGLE_WHITELIST',
        domain: currentDomain
      });

      if (res && res.success) {
        isSiteWhitelisted = res.isWhitelisted;
        renderDomainState(currentDomain, isSiteWhitelisted);
        // Optionally reload current tab so whitelist change takes immediate effect
        if (activeTabId) {
          chrome.tabs.reload(activeTabId);
        }
      }
    } catch (err) {
      console.error('Failed to toggle domain whitelist:', err);
    } finally {
      domainWhitelistBtn.disabled = false;
    }
  });

  // Event: Cookie Consent Auto-Reject Toggle
  cookieRejectToggle.addEventListener('change', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_COOKIE_REJECT' });
    } catch (err) {
      console.error('Failed to toggle cookie auto reject:', err);
    }
  });

  // Initial load
  await loadState();
});
