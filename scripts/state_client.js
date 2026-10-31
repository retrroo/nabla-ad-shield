/**
 * Nabla Ad Shield — Shared Ultra-Fast Content State & Telemetry Batcher
 * Reads directly from chrome.storage.local (~1ms shared memory, zero Service Worker wakeup)
 * and batches outbound telemetry/counter IPC messages to minimize main-thread overhead.
 */

(function initNablaStateClient() {
  'use strict';

  if (window.__nablaClientInitialized) return;
  window.__nablaClientInitialized = true;

  const rawHost = (window.location.hostname || '').replace(/^www\./i, '').toLowerCase();

  /**
   * Checks exact domain or subdomain match against whitelisted domains
   * e.g., 'cooking.nytimes.com' matches 'nytimes.com'
   */
  function isHostWhitelisted(host, whitelistedDomains) {
    if (!host || !Array.isArray(whitelistedDomains) || whitelistedDomains.length === 0) {
      return false;
    }
    for (let i = 0; i < whitelistedDomains.length; i++) {
      const domain = whitelistedDomains[i];
      if (host === domain || host.endsWith('.' + domain)) {
        return true;
      }
    }
    return false;
  }

  function applyBypassMarkers(shouldBypass) {
    try {
      if (document.documentElement) {
        if (shouldBypass) {
          document.documentElement.dataset.nablaDisabled = 'true';
          document.documentElement.dataset.nablaYoutubeDisabled = 'true';
        } else {
          delete document.documentElement.dataset.nablaDisabled;
          delete document.documentElement.dataset.nablaYoutubeDisabled;
        }
      }
      if (shouldBypass) {
        sessionStorage.setItem('__nabla_off', '1');
      } else {
        sessionStorage.removeItem('__nabla_off');
      }
    } catch (e) {
      // Sandboxed frame or restricted sessionStorage
    }
  }

  let cachedStatePromise = null;

  function fetchStateFromStorage() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(
          ['enabled', 'cookieAutoReject', 'whitelistedDomains'],
          (data) => {
            if (chrome.runtime.lastError || !data) {
              resolve({ enabled: false, cookieAutoReject: false, isWhitelisted: false, host: rawHost });
              return;
            }
            const enabled = Boolean(data.enabled);
            const cookieAutoReject = data.cookieAutoReject !== false;
            const isWhitelisted = isHostWhitelisted(rawHost, data.whitelistedDomains);
            const shouldBypass = !enabled || isWhitelisted;

            applyBypassMarkers(shouldBypass);

            resolve({
              enabled,
              cookieAutoReject,
              isWhitelisted,
              host: rawHost
            });
          }
        );
      } catch (e) {
        resolve({ enabled: false, cookieAutoReject: false, isWhitelisted: false, host: rawHost });
      }
    });
  }

  // Kick off the single shared storage read immediately at document_start
  cachedStatePromise = fetchStateFromStorage();

  window.__nablaGetState = function () {
    return cachedStatePromise;
  };

  // Synchronous optimistic check using cached sessionStorage marker from prior navigation on same origin
  window.__nablaIsOptimisticallyDisabled = function () {
    try {
      return sessionStorage.getItem('__nabla_off') === '1';
    } catch (e) {
      return false;
    }
  };

  // React to live storage updates (e.g., user toggles whitelist or master switch)
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && (changes.enabled || changes.whitelistedDomains || changes.cookieAutoReject)) {
        cachedStatePromise = fetchStateFromStorage();
      }
    });
  } catch (e) {}

  // --- Batched Telemetry & Counter Queue ---
  let pendingLogs = [];
  let pendingBlockedCount = 0;
  let flushTimer = null;

  function flushTelemetry() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingLogs.length === 0 && pendingBlockedCount === 0) return;

    const eventsToSend = pendingLogs;
    const countToSend = pendingBlockedCount;
    pendingLogs = [];
    pendingBlockedCount = 0;

    try {
      chrome.runtime.sendMessage({
        type: 'NABLA_BATCH_TELEMETRY',
        blockedCount: countToSend,
        events: eventsToSend
      }).catch(() => {});
    } catch (e) {}
  }

  /**
   * Enqueues a diagnostic log and/or blocked threat increment into a 300ms batch
   */
  window.__nablaReport = function (category, level, message, details = {}, blockedIncrement = 0) {
    if (blockedIncrement > 0) {
      pendingBlockedCount += blockedIncrement;
    }

    if (category && message) {
      pendingLogs.push({
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        category,
        level,
        message,
        url: window.location.href,
        details
      });
    }

    if (!flushTimer) {
      flushTimer = setTimeout(flushTelemetry, 300);
    }
  };

  window.addEventListener('pagehide', flushTelemetry, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushTelemetry();
    }
  }, { passive: true });
})();
