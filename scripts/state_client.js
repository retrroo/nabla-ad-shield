/**
 * Nabla Ad Shield — Shared Ultra-Fast Content State & Telemetry Batcher
 * Reads directly from chrome.storage.local (~1ms shared memory, zero Service Worker wakeup),
 * batches outbound telemetry/counter IPC messages, and gracefully tears down orphaned
 * content-script contexts when the extension is reloaded or updated.
 */

(function initNablaStateClient() {
  'use strict';

  if (window.__nablaClientInitialized) return;
  window.__nablaClientInitialized = true;

  let contextInvalidated = false;
  let pendingLogs = [];
  let pendingBlockedCount = 0;
  let flushTimer = null;

  const rawHost = (window.location.hostname || '').replace(/^www\./i, '').toLowerCase();

  /**
   * Safely checks whether this content script's extension context is still alive.
   * When an extension is reloaded in chrome://extensions, existing open tabs hold
   * orphaned content scripts where chrome.runtime.id becomes undefined (or throws).
   */
  function isContextValid() {
    if (contextInvalidated) return false;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && Boolean(chrome.runtime.id)) {
        return true;
      }
    } catch (e) {
      // Accessing invalidated chrome.runtime threw synchronously
    }
    teardownInvalidatedContext();
    return false;
  }

  /**
   * Cleanly shuts down timers, queues, and notifies sibling content scripts
   * (youtube_shield.js, cosmetic.js, heuristic_ai.js) to disconnect observers.
   */
  function teardownInvalidatedContext() {
    if (contextInvalidated) return;
    contextInvalidated = true;
    window.__nablaClientInitialized = false;

    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    pendingLogs = [];
    pendingBlockedCount = 0;
    window.__nablaReport = function () {};

    window.removeEventListener('pagehide', flushTelemetry);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    try {
      window.dispatchEvent(new CustomEvent('nabla-context-invalidated'));
    } catch (e) {}
  }

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
      const fallback = {
        enabled: true,
        cookieAutoReject: true,
        isWhitelisted: false,
        host: rawHost
      };

      if (!isContextValid()) {
        resolve(fallback);
        return;
      }

      try {
        chrome.storage.local.get(
          ['enabled', 'cookieAutoReject', 'whitelistedDomains'],
          (data) => {
            try {
              if (!isContextValid() || chrome.runtime.lastError || !data) {
                resolve(fallback);
                return;
              }

              const enabled = data.enabled !== false;
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
            } catch (cbErr) {
              teardownInvalidatedContext();
              resolve(fallback);
            }
          }
        );
      } catch (e) {
        teardownInvalidatedContext();
        resolve(fallback);
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
  if (isContextValid()) {
    try {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!isContextValid()) return;
        try {
          if (areaName === 'local' && (changes.enabled || changes.whitelistedDomains || changes.cookieAutoReject)) {
            cachedStatePromise = fetchStateFromStorage();
          }
        } catch (e) {
          teardownInvalidatedContext();
        }
      });
    } catch (e) {
      teardownInvalidatedContext();
    }
  }

  // --- Batched Telemetry & Counter Queue ---
  function flushTelemetry() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (!isContextValid()) return;
    if (pendingLogs.length === 0 && pendingBlockedCount === 0) return;

    const eventsToSend = pendingLogs;
    const countToSend = pendingBlockedCount;
    pendingLogs = [];
    pendingBlockedCount = 0;

    try {
      const sendPromise = chrome.runtime.sendMessage({
        type: 'NABLA_BATCH_TELEMETRY',
        blockedCount: countToSend,
        events: eventsToSend
      });
      if (sendPromise && typeof sendPromise.catch === 'function') {
        sendPromise.catch(() => {});
      }
    } catch (e) {
      teardownInvalidatedContext();
    }
  }

  /**
   * Enqueues a diagnostic log and/or blocked threat increment into a 300ms batch
   */
  window.__nablaReport = function (category, level, message, details = {}, blockedIncrement = 0) {
    if (!isContextValid()) return;

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

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      flushTelemetry();
    }
  }

  window.addEventListener('pagehide', flushTelemetry, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
})();
