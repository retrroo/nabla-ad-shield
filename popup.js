/**
 * Nabla Ad Shield — Popup Controller
 * Manages master switch, full persistent Website Whitelist Manager,
 * active-site quick toggle, live telemetry, and diagnostic console launch.
 */

import { ParticleConstellation } from './shared/particle_canvas.js';
import { ThemeManager } from './shared/theme_manager.js';

document.addEventListener('DOMContentLoaded', async () => {
  let constellationInstance = null;
  const canvas = document.getElementById('popup-canvas');
  if (canvas) {
    const currentTheme = document.documentElement?.getAttribute('data-theme') || 'dark';
    constellationInstance = new ParticleConstellation(canvas, {
      particleCount: 28,
      maxDistance: 70,
      baseSpeed: 0.25,
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
  const openDebuggerBtn = document.getElementById('open-debugger-btn');
  const logCountIndicator = document.getElementById('log-count-indicator');

  // Whitelist Manager DOM elements
  const whitelistCountEl = document.getElementById('whitelist-count');
  const toggleWhitelistPanelBtn = document.getElementById('toggle-whitelist-panel-btn');
  const whitelistDrawer = document.getElementById('whitelist-drawer');
  const whitelistAddForm = document.getElementById('whitelist-add-form');
  const whitelistDomainInput = document.getElementById('whitelist-domain-input');
  const whitelistFeedback = document.getElementById('whitelist-feedback');
  const whitelistList = document.getElementById('whitelist-list');

  let activeTabId = null;
  let activeTabUrl = null;
  let currentDomain = null;
  let isSiteWhitelisted = false;
  let isGlobalEnabled = false;
  let whitelistedDomains = [];

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId = tab.id;
      activeTabUrl = tab.url;
    }
  } catch (err) {
    console.error('Failed to query active tab:', err);
  }

  function doesListMatchDomain(host, list) {
    if (!host || !Array.isArray(list)) return false;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (host === d || host.endsWith('.' + d)) return true;
    }
    return false;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

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
      whitelistedDomains = Array.isArray(response.whitelistedDomains)
        ? response.whitelistedDomains
        : [];
      isSiteWhitelisted = Boolean(response.isWhitelisted);

      renderStatusAndGlobalState();
      renderDomainState();
      renderWhitelistManager();
      renderCounters(response.tabBlocked, response.totalThreatsNeutralized);

      cookieRejectToggle.checked = Boolean(response.cookieAutoReject);

      if (logCountIndicator) {
        logCountIndicator.textContent = (response.totalLogsCount || 0).toLocaleString();
      }
    } catch (err) {
      console.error('Error fetching popup data:', err);
    }
  }

  function renderStatusAndGlobalState() {
    if (!isGlobalEnabled) {
      statusPill.className = 'status-pill paused-status';
      statusText.textContent = 'PAUSED';
      globalIndicator.textContent = 'PAUSED';
      globalIndicator.style.color = 'var(--text-muted-zinc)';
      masterToggleBtn.classList.remove('active');
      masterToggleLabel.textContent = 'Protection Paused';
      return;
    }

    globalIndicator.textContent = 'ENABLED';
    globalIndicator.style.color = 'var(--text-pure-white)';
    masterToggleBtn.classList.add('active');
    masterToggleLabel.textContent = 'Shield Enabled';

    if (isSiteWhitelisted) {
      statusPill.className = 'status-pill whitelisted-status';
      statusText.textContent = 'WHITELISTED';
    } else {
      statusPill.className = 'status-pill active-status';
      statusText.textContent = 'ACTIVE';
    }
  }

  function renderDomainState() {
    if (!currentDomain) {
      currentDomainLabel.textContent = 'Internal / Local Page';
      domainSubtext.textContent = 'No network filters applied';
      domainWhitelistBtn.style.display = 'none';
      return;
    }

    currentDomainLabel.textContent = currentDomain;
    domainWhitelistBtn.style.display = 'block';

    if (isSiteWhitelisted) {
      domainSubtext.textContent = 'Ad blocker auto-off on this site';
      domainWhitelistBtn.textContent = 'Resume Site';
      domainWhitelistBtn.classList.add('resumed');
    } else {
      domainSubtext.textContent = 'Shield active for this site';
      domainWhitelistBtn.textContent = 'Whitelist Site';
      domainWhitelistBtn.classList.remove('resumed');
    }
  }

  function renderWhitelistManager() {
    whitelistCountEl.textContent = String(whitelistedDomains.length);

    if (whitelistedDomains.length === 0) {
      whitelistList.innerHTML =
        '<li class="whitelist-empty">No whitelisted sites yet. Add a domain above to auto-disable blocking on it.</li>';
      return;
    }

    whitelistList.innerHTML = whitelistedDomains
      .map(
        (domain) => `
        <li class="whitelist-item">
          <span class="whitelist-domain-text" title="${escapeHtml(domain)}">${escapeHtml(domain)}</span>
          <button
            type="button"
            class="whitelist-remove-btn"
            data-domain="${escapeHtml(domain)}"
            title="Remove ${escapeHtml(domain)} from whitelist"
            aria-label="Remove ${escapeHtml(domain)}"
          >&times;</button>
        </li>
      `
      )
      .join('');
  }

  function showWhitelistFeedback(msg) {
    if (!msg) {
      whitelistFeedback.hidden = true;
      whitelistFeedback.textContent = '';
      return;
    }
    whitelistFeedback.textContent = msg;
    whitelistFeedback.hidden = false;
  }

  function syncCurrentTabAfterWhitelistChange(newList) {
    const previouslyWhitelisted = isSiteWhitelisted;
    whitelistedDomains = newList;
    isSiteWhitelisted = doesListMatchDomain(currentDomain, whitelistedDomains);

    renderStatusAndGlobalState();
    renderDomainState();
    renderWhitelistManager();

    // Reload active tab only if its own whitelist state changed
    if (activeTabId && currentDomain && previouslyWhitelisted !== isSiteWhitelisted) {
      chrome.tabs.reload(activeTabId).catch(() => {});
    }
  }

  function animateValue(element, start, end, duration = 350) {
    if (start === end) {
      element.textContent = end.toLocaleString();
      return;
    }
    const range = end - start;
    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
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

  // Master Switch Toggle
  masterToggleBtn.addEventListener('click', async () => {
    masterToggleBtn.disabled = true;
    try {
      const res = await chrome.runtime.sendMessage({ type: 'TOGGLE_GLOBAL' });
      if (res && res.success) {
        isGlobalEnabled = res.enabled;
        renderStatusAndGlobalState();
      }
    } catch (err) {
      console.error('Failed to toggle global shield:', err);
    } finally {
      masterToggleBtn.disabled = false;
    }
  });

  // Active Tab Quick Whitelist Toggle
  domainWhitelistBtn.addEventListener('click', async () => {
    if (!currentDomain) return;
    domainWhitelistBtn.disabled = true;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'TOGGLE_WHITELIST',
        domain: currentDomain
      });

      if (res && res.success) {
        syncCurrentTabAfterWhitelistChange(res.whitelistedDomains || []);
      }
    } catch (err) {
      console.error('Failed to toggle domain whitelist:', err);
    } finally {
      domainWhitelistBtn.disabled = false;
    }
  });

  // Expand / Collapse Whitelist Manager Drawer
  toggleWhitelistPanelBtn.addEventListener('click', () => {
    const isHidden = whitelistDrawer.hidden;
    whitelistDrawer.hidden = !isHidden;
    toggleWhitelistPanelBtn.setAttribute('aria-expanded', String(isHidden));
    toggleWhitelistPanelBtn.textContent = isHidden ? 'Done' : 'Manage';
    if (isHidden) {
      whitelistDomainInput.focus();
    } else {
      showWhitelistFeedback('');
    }
  });

  // Add Website to Whitelist Form Submit
  whitelistAddForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawValue = whitelistDomainInput.value.trim();
    if (!rawValue) return;

    showWhitelistFeedback('');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'ADD_WHITELIST_DOMAIN',
        domain: rawValue
      });

      if (!res || !res.success) {
        showWhitelistFeedback(res?.error || 'Invalid domain format');
        return;
      }

      whitelistDomainInput.value = '';
      syncCurrentTabAfterWhitelistChange(res.whitelistedDomains || []);
    } catch (err) {
      showWhitelistFeedback('Could not save domain');
    }
  });

  // Remove Website from Whitelist List Click
  whitelistList.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.whitelist-remove-btn');
    if (!removeBtn) return;

    const domainToRemove = removeBtn.dataset.domain;
    if (!domainToRemove) return;

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REMOVE_WHITELIST_DOMAIN',
        domain: domainToRemove
      });

      if (res && res.success) {
        syncCurrentTabAfterWhitelistChange(res.whitelistedDomains || []);
      }
    } catch (err) {
      console.error('Failed to remove whitelisted domain:', err);
    }
  });

  // Cookie Consent Auto-Reject Toggle
  cookieRejectToggle.addEventListener('change', async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'TOGGLE_COOKIE_REJECT' });
    } catch (err) {
      console.error('Failed to toggle cookie auto reject:', err);
    }
  });

  // Launch Diagnostics & Log Monitor
  openDebuggerBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('debugger.html') });
  });

  await loadState();
});
