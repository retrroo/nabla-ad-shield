/**
 * Nabla Ad Shield — High-Performance Background Service Worker (MV3)
 * Optimized with:
 *  - In-memory state cache & O(1) Set-based whitelist lookups (zero hot-path disk reads)
 *  - Debounced batch storage writes (eliminates IndexedDB/LevelDB contention & race conditions)
 *  - Throttled per-tab badge rendering with automatic 'WL' badge on whitelisted sites
 *  - Spec-compliant DNR allowAllRequests + initiatorDomains allow rules for instant site whitelisting
 */

const RULESET_ADS = 'ads_ruleset';
const RULESET_COOKIES = 'cookies_ruleset';
const MAX_LOGS = 600;

// In-memory hot state cache
const stateCache = {
  hydrated: false,
  enabled: false,
  cookieAutoReject: true,
  whitelistedDomains: [],
  whitelistedSet: new Set(),
  totalThreatsNeutralized: 0,
  initialized: false
};

// Ephemeral per-tab telemetry & hostname tracking
const tabBlockedCounts = new Map();
const tabHostnames = new Map();
const pendingBadgeTimers = new Map();
let auditLogs = [];

/**
 * Normalizes any user-entered URL or hostname into a clean canonical domain
 * e.g., "https://www.Example.com/path" -> "example.com", "*.twitch.tv" -> "twitch.tv"
 */
function normalizeDomainInput(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) return null;

  // Strip wildcard prefix if user typed *.domain.com
  cleaned = cleaned.replace(/^\*\./, '');

  // Add protocol temporarily if missing so URL parser extracts hostname cleanly
  if (!/^[a-z]+:\/\//.test(cleaned)) {
    cleaned = 'https://' + cleaned;
  }

  try {
    const parsed = new URL(cleaned);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.replace(/^www\./, '').replace(/\.$/, '');
    if (!host) return null;
    if (host === 'localhost' || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) {
      return host;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extracts normalized hostname from a browser tab URL
 */
function normalizeHostname(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Fast O(1) exact + subdomain suffix check against stateCache.whitelistedSet
 * Returns the matched whitelist rule domain (e.g. 'nytimes.com') or null
 */
function findMatchingWhitelistDomain(hostname) {
  if (!hostname || stateCache.whitelistedSet.size === 0) return null;
  if (stateCache.whitelistedSet.has(hostname)) return hostname;

  let dotIdx = hostname.indexOf('.');
  while (dotIdx !== -1) {
    const parentDomain = hostname.slice(dotIdx + 1);
    if (stateCache.whitelistedSet.has(parentDomain)) {
      return parentDomain;
    }
    dotIdx = hostname.indexOf('.', dotIdx + 1);
  }
  return null;
}

function isHostnameWhitelisted(hostname) {
  return findMatchingWhitelistDomain(hostname) !== null;
}

function rebuildWhitelistSet(domains) {
  stateCache.whitelistedDomains = domains;
  stateCache.whitelistedSet = new Set(domains);
}

/**
 * Hydrate in-memory cache once per Service Worker lifecycle
 */
let hydrationPromise = null;
function ensureHydrated() {
  if (stateCache.hydrated) return Promise.resolve(stateCache);
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    const data = await chrome.storage.local.get([
      'enabled',
      'cookieAutoReject',
      'whitelistedDomains',
      'totalThreatsNeutralized',
      'initialized',
      'auditLogs'
    ]);

    const updates = {};
    stateCache.enabled = typeof data.enabled === 'boolean' ? data.enabled : (updates.enabled = false);
    stateCache.cookieAutoReject =
      typeof data.cookieAutoReject === 'boolean' ? data.cookieAutoReject : (updates.cookieAutoReject = true);

    const wl = Array.isArray(data.whitelistedDomains)
      ? data.whitelistedDomains
      : (updates.whitelistedDomains = []);
    rebuildWhitelistSet(wl);

    stateCache.totalThreatsNeutralized =
      typeof data.totalThreatsNeutralized === 'number'
        ? data.totalThreatsNeutralized
        : (updates.totalThreatsNeutralized = 0);

    stateCache.initialized =
      typeof data.initialized === 'boolean' ? data.initialized : (updates.initialized = false);

    auditLogs = Array.isArray(data.auditLogs) ? data.auditLogs : (updates.auditLogs = []);

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
    }

    stateCache.hydrated = true;
    hydrationPromise = null;
    return stateCache;
  })();

  return hydrationPromise;
}

