/**
 * Nabla Ad Shield — Background Service Worker (MV3)
 * Handles Declarative Net Request rules, dynamic domain whitelisting,
 * telemetry aggregation, badge updates, and onboarding lifecycle.
 */

const RULESET_ADS = 'ads_ruleset';
const RULESET_COOKIES = 'cookies_ruleset';

// Ephemeral in-memory blocked counts per tab
const tabBlockedCounts = new Map();

/**
 * Initialize default storage schema
 */
async function initializeDefaults() {
  const data = await chrome.storage.local.get([
    'enabled',
    'cookieAutoReject',
    'whitelistedDomains',
    'totalThreatsNeutralized',
    'initialized'
  ]);

  const updates = {};
  if (typeof data.enabled !== 'boolean') updates.enabled = false;
  if (typeof data.cookieAutoReject !== 'boolean') updates.cookieAutoReject = true;
  if (!Array.isArray(data.whitelistedDomains)) updates.whitelistedDomains = [];
  if (typeof data.totalThreatsNeutralized !== 'number') updates.totalThreatsNeutralized = 0;
  if (typeof data.initialized !== 'boolean') updates.initialized = false;

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  return { ...data, ...updates };
}

/**
 * Synchronize chrome.declarativeNetRequest enabled rulesets with current state
 */
