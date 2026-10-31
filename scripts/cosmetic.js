/**
 * Nabla Ad Shield — Layer 2: Zero-Latency Cosmetic & Cookie Consent Filter
 * Performs 0ms optimistic CSS injection at document_start to eliminate ad layout calculation
 * and FOUC, reverting within ~1ms if the domain is whitelisted or globally paused.
 */

(async function initCosmeticFilter() {
  'use strict';

  const STYLE_ID = 'nabla-cosmetic-styles';

  const COSMETIC_CSS = `
    ins.adsbygoogle,
    [id^="div-gpt-ad"],
    [id^="google_ads_iframe"],
    [id^="ad-unit"],
    .ad-container,
    .ad-wrapper,
    .ad-slot,
    .ad-banner,
    .ad-placeholder,
    .advertisement,
    .advertising,
    .sponsored-post,
    .sponsored-content,
    .sponsor-badge,
    .native-ad,
    [data-ad-client],
    [data-ad-slot],
    [data-ad-unit],
    [data-adzone],
    [data-google-query-id],
    iframe[src*="doubleclick.net"],
    iframe[src*="googlesyndication.com"],
    iframe[src*="adnxs.com"],
    iframe[src*="criteo.com"],
    iframe[src*="amazon-adsystem.com"],
    .trc_rbox_div,
    .trc_related_container,
    .ob-widget,
    .outbrain-placeholder,
    .taboola-placeholder,
    .OUTBRAIN,
    #taboola-below-article-thumbnails,
    #rc-widget-install {
      display: none !important;
      content-visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      min-width: 0 !important;
      max-width: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      visibility: hidden !important;
      overflow: hidden !important;
    }
  `;

  function injectCosmeticStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = COSMETIC_CSS;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleEl);
    }
  }

  function removeCosmeticStyles() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  // 1. Optimistic 0ms injection at document_start (unless previously marked disabled in session)
  const optimisticallyOff =
    typeof window.__nablaIsOptimisticallyDisabled === 'function' &&
    window.__nablaIsOptimisticallyDisabled();

  if (!optimisticallyOff && document.documentElement) {
    injectCosmeticStyles();
  }

  // 2. Resolve shared ~1ms storage state (zero Service Worker wakeup)
  const state =
    typeof window.__nablaGetState === 'function'
      ? await window.__nablaGetState()
      : { enabled: false, isWhitelisted: false, cookieAutoReject: false };

  if (!state.enabled || state.isWhitelisted) {
    removeCosmeticStyles();
    return;
  }

  // Ensure stylesheet is attached if documentElement was not ready at 0ms
  if (document.documentElement) {
    injectCosmeticStyles();
  } else {
    document.addEventListener('readystatechange', injectCosmeticStyles, { once: true });
  }

  const report =
    window.__nablaReport ||
    function () {};

  report('COSMETIC', 'INFO', 'Applied zero-latency cosmetic stylesheet', {}, 0);

  // 3. Automated Cookie Consent & CMP Auto-Reject Engine
  if (!state.cookieAutoReject) return;

  const REJECT_COMBINED_SELECTOR =
    '#onetrust-reject-all-handler,' +
    '.ot-pc-refuse-all-handler,' +
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll,' +
    '#CybotCookiebotDialogBodyButtonDecline,' +
    '.qc-cmp2-buttons-desktop button:last-child,' +
    'button[data-testid="uc-deny-all-button"],' +
    '#didomi-notice-disagree-button,' +
    'button[aria-label*="reject" i],' +
    'button[aria-label*="decline" i],' +
    'button[aria-label*="refuse" i],' +
    'button[aria-label*="ablehnen" i]';

  const CMP_COMBINED_SELECTOR =
    '#onetrust-consent-sdk,' +
    '#onetrust-banner-sdk,' +
    '#CybotCookiebotDialog,' +
    '#CybotCookiebotDialogBody,' +
    '.qc-cmp2-container,' +
    '#truste-consent-track,' +
    '#truste-consent-required,' +
    '.trustarc-banner,' +
    '#uc-banner,' +
    '#didomi-host,' +
    '[id*="cookie-banner" i],' +
    '[class*="cookie-banner" i],' +
    '[id*="consent-banner" i],' +
    '[class*="consent-banner" i],' +
    'div[aria-label*="cookie" i][role="dialog"],' +
    'div[aria-label*="consent" i][role="dialog"]';

  const REJECT_TEXT_REGEX =
    /^(reject(\s*all)?|decline(\s*all)?|refuse(\s*all)?|deny(\s*all)?|necessary\s*only|only\s*necessary|essential\s*only|nur\s*notwendige|ablehnen|tout\s*refuser|rechazar(\s*todo)?|rifiuta)$/i;

  let cookieDismissed = false;
  let cmpObserver = null;
  let cmpTimer = null;

  function stopCMPObserver() {
    if (cmpObserver) {
      cmpObserver.disconnect();
      cmpObserver = null;
    }
    if (cmpTimer) {
      clearTimeout(cmpTimer);
      cmpTimer = null;
    }
  }

  function unlockScroll() {
    try {
      if (document.documentElement) {
        document.documentElement.style.setProperty('overflow', 'auto', 'important');
        document.documentElement.style.setProperty('position', 'static', 'important');
      }
      if (document.body) {
        document.body.style.setProperty('overflow', 'auto', 'important');
        document.body.style.setProperty('position', 'static', 'important');
      }
    } catch (e) {}
  }

  function attemptCookieDismissal() {
    if (cookieDismissed) return;

    // Stage A: Single combined C++ selector pass for dedicated CMP reject buttons
    const directBtns = document.querySelectorAll(REJECT_COMBINED_SELECTOR);
    for (let i = 0; i < directBtns.length; i++) {
      const btn = directBtns[i];
      if (btn.offsetParent !== null) {
        btn.click();
        cookieDismissed = true;
        stopCMPObserver();
        unlockScroll();
        report('COOKIE', 'BLOCKED', `Auto-clicked CMP Reject button (#${btn.id || btn.tagName})`, {}, 1);
        return;
      }
    }

    // Stage B: Single combined selector pass for CMP containers
    const container = document.querySelector(CMP_COMBINED_SELECTOR);
    if (!container) return;

    const buttons = container.querySelectorAll('button, [role="button"], a');
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      const txt = (btn.textContent || '').trim().replace(/\s+/g, ' ');
      if (txt.length > 0 && txt.length <= 32 && REJECT_TEXT_REGEX.test(txt)) {
        btn.click();
        cookieDismissed = true;
        stopCMPObserver();
        unlockScroll();
        report('COOKIE', 'BLOCKED', `Auto-clicked Reject button: "${txt}"`, {}, 1);
        return;
      }
    }

    // Stage C: Collapse container & remove backdrop cleanly
    container.style.setProperty('display', 'none', 'important');
    container.style.setProperty('visibility', 'hidden', 'important');
    container.style.setProperty('pointer-events', 'none', 'important');

    const backdrops = document.querySelectorAll('.modal-backdrop, .cmp-backdrop, .cookie-overlay, .fc-ab-root');
    for (let i = 0; i < backdrops.length; i++) {
      backdrops[i].remove();
    }

    cookieDismissed = true;
    stopCMPObserver();
    unlockScroll();
    report('COOKIE', 'BLOCKED', `Neutralized CMP overlay container (#${container.id || container.className})`, {}, 1);
  }

  let cmpRafPending = false;
  cmpObserver = new MutationObserver((mutations) => {
    if (cookieDismissed || cmpRafPending) return;
    let addedElement = false;
    for (let i = 0; i < mutations.length; i++) {
      const nodes = mutations[i].addedNodes;
      for (let j = 0; j < nodes.length; j++) {
        if (nodes[j].nodeType === 1) {
          addedElement = true;
          break;
        }
      }
      if (addedElement) break;
    }
    if (!addedElement) return;

    cmpRafPending = true;
    requestAnimationFrame(() => {
      cmpRafPending = false;
      attemptCookieDismissal();
    });
  });

  function startCMPObservation() {
    attemptCookieDismissal();
    if (cookieDismissed) return;
    const target = document.body || document.documentElement;
    if (target && cmpObserver) {
      cmpObserver.observe(target, { childList: true, subtree: true });
      cmpTimer = setTimeout(() => {
        stopCMPObserver();
      }, 7000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCMPObservation, { once: true });
  } else {
    startCMPObservation();
  }
})();
