/**
 * Nabla Ad Shield — Layer 2: Non-Breaking Cosmetic & Cookie Consent Filter
 * Injected at document_start across all frames.
 * Collapses known ad containers and auto-dismisses GDPR / CMP cookie popups.
 * Emits telemetry events to the diagnostic logging engine.
 */

(async function initCosmeticFilter() {
  'use strict';

  // 1. Verify extension state with background service worker
  let state;
  try {
    state = await chrome.runtime.sendMessage({
      type: 'GET_STATE_FOR_CONTENT',
      url: window.location.href
    });
  } catch (err) {
    return;
  }

  if (!state || !state.enabled || state.isWhitelisted) {
    return;
  }

  function logCosmetic(category, level, message, details = {}) {
    try {
      chrome.runtime.sendMessage({
        type: 'NABLA_LOG_EVENT',
        event: {
          category,
          level,
          message,
          url: window.location.href,
          details
        }
      }).catch(() => {});
    } catch (e) {}
  }

  // 2. High-Priority Non-Breaking Cosmetic Stylesheet Injection
  const cosmeticCSS = `
    /* Nabla Cosmetic Filter — High-Precision Ad Collapser */
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
    if (document.getElementById('nabla-cosmetic-styles')) return;
    const styleEl = document.createElement('style');
    styleEl.id = 'nabla-cosmetic-styles';
    styleEl.textContent = cosmeticCSS;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleEl);
      logCosmetic('COSMETIC', 'INFO', 'Injected non-breaking cosmetic CSS rules');
    }
  }

  if (document.documentElement) {
    injectCosmeticStyles();
  } else {
    document.addEventListener('readystatechange', injectCosmeticStyles, { once: true });
  }

  // 3. Automated Cookie Consent & CMP Auto-Reject Engine
  if (state.cookieAutoReject) {
    const REJECT_BUTTON_SELECTORS = [
      '#onetrust-reject-all-handler',
      '.ot-pc-refuse-all-handler',
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
      '#CybotCookiebotDialogBodyButtonDecline',
      '.qc-cmp2-buttons-desktop button:last-child',
      'button[data-testid="uc-deny-all-button"]',
      '#didomi-notice-disagree-button',
      'button[aria-label*="reject" i]',
      'button[aria-label*="decline" i]',
      'button[aria-label*="refuse" i]',
      'button[aria-label*="ablehnen" i]'
    ];

    const CMP_CONTAINER_SELECTORS = [
      '#onetrust-consent-sdk',
      '#onetrust-banner-sdk',
      '#CybotCookiebotDialog',
      '#CybotCookiebotDialogBody',
      '.qc-cmp2-container',
      '#truste-consent-track',
      '#truste-consent-required',
      '.trustarc-banner',
      '#uc-banner',
      '#didomi-host',
      '[id*="cookie-banner" i]',
      '[class*="cookie-banner" i]',
      '[id*="consent-banner" i]',
      '[class*="consent-banner" i]',
      'div[aria-label*="cookie" i][role="dialog"]',
      'div[aria-label*="consent" i][role="dialog"]'
    ];

    const REJECT_TEXT_REGEX = /^(reject(\s*all)?|decline(\s*all)?|refuse(\s*all)?|deny(\s*all)?|necessary\s*only|only\s*necessary|essential\s*only|nur\s*notwendige|ablehnen|tout\s*refuser|rechazar(\s*todo)?|rifiuta)$/i;

    let cookieDismissed = false;

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

      // Stage A: Search for dedicated CMP reject buttons
      for (const sel of REJECT_BUTTON_SELECTORS) {
        const btn = document.querySelector(sel);
        if (btn && btn.offsetParent !== null) {
          btn.click();
          cookieDismissed = true;
          unlockScroll();
          logCosmetic('COOKIE', 'BLOCKED', `Auto-clicked CMP Reject button: ${sel}`);
          chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
          return;
        }
      }

      // Stage B: Scan buttons inside CMP containers
      for (const containerSel of CMP_CONTAINER_SELECTORS) {
        const container = document.querySelector(containerSel);
        if (container) {
          const buttons = container.querySelectorAll('button, [role="button"], a');
          for (const btn of buttons) {
            const txt = (btn.textContent || '').trim().replace(/\s+/g, ' ');
            if (REJECT_TEXT_REGEX.test(txt)) {
              btn.click();
              cookieDismissed = true;
              unlockScroll();
              logCosmetic('COOKIE', 'BLOCKED', `Auto-clicked Reject button matching text: "${txt}"`, { container: containerSel });
              chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
              return;
            }
          }

          // Stage C: Hide overlay cleanly
          container.style.setProperty('display', 'none', 'important');
          container.style.setProperty('visibility', 'hidden', 'important');
          container.style.setProperty('pointer-events', 'none', 'important');

          const backdrops = document.querySelectorAll('.modal-backdrop, .cmp-backdrop, .cookie-overlay, .fc-ab-root');
          backdrops.forEach((b) => b.remove());

          cookieDismissed = true;
          unlockScroll();
          logCosmetic('COOKIE', 'BLOCKED', `Neutralized CMP overlay container and backdrop: ${containerSel}`);
          chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
          return;
        }
      }
    }

    if (document.body) {
      attemptCookieDismissal();
    }

    const cmpObserver = new MutationObserver(() => {
      attemptCookieDismissal();
    });

    function startCMPObservation() {
      const target = document.body || document.documentElement;
      if (target) {
        cmpObserver.observe(target, { childList: true, subtree: true });
        setTimeout(() => {
          cmpObserver.disconnect();
          unlockScroll();
        }, 8000);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        attemptCookieDismissal();
        startCMPObservation();
      }, { once: true });
    } else {
      startCMPObservation();
    }
  }
})();