async function syncRulesets() {
  const { enabled, cookieAutoReject } = await chrome.storage.local.get(['enabled', 'cookieAutoReject']);

  const enableRulesetIds = [];
  const disableRulesetIds = [];

  if (enabled) {
    enableRulesetIds.push(RULESET_ADS);
    if (cookieAutoReject) {
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
}

/**
 * Synchronize dynamic rules for per-site whitelisting.
 * Generates allowAllRequests rules for initiatorDomains and allow rules for requestDomains.
 */
async function syncDynamicRules(whitelistedDomains = null) {
  if (!whitelistedDomains) {
    const data = await chrome.storage.local.get('whitelistedDomains');
    whitelistedDomains = data.whitelistedDomains || [];
  }

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);

  const addRules = [];
  const allResourceTypes = [
    'main_frame',
    'sub_frame',
    'stylesheet',
    'script',
    'image',
    'font',
    'object',
    'xmlhttprequest',
    'ping',
    'csp_report',
    'media',
    'websocket',
    'other'
  ];

  whitelistedDomains.forEach((domain, idx) => {
    const baseId = (idx + 1) * 2;
    // 1. Allow all subrequests initiated by the whitelisted page
    addRules.push({
      id: baseId,
      priority: 1000,
      action: { type: 'allowAllRequests' },
      condition: {
        initiatorDomains: [domain],
        resourceTypes: allResourceTypes
      }
    });
    // 2. Allow top-level and direct requests to the domain
    addRules.push({
      id: baseId + 1,
      priority: 1000,
      action: { type: 'allow' },
      condition: {
        requestDomains: [domain],
        resourceTypes: allResourceTypes
      }
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

/**
 * Increment tab and global threat counters and update badge
 */
async function recordThreatsBlocked(tabId, count = 1) {
  if (count <= 0) return;

  // Update tab in-memory count
  if (tabId && tabId > 0) {
    const current = tabBlockedCounts.get(tabId) || 0;
    const updated = current + count;
    tabBlockedCounts.set(tabId, updated);
    updateTabBadge(tabId, updated);
  }

  // Update global persistent count
  const { totalThreatsNeutralized = 0 } = await chrome.storage.local.get('totalThreatsNeutralized');
  await chrome.storage.local.set({
    totalThreatsNeutralized: totalThreatsNeutralized + count
  });
}

/**
 * Update the badge appearance for a specific tab
 */
async function updateTabBadge(tabId, count) {
  const { enabled } = await chrome.storage.local.get('enabled');

  if (!enabled) {
    chrome.action.setBadgeText({ tabId, text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2B2B2B' });
    chrome.action.setBadgeTextColor({ tabId, color: '#888888' });
    return;
  }

  if (count > 0) {
    const badgeText = count > 999 ? '999+' : count.toString();
    chrome.action.setBadgeText({ tabId, text: badgeText });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#000000' });
    chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

/**
 * Clean domain helper (extract hostname without port or www)
 */
function normalizeHostname(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Lifecycle: Install & Update
chrome.runtime.onInstalled.addListener(async (details) => {
  await initializeDefaults();

  if (details.reason === 'install') {
    // Keep engine dormant (enabled: false) and launch onboarding
    await chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding.html')
    });
  } else if (details.reason === 'update') {
    await syncRulesets();
    await syncDynamicRules();
  }
});

// Telemetry: DeclarativeNetRequest matched debug listener (when supported/unpacked)
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    if (info && info.request && info.request.tabId > 0) {
      recordThreatsBlocked(info.request.tabId, 1);
    }
  });
}

// Tab navigation listener: reset badge count on main frame navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url) {
    tabBlockedCounts.set(tabId, 0);
    updateTabBadge(tabId, 0);
  }
});

// Tab close cleanup
chrome.tabs.onRemoved.addListener((tabId) => {
  tabBlockedCounts.delete(tabId);
});

// Tab switched listener: refresh active tab badge
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const count = tabBlockedCounts.get(activeInfo.tabId) || 0;
  await updateTabBadge(activeInfo.tabId, count);
});

// Core Message Router
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender?.tab?.id;

  switch (message.type) {
    case 'GET_STATE_FOR_CONTENT': {
      (async () => {
        const { enabled, cookieAutoReject, whitelistedDomains = [] } = await chrome.storage.local.get([
          'enabled',
          'cookieAutoReject',
          'whitelistedDomains'
        ]);

        const rawUrl = message.url || sender?.tab?.url || '';
        const domain = normalizeHostname(rawUrl);
        const isWhitelisted = domain ? whitelistedDomains.includes(domain) : false;

        sendResponse({
          enabled: Boolean(enabled),
          cookieAutoReject: Boolean(cookieAutoReject),
          isWhitelisted
        });
      })();
      return true; // Keep message channel open for async response
    }

    case 'INCREMENT_BLOCKED': {
      const count = message.count || 1;
      recordThreatsBlocked(tabId, count);
      sendResponse({ success: true });
      break;
    }

    case 'INITIALIZE_PROTECTION': {
      (async () => {
        const cookieOptIn = Boolean(message.cookieAutoReject);
        await chrome.storage.local.set({
          enabled: true,
          cookieAutoReject: cookieOptIn,
          initialized: true
        });
        await syncRulesets();
        await syncDynamicRules();

        // Update all tabs' badge state
        const tabs = await chrome.tabs.query({});
        for (const t of tabs) {
          if (t.id) {
            updateTabBadge(t.id, tabBlockedCounts.get(t.id) || 0);
          }
        }

        sendResponse({ success: true });
      })();
      return true;
    }

    case 'TOGGLE_GLOBAL': {
      (async () => {
        const { enabled } = await chrome.storage.local.get('enabled');
        const nextState = !enabled;
        await chrome.storage.local.set({ enabled: nextState });
        await syncRulesets();

        // Update all badges
        const tabs = await chrome.tabs.query({});
        for (const t of tabs) {
          if (t.id) {
            updateTabBadge(t.id, tabBlockedCounts.get(t.id) || 0);
          }
        }

        sendResponse({ success: true, enabled: nextState });
      })();
      return true;
    }

    case 'TOGGLE_WHITELIST': {
      (async () => {
        const domain = message.domain;
        if (!domain) {
          sendResponse({ success: false, error: 'Invalid domain' });
          return;
        }

        const { whitelistedDomains = [] } = await chrome.storage.local.get('whitelistedDomains');
        const exists = whitelistedDomains.includes(domain);
        let updated;

        if (exists) {
          updated = whitelistedDomains.filter((d) => d !== domain);
        } else {
          updated = [...whitelistedDomains, domain];
        }

        await chrome.storage.local.set({ whitelistedDomains: updated });
        await syncDynamicRules(updated);

        sendResponse({ success: true, isWhitelisted: !exists, whitelistedDomains: updated });
      })();
      return true;
    }

    case 'TOGGLE_COOKIE_REJECT': {
      (async () => {
        const { cookieAutoReject } = await chrome.storage.local.get('cookieAutoReject');
        const nextState = !cookieAutoReject;
        await chrome.storage.local.set({ cookieAutoReject: nextState });
        await syncRulesets();
        sendResponse({ success: true, cookieAutoReject: nextState });
      })();
      return true;
    }

    case 'GET_POPUP_DATA': {
      (async () => {
        const data = await chrome.storage.local.get([
          'enabled',
          'cookieAutoReject',
          'whitelistedDomains',
          'totalThreatsNeutralized'
        ]);

        let currentDomain = null;
        let tabBlocked = 0;

        if (message.tabId) {
          tabBlocked = tabBlockedCounts.get(message.tabId) || 0;
        }

        if (message.tabUrl) {
          currentDomain = normalizeHostname(message.tabUrl);
        }

        const whitelisted = currentDomain
          ? (data.whitelistedDomains || []).includes(currentDomain)
          : false;

        sendResponse({
          enabled: Boolean(data.enabled),
          cookieAutoReject: Boolean(data.cookieAutoReject),
          currentDomain,
          isWhitelisted: whitelisted,
          tabBlocked,
          totalThreatsNeutralized: data.totalThreatsNeutralized || 0
        });
      })();
      return true;
    }

    default:
      break;
  }
});
