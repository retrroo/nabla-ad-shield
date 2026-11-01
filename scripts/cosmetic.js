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

    /* Roblox sticky footer flow restoration */
    .container-footer#footer-container,
    footer.container-footer {
      position: relative !important;
      bottom: auto !important;
      clear: both !important;
      margin-top: 32px !important;
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

  function report(category, level, message, details = {}, blockedIncrement = 0) {
    try {
      if (typeof window.__nablaReport === 'function') {
        window.__nablaReport(category, level, message, details, blockedIncrement);
      }
    } catch (e) {}
  }

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

  const CMP_CLICK_KEY_PREFIX = '__nabla_cmp_click_';

  function isRecentCMPClick() {
    try {
      const raw = sessionStorage.getItem(CMP_CLICK_KEY_PREFIX + location.hostname);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data && typeof data.time === 'number' && Date.now() - data.time < 15000) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function recordCMPClick() {
    try {
      sessionStorage.setItem(
        CMP_CLICK_KEY_PREFIX + location.hostname,
        JSON.stringify({ time: Date.now() })
      );
    } catch (e) {}
  }

  function collapseContainersOnly() {
    const containers = document.querySelectorAll(CMP_COMBINED_SELECTOR);
    let collapsed = false;
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      if (!container) continue;
      if (container.children.length === 0 && (container.textContent || '').trim().length === 0) {
        continue;
      }
      container.style.setProperty('display', 'none', 'important');
      container.style.setProperty('visibility', 'hidden', 'important');
      container.style.setProperty('pointer-events', 'none', 'important');
      collapsed = true;
    }
    const backdrops = document.querySelectorAll('.modal-backdrop, .cmp-backdrop, .cookie-overlay, .fc-ab-root');
    for (let b = 0; b < backdrops.length; b++) {
      backdrops[b].remove();
      collapsed = true;
    }
    if (collapsed) {
      cookieDismissed = true;
      stopCMPObserver();
      unlockScroll();
      report('COOKIE', 'BLOCKED', `Suppressed recurring CMP container via CSS (loop prevention on ${location.hostname})`, {}, 1);
    }
  }

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
      const doc = document.documentElement;
      const body = document.body;

      if (doc) {
        if (doc.style.position === 'fixed') {
          doc.style.removeProperty('position');
        }
        if (doc.style.overflow === 'hidden' || doc.style.overflow === 'clip') {
          doc.style.removeProperty('overflow');
        }
      }

      if (body) {
        if (body.style.position === 'fixed') {
          body.style.removeProperty('position');
        }
        if (body.style.overflow === 'hidden' || body.style.overflow === 'clip') {
          body.style.removeProperty('overflow');
        }
        if (body.style.overflowY === 'hidden' || body.style.overflowY === 'clip') {
          body.style.removeProperty('overflow-y');
        }
        body.classList.remove('modal-open', 'cmp-lock', 'no-scroll', 'overlay-active', 'has-modal');
      }
    } catch (e) {}
  }

  function attemptCookieDismissal() {
    if (cookieDismissed) return;

    // Loop breaker: If we already clicked a reject button on this domain within 15s
    // and the page reloaded or re-rendered, DO NOT click again! Clicking again will cause
    // an infinite reload loop (e.g. Genius.com). Fall back to silent CSS container collapse.
    if (isRecentCMPClick()) {
      collapseContainersOnly();
      return;
    }

    // Stage A: Single combined C++ selector pass for dedicated CMP reject buttons
    const directBtns = document.querySelectorAll(REJECT_COMBINED_SELECTOR);
    for (let i = 0; i < directBtns.length; i++) {
      const btn = directBtns[i];
      if (btn.offsetParent !== null) {
        recordCMPClick();
        btn.click();
        cookieDismissed = true;
        stopCMPObserver();
        unlockScroll();
        report('COOKIE', 'BLOCKED', `Auto-clicked CMP Reject button (#${btn.id || btn.tagName})`, {}, 1);
        return;
      }
    }

    // Stage B: Single combined selector pass for CMP containers
    const containers = document.querySelectorAll(CMP_COMBINED_SELECTOR);
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      if (!container) continue;

      // Guard: Skip empty mount placeholders (e.g. Roblox's empty <div id="cookie-banner-wrapper"></div>)
      if (container.children.length === 0 && (container.textContent || '').trim().length === 0) {
        continue;
      }

      const buttons = container.querySelectorAll('button, [role="button"], a');
      for (let j = 0; j < buttons.length; j++) {
        const btn = buttons[j];
        const txt = (btn.textContent || '').trim().replace(/\s+/g, ' ');
        if (txt.length > 0 && txt.length <= 32 && REJECT_TEXT_REGEX.test(txt)) {
          recordCMPClick();
          btn.click();
          cookieDismissed = true;
          stopCMPObserver();
          unlockScroll();
          report('COOKIE', 'BLOCKED', `Auto-clicked Reject button: "${txt}"`, {}, 1);
          return;
        }
      }

      // Stage C: Dedicated CMP or active dialog with actual content
      const isDedicatedCMP =
        container.id === 'onetrust-consent-sdk' ||
        container.id === 'onetrust-banner-sdk' ||
        container.id === 'CybotCookiebotDialog' ||
        container.id === 'CybotCookiebotDialogBody' ||
        container.classList.contains('qc-cmp2-container') ||
        container.id === 'truste-consent-track' ||
        container.id === 'truste-consent-required' ||
        container.classList.contains('trustarc-banner') ||
        container.id === 'uc-banner' ||
        container.id === 'didomi-host';

      // For generic selectors ([id*="cookie-banner"], [class*="cookie-banner"], [role="dialog"]),
      // require actual visible presence and cookie/consent text or buttons
      const text = (container.textContent || '').toLowerCase();
      const hasConsentWords = text.includes('cookie') || text.includes('consent') || text.includes('privacy');
      const isVisible = container.offsetWidth > 0 || container.offsetHeight > 0 || container.getClientRects().length > 0;

      if ((isDedicatedCMP && isVisible) || (hasConsentWords && isVisible && buttons.length > 0)) {
        container.style.setProperty('display', 'none', 'important');
        container.style.setProperty('visibility', 'hidden', 'important');
        container.style.setProperty('pointer-events', 'none', 'important');

        const backdrops = document.querySelectorAll('.modal-backdrop, .cmp-backdrop, .cookie-overlay, .fc-ab-root');
        for (let b = 0; b < backdrops.length; b++) {
          backdrops[b].remove();
        }

        cookieDismissed = true;
        stopCMPObserver();
        unlockScroll();
        report('COOKIE', 'BLOCKED', `Neutralized CMP overlay container (#${container.id || container.className})`, {}, 1);
        return;
      }
    }
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

  window.addEventListener('nabla-context-invalidated', stopCMPObserver, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCMPObservation, { once: true });
  } else {
    startCMPObservation();
  }
})();