// Eagerly warm cache on worker startup
ensureHydrated();

/**
 * Debounced storage writer for high-frequency counters & logs (1.2s coalescing window)
 */
let dirtyCounter = false;
let dirtyLogs = false;
let flushStorageTimer = null;

function scheduleStorageFlush() {
  if (flushStorageTimer) return;
  flushStorageTimer = setTimeout(async () => {
    flushStorageTimer = null;
    const payload = {};
    if (dirtyCounter) {
      payload.totalThreatsNeutralized = stateCache.totalThreatsNeutralized;
      dirtyCounter = false;
    }
    if (dirtyLogs) {
      payload.auditLogs = auditLogs.slice(0, 300);
      dirtyLogs = false;
    }
    if (Object.keys(payload).length > 0) {
      await chrome.storage.local.set(payload);
    }
  }, 1200);
}

/**
 * Record one or more diagnostic log events into the in-memory ring buffer
 */
function appendLogsBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return;

  for (let i = 0; i < events.length; i++) {
    const raw = events[i];
    const event = {
      id: raw.id || `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: raw.timestamp || new Date().toISOString(),
      ...raw
    };
    auditLogs.unshift(event);

    try {
      chrome.runtime.sendMessage({ type: 'NABLA_NEW_LOG', event }).catch(() => {});
    } catch (e) {}
  }

  if (auditLogs.length > MAX_LOGS) {
    auditLogs.length = MAX_LOGS;
  }

  dirtyLogs = true;
  scheduleStorageFlush();
}

function appendLog(event) {
  appendLogsBatch([event]);
}

/**
 * Synchronize chrome.declarativeNetRequest enabled static rulesets
 */
async function syncRulesets() {
  await ensureHydrated();

  const enableRulesetIds = [];
  const disableRulesetIds = [];

  if (stateCache.enabled) {
    enableRulesetIds.push(RULESET_ADS);
    if (stateCache.cookieAutoReject) {
      enableRulesetIds.push(RULESET_COOKIES);
    } else {
      disableRulesetIds.push(RULESET_COOKIES);
    }
  } else {
    disableRulesetIds.push(RULESET_ADS, RULESET_COOKIES);
  }

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds,
    disableRulesetIds
  });

  appendLog({
    category: 'SYSTEM',
    level: 'INFO',
    message: `DNR Rulesets synced. Enabled: [${enableRulesetIds.join(', ')}]`,
    details: { enabled: stateCache.enabled, cookieAutoReject: stateCache.cookieAutoReject }
  });
}

/**
 * Synchronize MV3-compliant dynamic whitelist rules.
 * Rule 1: allowAllRequests on main_frame & sub_frame for requestDomains (disables entire frame hierarchy).
 * Rule 2: allow on initiatorDomains (immediately allows all XHR/script/image subrequests from that domain).
 */
async function syncDynamicRules(domains = null) {
  await ensureHydrated();
  const targetDomains = domains || stateCache.whitelistedDomains;

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);

  const addRules = [];

  targetDomains.forEach((domain, idx) => {
    const baseId = (idx + 1) * 2;
    // 1. Frame-level hierarchy bypass when visiting the whitelisted website
    addRules.push({
      id: baseId,
      priority: 1000,
      action: { type: 'allowAllRequests' },
      condition: {
        requestDomains: [domain],
        resourceTypes: ['main_frame', 'sub_frame']
      }
    });
    // 2. Immediate subrequest bypass for scripts, XHRs, media, and images initiated by the domain
    addRules.push({
      id: baseId + 1,
      priority: 1000,
      action: { type: 'allow' },
      condition: {
        initiatorDomains: [domain]
      }
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });

  appendLog({
    category: 'SYSTEM',
    level: 'INFO',
    message: `Whitelist DNR rules synced (${targetDomains.length} site${targetDomains.length === 1 ? '' : 's'})`,
    details: { whitelistedDomains: targetDomains }
  });
}

/**
 * Synchronous in-memory counter update + throttled badge paint
 */
function recordThreatsBlocked(tabId, count = 1) {
  if (count <= 0) return;

  if (tabId && tabId > 0) {
    const current = tabBlockedCounts.get(tabId) || 0;
    tabBlockedCounts.set(tabId, current + count);
    scheduleBadgeUpdate(tabId);
  }

  stateCache.totalThreatsNeutralized += count;
  dirtyCounter = true;
  scheduleStorageFlush();
}

function scheduleBadgeUpdate(tabId) {
  if (pendingBadgeTimers.has(tabId)) return;
  const timer = setTimeout(() => {
    pendingBadgeTimers.delete(tabId);
    renderTabBadgeNow(tabId);
  }, 120);
  pendingBadgeTimers.set(tabId, timer);
}

function renderTabBadgeNow(tabId) {
  if (!tabId || tabId <= 0) return;

  if (!stateCache.enabled) {
    chrome.action.setBadgeText({ tabId, text: 'OFF' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2B2B2B' }).catch(() => {});
    chrome.action.setBadgeTextColor({ tabId, color: '#888888' }).catch(() => {});
    return;
  }

  const host = tabHostnames.get(tabId);
  if (host && isHostnameWhitelisted(host)) {
    chrome.action.setBadgeText({ tabId, text: 'WL' }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#1F1F1F' }).catch(() => {});
    chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }).catch(() => {});
    return;
  }

  const count = tabBlockedCounts.get(tabId) || 0;
  if (count > 0) {
    const badgeText = count > 999 ? '999+' : String(count);
    chrome.action.setBadgeText({ tabId, text: badgeText }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#000000' }).catch(() => {});
    chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }).catch(() => {});
  } else {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  }
}

async function refreshAllTabBadges() {
  const tabs = await chrome.tabs.query({});
  for (let i = 0; i < tabs.length; i++) {
    const t = tabs[i];
    if (t.id) {
      if (t.url) {
        tabHostnames.set(t.id, normalizeHostname(t.url));
      }
      renderTabBadgeNow(t.id);
    }
  }
}

// Lifecycle: Install & Update
chrome.runtime.onInstalled.addListener(async (details) => {
  await ensureHydrated();

  appendLog({
    category: 'SYSTEM',
    level: 'INFO',
    message: `Extension lifecycle event: ${details.reason}`,
    details
  });

  if (details.reason === 'install') {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  } else if (details.reason === 'update') {
    await syncRulesets();
    await syncDynamicRules();
    await refreshAllTabBadges();
  }
});

// Telemetry: DeclarativeNetRequest matched debug listener
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (!info || !info.request) return;

    // Ignore allow / allowAllRequests rules when counting blocked threats
    const ruleId = info.rule?.ruleId;
    const rulesetId = info.rule?.rulesetId;
    if (rulesetId === '_dynamic' || ruleId >= 9000) return;

    const tabId = info.request.tabId;
    if (tabId > 0) {
      recordThreatsBlocked(tabId, 1);
    }

    appendLog({
      category: 'NETWORK',
      level: 'BLOCKED',
      message: `DNR Blocked: ${info.request.url.slice(0, 100)}`,
      url: info.request.url,
      tabId,
      details: {
        ruleId,
        rulesetId,
        method: info.request.method,
        resourceType: info.request.type,
        initiator: info.request.initiator
      }
    });
  });
}

// Tab navigation listener: track hostname for automatic whitelist detection & reset page counter
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || (changeInfo.status === 'loading' && tab.url)) {
    const host = normalizeHostname(changeInfo.url || tab.url);
    tabHostnames.set(tabId, host);
    if (changeInfo.status === 'loading') {
      tabBlockedCounts.set(tabId, 0);
    }
    renderTabBadgeNow(tabId);
  }
});

// Tab close cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockedCounts.delete(tabId);
  tabHostnames.delete(tabId);
  const timer = pendingBadgeTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    pendingBadgeTimers.delete(tabId);
  }
});

// Tab switched listener: refresh active tab badge in O(1)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await ensureHydrated();
  if (!tabHostnames.has(activeInfo.tabId)) {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab?.url) tabHostnames.set(activeInfo.tabId, normalizeHostname(tab.url));
    } catch (e) {}
  }
  renderTabBadgeNow(activeInfo.tabId);
});

// Core Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  switch (message.type) {
    // High-efficiency batched telemetry endpoint from state_client.js
    case 'NABLA_BATCH_TELEMETRY': {
      if (message.blockedCount > 0) {
        recordThreatsBlocked(tabId, message.blockedCount);
      }
      if (Array.isArray(message.events) && message.events.length > 0) {
        const enriched = message.events.map((ev) => (tabId && !ev.tabId ? { ...ev, tabId } : ev));
        appendLogsBatch(enriched);
      }
      sendResponse({ success: true });
      break;
    }

    case 'GET_STATE_FOR_CONTENT': {
      (async () => {
        await ensureHydrated();
        const rawUrl = message.url || sender?.tab?.url || '';
        const domain = normalizeHostname(rawUrl);
        const isWhitelisted = domain ? isHostnameWhitelisted(domain) : false;

        sendResponse({
          enabled: stateCache.enabled,
          cookieAutoReject: stateCache.cookieAutoReject,
          isWhitelisted
        });
      })();
      return true;
    }

    case 'INCREMENT_BLOCKED': {
      recordThreatsBlocked(tabId, message.count || 1);
      sendResponse({ success: true });
      break;
    }

    case 'NABLA_LOG_EVENT': {
      if (message.event) {
        const ev = tabId && !message.event.tabId ? { ...message.event, tabId } : message.event;
        appendLog(ev);
      }
      sendResponse({ success: true });
      break;
    }

    case 'NABLA_GET_LOGS': {
      (async () => {
        await ensureHydrated();
        sendResponse({ logs: auditLogs });
      })();
      return true;
    }

    case 'NABLA_CLEAR_LOGS': {
      auditLogs = [];
      dirtyLogs = false;
      chrome.storage.local.set({ auditLogs: [] });
      sendResponse({ success: true });
      break;
    }

    case 'INITIALIZE_PROTECTION': {
      (async () => {
        await ensureHydrated();
        const cookieOptIn = Boolean(message.cookieAutoReject);
        stateCache.enabled = true;
        stateCache.cookieAutoReject = cookieOptIn;
        stateCache.initialized = true;

        await chrome.storage.local.set({
          enabled: true,
          cookieAutoReject: cookieOptIn,
          initialized: true
        });

        await syncRulesets();
        await syncDynamicRules();
        await refreshAllTabBadges();

        appendLog({
          category: 'SYSTEM',
          level: 'INFO',
          message: 'Protection initialized by user via Onboarding.',
          details: { cookieAutoReject: cookieOptIn }
        });

        sendResponse({ success: true });
      })();
      return true;
    }

    case 'TOGGLE_GLOBAL': {
      (async () => {
        await ensureHydrated();
        const nextState = !stateCache.enabled;
        stateCache.enabled = nextState;
        await chrome.storage.local.set({ enabled: nextState });
        await syncRulesets();
        await refreshAllTabBadges();

        appendLog({
          category: 'SYSTEM',
          level: 'INFO',
          message: `Global Protection ${nextState ? 'ENABLED' : 'PAUSED'}`,
          details: { enabled: nextState }
        });

        sendResponse({ success: true, enabled: nextState });
      })();
      return true;
    }

    // Add any arbitrary website domain to the persistent whitelist
    case 'ADD_WHITELIST_DOMAIN': {
      (async () => {
        await ensureHydrated();
        const normalized = normalizeDomainInput(message.domain);
        if (!normalized) {
          sendResponse({ success: false, error: 'Enter a valid domain (e.g. example.com)' });
          return;
        }

        if (!stateCache.whitelistedSet.has(normalized)) {
          const updated = [...stateCache.whitelistedDomains, normalized].sort();
          rebuildWhitelistSet(updated);
          await chrome.storage.local.set({ whitelistedDomains: updated });
          await syncDynamicRules(updated);
          await refreshAllTabBadges();

          appendLog({
            category: 'SYSTEM',
            level: 'INFO',
            message: `Added ${normalized} to automatic whitelist`,
            details: { domain: normalized }
          });
        }

        sendResponse({
          success: true,
          domain: normalized,
          whitelistedDomains: stateCache.whitelistedDomains
        });
      })();
      return true;
    }

    // Remove a specific domain from the persistent whitelist
    case 'REMOVE_WHITELIST_DOMAIN': {
      (async () => {
        await ensureHydrated();
        const target = (message.domain || '').trim().toLowerCase();
        if (!target) {
          sendResponse({ success: false, error: 'Invalid domain' });
          return;
        }

        const updated = stateCache.whitelistedDomains.filter((d) => d !== target);
        rebuildWhitelistSet(updated);
        await chrome.storage.local.set({ whitelistedDomains: updated });
        await syncDynamicRules(updated);
        await refreshAllTabBadges();

        appendLog({
          category: 'SYSTEM',
          level: 'INFO',
          message: `Removed ${target} from automatic whitelist`,
          details: { domain: target }
        });

        sendResponse({
          success: true,
          whitelistedDomains: stateCache.whitelistedDomains
        });
      })();
      return true;
    }

    // Toggle active tab domain (handles both exact and subdomain matches cleanly)
    case 'TOGGLE_WHITELIST': {
      (async () => {
        await ensureHydrated();
        const normalized = normalizeDomainInput(message.domain);
        if (!normalized) {
          sendResponse({ success: false, error: 'Invalid domain' });
          return;
        }

        const matchedRuleDomain = findMatchingWhitelistDomain(normalized);
        let updated;
        const willBeWhitelisted = !matchedRuleDomain;

        if (matchedRuleDomain) {
          updated = stateCache.whitelistedDomains.filter(
            (d) => d !== matchedRuleDomain && d !== normalized
          );
        } else {
          updated = [...stateCache.whitelistedDomains, normalized].sort();
        }

        rebuildWhitelistSet(updated);
        await chrome.storage.local.set({ whitelistedDomains: updated });
        await syncDynamicRules(updated);
        await refreshAllTabBadges();

        appendLog({
          category: 'SYSTEM',
          level: 'INFO',
          message: `Domain ${normalized} ${willBeWhitelisted ? 'whitelisted (auto-off)' : 'removed from whitelist'}`,
          details: { domain: normalized, isWhitelisted: willBeWhitelisted }
        });

        sendResponse({
          success: true,
          isWhitelisted: willBeWhitelisted,
          whitelistedDomains: updated
        });
      })();
      return true;
    }

    case 'TOGGLE_COOKIE_REJECT': {
      (async () => {
        await ensureHydrated();
        const nextState = !stateCache.cookieAutoReject;
        stateCache.cookieAutoReject = nextState;
        await chrome.storage.local.set({ cookieAutoReject: nextState });
        await syncRulesets();

        appendLog({
          category: 'SYSTEM',
          level: 'INFO',
          message: `Cookie Auto-Reject ${nextState ? 'ENABLED' : 'DISABLED'}`,
          details: { cookieAutoReject: nextState }
        });

        sendResponse({ success: true, cookieAutoReject: nextState });
      })();
      return true;
    }

    case 'GET_POPUP_DATA': {
      (async () => {
        await ensureHydrated();

        let currentDomain = null;
        let tabBlocked = 0;

        if (message.tabId) {
          tabBlocked = tabBlockedCounts.get(message.tabId) || 0;
        }

        if (message.tabUrl) {
          currentDomain = normalizeHostname(message.tabUrl);
          if (message.tabId && currentDomain) {
            tabHostnames.set(message.tabId, currentDomain);
          }
        }

        const matchedWhitelistDomain = currentDomain
          ? findMatchingWhitelistDomain(currentDomain)
          : null;

        sendResponse({
          enabled: stateCache.enabled,
          cookieAutoReject: stateCache.cookieAutoReject,
          currentDomain,
          isWhitelisted: matchedWhitelistDomain !== null,
          matchedWhitelistDomain,
          whitelistedDomains: stateCache.whitelistedDomains,
          tabBlocked,
          totalThreatsNeutralized: stateCache.totalThreatsNeutralized,
          totalLogsCount: auditLogs.length
        });
      })();
      return true;
    }

    default:
      break;
  }
});
