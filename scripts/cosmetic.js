/**
 * Nabla Ad Shield — Layer 2: Zero-Latency Cosmetic & Safe Cookie Consent Engine
 *
 * Safety Guarantees (Universal Website Compatibility):
 *  - Never hides page roots, SPA wrappers (e.g. X.com Tailwind layouts), or non-ad banners
 *    like download-banner / head-banner.
 *  - Never removes DOM nodes from third-party SPAs (prevents React/Vue removeChild crashes).
 *  - Never clicks generic "reject/decline" buttons outside strictly verified cookie dialogs.
 *  - Never blindly hides Accept-only cookie walls or site popups with CSS, ensuring websites
 *    that require consent or popup interaction always stay functional.
 */

(async function initCosmeticFilter() {
  'use strict';

  // Skip empty/sandboxed blank documents and OAuth/payment/auth frames
  const href = window.location.href || '';
  const host = (window.location.hostname || '').toLowerCase();
  if (!host || href === 'about:blank' || href.startsWith('about:')) {
    return;
  }

  // YouTube DOM (including subframes inside YouTube) is handled exclusively by youtube_shield.js
  function isExcludedContext() {
    if (
      host.includes('youtube.com') ||
      host.includes('youtu.be') ||
      host.includes('googlevideo.com') ||
      /^(accounts|ogs|pay|payments|checkout)\./i.test(host) ||
      /(recaptcha\.net|hcaptcha\.com|challenges\.cloudflare\.com|stripe\.com|paypal\.com|appleid\.apple\.com)/i.test(
        host
      )
    ) {
      return true;
    }
    if (document.referrer && /youtube\.com|youtu\.be/i.test(document.referrer)) {
      return true;
    }
    const ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      for (let i = 0; i < ancestors.length; i++) {
        if (/youtube\.com|youtu\.be/i.test(ancestors[i])) return true;
      }
    }
    return false;
  }

  if (isExcludedContext()) {
    return;
  }

  const STYLE_ID = 'nabla-cosmetic-styles';

  // Strict ad-only selectors — no dangerous broad substring matches like [class*="ad-banner"]
  // (which falsely match download-banner, upload-banner, head-banner, has-ad-banner, etc.)
  const COSMETIC_CSS = `
    ins.adsbygoogle,
    amp-ad,
    amp-embed,
    amp-sticky-ad,
    [id^="div-gpt-ad"],
    [id^="google_ads_iframe"],
    [id^="google_ads_frame"],
    [id^="ad-unit-"],
    [id^="dfp-ad-"],
    .ad-container:not(html):not(body):not(main),
    .ad-wrapper:not(html):not(body):not(main),
    .ad-slot:not(html):not(body):not(main),
    .ad-banner:not(html):not(body):not(main),
    .advert-banner:not(html):not(body):not(main),
    .ad-placeholder:not(html):not(body):not(main),
    .sponsored-post:not(html):not(body):not(main),
    .sponsored-content:not(html):not(body):not(main),
    .sponsor-badge:not(html):not(body):not(main),
    .native-ad:not(html):not(body):not(main),
    [data-ad-client]:not(html):not(body):not(main):not(script),
    [data-ad-slot]:not(html):not(body):not(main),
    [data-ad-unit]:not(html):not(body):not(main),
    [data-adunit]:not(html):not(body):not(main),
    [data-adzone]:not(html):not(body):not(main),
    [data-google-query-id]:not(html):not(body):not(main),
    div[aria-label="Advertisement"],
    div[data-testid="ad-slot"],
    iframe[src*="doubleclick.net"],
    iframe[src*="googlesyndication.com"],
    iframe[src*="adnxs.com"],
    iframe[src*="criteo.com"],
    iframe[src*="amazon-adsystem.com"],
    iframe[src*="rubiconproject.com"],
    iframe[src*="pubmatic.com"],
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

  // 3. Site-Safe Automated Cookie Consent Auto-Reject Engine
  // Only clicks genuine Reject / Decline / Necessary-Only buttons inside verified cookie dialogs.
  // Never hides Accept-only walls, generic modals, or layout containers with CSS.
  if (!state.cookieAutoReject) return;

  // Stage A: Strictly unambiguous, vendor-specific CMP reject buttons ONLY.
  // Never include generic page-wide [aria-label*="decline"] or positional :last-child selectors!
  const VENDOR_REJECT_BUTTON_SELECTOR =
    '#onetrust-reject-all-handler,' +
    '.ot-pc-refuse-all-handler,' +
    '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll,' +
    '#CybotCookiebotDialogBodyButtonDecline,' +
    'button[data-testid="uc-deny-all-button"],' +
    '#didomi-notice-disagree-button,' +
    '.didomi-continue-without-agreeing,' +
    '.cky-btn-reject,' +
    '.cmplz-deny,' +
    '#wt-cli-reject-btn,' +
    '.cc-deny,' +
    '.fc-cta-do-not-consent,' +
    'button.sp_choice_type_13,' +
    '.iubenda-cs-reject-btn,' +
    '#ccc-reject-settings,' +
    '.cn-decline,' +
    'a._brlbs-refuse-btn,' +
    '[data-cookiebanner="decline_button"],' +
    'button[data-cookiefirst-action="reject"]';

  // Known dedicated CMP root containers (never page layout wrappers)
  const DEDICATED_CMP_CONTAINERS =
    '#onetrust-consent-sdk,' +
    '#onetrust-banner-sdk,' +
    '#CybotCookiebotDialog,' +
    '#CybotCookiebotDialogBody,' +
    '.qc-cmp2-container,' +
    '#truste-consent-track,' +
    '.trustarc-banner,' +
    '#uc-banner,' +
    '#usercentrics-root,' +
    'aside#usercentrics-cmp-ui,' +
    '#didomi-host,' +
    '.fc-consent-root,' +
    '.cky-consent-container,' +
    '.cmplz-cookiebanner,' +
    '#cookie-law-info-bar,' +
    '.cc-window,' +
    '[id^="sp_message_container_"],' +
    '#iubenda-cs-banner,' +
    '#ccc-module,' +
    '.klaro .cookie-notice,' +
    '.klaro .cookie-modal,' +
    '#BorlabsCookieBox,' +
    '[data-testid="BottomBar"],' +
    '#cmpwrapper';

  // Shadow DOM CMP hosts (Usercentrics, Consentmanager, CookieFirst, etc.)
  const SHADOW_CMP_HOSTS =
    '#usercentrics-root,' +
    'aside#usercentrics-cmp-ui,' +
    '#cmpwrapper,' +
    '#app-consent-root,' +
    'div[id*="usercentrics" i],' +
    '#cookiescript_injected_wrapper';

  // Multi-language strict Reject / Essential-Only button text matcher (EN, NL, DE, FR, ES, IT, PT, PL, TR)
  const REJECT_TEXT_REGEX =
    /^(reject(\s+all|\s+optional|\s+non[- ]?essential(\s+cookies)?)?|decline(\s+all|\s+optional|\s+non[- ]?essential(\s+cookies)?)?|refuse(\s+all|\s+non[- ]?essential(\s+cookies)?)?|deny(\s+all)?|disagree|do\s+not\s+(consent|accept|agree)|necessary(\s+cookies)?\s+only|only\s+necessary(\s+cookies)?|essential(\s+cookies)?\s+only|only\s+essential(\s+cookies)?|use\s+necessary\s+cookies\s+only|continue\s+without\s+(accepting|agreeing)|weigeren|alles\s+weigeren|alle\s+weigeren|weiger\s+alle[sn]?|alleen\s+(noodzakelijke?|essenti[eë]le?|functionele?)(\s+cookies)?|niet[- ]?essenti[eë]le\s+cookies\s+weigeren|niet\s+accepteren|niet\s+akkoord|afwijzen|doorgaan\s+zonder\s+(te\s+)?accepteren|verder\s+zonder\s+accepteren|ablehnen|alle\s+ablehnen|alles\s+ablehnen|nur\s+(notwendige|erforderliche|essenzielle)(\s+cookies)?|ohne\s+einwilligung\s+fortfahren|refuser|tout\s+refuser|refuser\s+tout|continuer\s+sans\s+accepter|rechazar(\s+todo)?|solo\s+necesarias|rifiuta(\s+tutto)?|continua\s+senza\s+accettare|rejeitar(\s+tudo)?|odrzu[cć](\s+wszystkie)?|reddet|t[uü]m[uü]n[uü]\s+reddet)$/i;

  const CONSENT_CONTEXT_REGEX =
    /\b(cookie|cookies|consent|gdpr|avg|privacy\s+preference|privacy\s+settings|privacyinstellingen|toestemming|datenschutz|einwilligung|confidentialit[eé]|privacidad|informativa)\b/i;

  const PROTECTED_CONTAINER_TAGS = new Set([
    'HTML',
    'BODY',
    'MAIN',
    'HEADER',
    'NAV',
    'FOOTER',
    'ARTICLE',
    'FORM',
    'TABLE'
  ]);

  const PROTECTED_ROOT_IDS = new Set([
    'root',
    'app',
    '__next',
    '__nuxt',
    'react-root',
    'gatsby-focus-wrapper',
    'main',
    'page',
    'wrapper',
    'content',
    'container'
  ]);

  // Strict class token matcher — ignores Tailwind arbitrary values (pb-[...--x-cookie-banner...])
  // and page-level state modifiers (has-cookie-banner, with-cookie-banner, cookie-banner-open)
  const STRICT_COOKIE_CLASS_TOKEN =
    /^(cookie|cookies|consent|gdpr|ccpa|cmp)[-_]?(banner|bar|notice|popup|modal|dialog|overlay|box|wrapper|container|consent|prompt|toast)$/i;

  let cookieDismissed = false;
  let cmpObserver = null;
  let cmpTimer = null;
  let fcStep1Clicked = false;

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

  function isClickableVisible(el) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
    try {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') {
        return false;
      }
      if (parseFloat(cs.opacity) === 0) return false;
      const rect = el.getBoundingClientRect();
      return rect.width >= 10 && rect.height >= 10;
    } catch (e) {
      return false;
    }
  }

  /**
   * Strict structural safety validator: guarantees we NEVER inspect or treat an SPA page root,
   * main layout wrapper (like X.com's Tailwind container), or auth/checkout modal as a cookie dialog.
   */
  function isSafeCookieDialog(el, isDedicatedVendor) {
    if (!el || el.nodeType !== 1) return false;
    if (el === document.documentElement || el === document.body) return false;
    if (PROTECTED_CONTAINER_TAGS.has(el.tagName)) return false;

    const idLower = (el.id || '').toLowerCase();
    if (idLower && PROTECTED_ROOT_IDS.has(idLower)) return false;

    // A cookie banner NEVER wraps the site's primary page landmarks or SPA mount point
    if (el.querySelector('main, article, nav, [role="main"], #react-root, #__next, #app, #root')) {
      return false;
    }

    // Never touch login, signup, search, or payment dialogs
    if (el.querySelector('input[type="password"], input[type="email"], input[type="search"]')) {
      return false;
    }

    // Check visible geometry
    let rect;
    let cs;
    try {
      cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      rect = el.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 20) return false;
    } catch (e) {
      return false;
    }

    if (!isDedicatedVendor) {
      // Non-dedicated containers must be bounded and look like a real overlay/dialog/bar,
      // not a full-page static layout flow wrapper!
      if (el.getElementsByTagName('*').length > 220) return false;

      const isOverlayPosition =
        cs.position === 'fixed' ||
        cs.position === 'sticky' ||
        cs.position === 'absolute' ||
        el.tagName === 'DIALOG' ||
        el.getAttribute('role') === 'dialog' ||
        el.getAttribute('role') === 'alertdialog';

      const isFullPageFlowWrapper =
        !isOverlayPosition && rect.height >= window.innerHeight * 0.7;
      if (isFullPageFlowWrapper) return false;
    }

    const snippet = (el.textContent || '').slice(0, 4000);
    if (!snippet.trim()) return false;
    if (!isDedicatedVendor && snippet.length > 3500) return false;

    return CONSENT_CONTEXT_REGEX.test(snippet);
  }

  function hasStrictCookieClassOrId(el) {
    if (!el || el.nodeType !== 1) return false;
    const id = el.id || '';
    if (id && STRICT_COOKIE_CLASS_TOKEN.test(id)) return true;

    const cls = typeof el.className === 'string' ? el.className : '';
    if (!cls) return false;

    const tokens = cls.split(/\s+/);
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      // Ignore Tailwind arbitrary syntax (pb-[...], [--x-cookie-banner...]) and modifier classes
      if (!tok || tok.includes('[') || tok.includes('--')) continue;
      if (STRICT_COOKIE_CLASS_TOKEN.test(tok)) return true;
    }
    return false;
  }

  function findAndClickRejectInRoot(root, sourceLabel) {
    if (!root) return false;

    // 1. Check unambiguous vendor reject button inside this root (works in Shadow DOM too)
    try {
      const vendorBtns = root.querySelectorAll(VENDOR_REJECT_BUTTON_SELECTOR);
      for (let i = 0; i < vendorBtns.length; i++) {
        const btn = vendorBtns[i];
        if (isClickableVisible(btn)) {
          recordCMPClick();
          btn.click();
          cookieDismissed = true;
          stopCMPObserver();
          report('COOKIE', 'BLOCKED', `Auto-clicked CMP Reject button (${sourceLabel})`, {}, 1);
          return true;
        }
      }
    } catch (e) {}

    // 2. Check buttons inside this verified cookie dialog by strict multi-language Reject text / aria-label
    try {
      const buttons = root.querySelectorAll(
        'button, [role="button"], input[type="button"], input[type="submit"], a'
      );
      for (let j = 0; j < buttons.length; j++) {
        const btn = buttons[j];
        if (!isClickableVisible(btn)) continue;

        const rawText = (btn.textContent || btn.value || '').trim().replace(/\s+/g, ' ');
        const ariaLabel = (btn.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');

        const matchedText =
          rawText.length > 0 && rawText.length <= 48 && REJECT_TEXT_REGEX.test(rawText)
            ? rawText
            : ariaLabel.length > 0 && ariaLabel.length <= 48 && REJECT_TEXT_REGEX.test(ariaLabel)
            ? ariaLabel
            : null;

        if (matchedText) {
          recordCMPClick();
          btn.click();
          cookieDismissed = true;
          stopCMPObserver();
          report('COOKIE', 'BLOCKED', `Auto-clicked Reject button: "${matchedText}"`, {}, 1);
          return true;
        }
      }
    } catch (e) {}

    return false;
  }

  /**
   * Safe 2-step handler for Google Funding Choices (.fc-consent-root) when only
   * "Consent" + "Manage options" are shown on Step 1. Clicking "Manage options" opens
   * Step 2 where all non-essential toggles default to OFF and "Confirm choices" saves cleanly.
   */
  function handleTwoStepFundingChoices() {
    const fcRoot = document.querySelector('.fc-consent-root');
    if (!fcRoot || !isSafeCookieDialog(fcRoot, true)) return false;

    const confirmBtn = fcRoot.querySelector('.fc-confirm-choices');
    if (confirmBtn && isClickableVisible(confirmBtn)) {
      recordCMPClick();
      confirmBtn.click();
      cookieDismissed = true;
      stopCMPObserver();
      report('COOKIE', 'BLOCKED', 'Auto-rejected Google Funding Choices (Confirm choices)', {}, 1);
      return true;
    }

    if (!fcStep1Clicked) {
      const manageBtn = fcRoot.querySelector('.fc-cta-manage-options');
      if (manageBtn && isClickableVisible(manageBtn)) {
        fcStep1Clicked = true;
        manageBtn.click();
        return false; // Keep observer running so Step 2 confirm button is clicked immediately
      }
    }
    return false;
  }

  function attemptCookieDismissal() {
    if (cookieDismissed) return;

    // Loop breaker: If we already clicked a reject button on this domain within 15s
    // and the site re-rendered or reloaded, DO NOT click again and DO NOT hide elements with CSS!
    if (isRecentCMPClick()) {
      cookieDismissed = true;
      stopCMPObserver();
      return;
    }

    // Stage A: Unambiguous vendor-specific reject buttons in light DOM
    const directBtns = document.querySelectorAll(VENDOR_REJECT_BUTTON_SELECTOR);
    for (let i = 0; i < directBtns.length; i++) {
      const btn = directBtns[i];
      if (isClickableVisible(btn)) {
        recordCMPClick();
        btn.click();
        cookieDismissed = true;
        stopCMPObserver();
        report('COOKIE', 'BLOCKED', `Auto-clicked CMP Reject button (#${btn.id || btn.className || btn.tagName})`, {}, 1);
        return;
      }
    }

    // Stage B: Shadow DOM CMP hosts (e.g. Usercentrics #usercentrics-root, #cmpwrapper)
    const shadowHosts = document.querySelectorAll(SHADOW_CMP_HOSTS);
    for (let i = 0; i < shadowHosts.length; i++) {
      const sr = shadowHosts[i].shadowRoot;
      if (sr && findAndClickRejectInRoot(sr, `shadow:${shadowHosts[i].id || shadowHosts[i].tagName}`)) {
        return;
      }
    }

    // Stage C: Dedicated CMP containers in light DOM (e.g. OneTrust, Cookiebot, Didomi, Quantcast, X.com BottomBar)
    const dedicatedContainers = document.querySelectorAll(DEDICATED_CMP_CONTAINERS);
    for (let i = 0; i < dedicatedContainers.length; i++) {
      const container = dedicatedContainers[i];
      if (!isSafeCookieDialog(container, true)) continue;
      if (findAndClickRejectInRoot(container, container.id || container.className || 'CMP')) {
        return;
      }
    }

    // Stage D: Google Funding Choices 2-step reject flow
    if (handleTwoStepFundingChoices()) {
      return;
    }

    // Stage E: Generic verified floating cookie dialogs / banners ONLY (never hides via CSS!)
    const dialogCandidates = document.querySelectorAll(
      '[role="dialog"], [role="alertdialog"], dialog, [aria-label*="cookie" i], [aria-label*="consent" i], [id*="cookie" i], [id*="consent" i]'
    );
    for (let i = 0; i < dialogCandidates.length; i++) {
      const el = dialogCandidates[i];
      const isExplicitDialog =
        el.tagName === 'DIALOG' ||
        el.getAttribute('role') === 'dialog' ||
        el.getAttribute('role') === 'alertdialog' ||
        hasStrictCookieClassOrId(el);

      if (!isExplicitDialog) continue;
      if (!isSafeCookieDialog(el, false)) continue;

      if (findAndClickRejectInRoot(el, el.id || el.getAttribute('role') || 'dialog')) {
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
      }, 10000);
    }
  }

  window.addEventListener('nabla-context-invalidated', stopCMPObserver, { once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startCMPObservation, { once: true });
  } else {
    startCMPObservation();
  }
})();
