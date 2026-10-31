/**
 * Nabla Ad Shield — Layer 4: Zero-Cost On-Device Heuristic Classifier
 * Vanilla JS heuristic evaluation of dynamic DOM elements without cloud APIs.
 * Analyzes standard IAB dimensions, URL entropy, z-index, and promotional tokens.
 */

(async function initHeuristicClassifier() {
  'use strict';

  // 1. Verify extension state
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

  // Standard IAB Ad Dimensions [width, height] with tolerance
  const IAB_DIMENSIONS = [
    [300, 250], // Medium Rectangle
    [728, 90],  // Leaderboard
    [160, 600], // Wide Skyscraper
    [320, 50],  // Mobile Leaderboard
    [300, 600], // Half Page
    [970, 250], // Billboard
    [336, 280], // Large Rectangle
    [120, 600], // Skyscraper
    [468, 60],  // Banner
    [970, 90]   // Super Leaderboard
  ];

  const PROMO_TOKEN_REGEX = /\b(advertisement|sponsored|promoted|adchoices|sponsoris[ée]|anzeige|werbung|publicidad|pubblicit[àa]|reklama)\b/i;
  const AD_URL_REGEX = /(gampad|doubleclick|ad_client|adunit|click_url|safeframe|adnxs|criteo|outbrain|taboola|amazon-adsystem)/i;

  const currentHost = window.location.hostname.replace(/^www\./, '').toLowerCase();

  /**
   * Determine whether an element is core site navigation or article content
   */
  function isCoreContent(el) {
    const tagName = el.tagName.toLowerCase();
    if (['nav', 'header', 'footer', 'main', 'article', 'form'].includes(tagName)) {
      return true;
    }

    if (el.closest('nav, header, [role="navigation"], [role="main"]')) {
      return true;
    }

    // Protect article bodies with substantive text density
    const paragraphs = el.querySelectorAll('p');
    if (paragraphs.length >= 3) {
      const textLen = (el.innerText || '').length;
      if (textLen > 400) return true;
    }

    return false;
  }

  /**
   * Evaluates feature weights for a candidate element
   * Returns confidence score between 0.0 and 1.0
   */
  function scoreElement(el) {
    if (el.dataset.nablaNeutralized === 'true') return 0;
    if (isCoreContent(el)) return 0;

    let score = 0.0;
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Feature 1: Standard IAB Dimension Match (+0.35)
    if (width > 0 && height > 0) {
      for (const [w, h] of IAB_DIMENSIONS) {
        if (Math.abs(width - w) <= 4 && Math.abs(height - h) <= 4) {
          score += 0.35;
          break;
        }
      }
    }

    // Feature 2: Cross-Origin Ad URL & Query Entropy (+0.35)
    let src = '';
    if (el.tagName.toLowerCase() === 'iframe') {
      src = el.src || el.getAttribute('data-src') || '';
    } else {
      const iframe = el.querySelector('iframe');
      if (iframe) src = iframe.src || iframe.getAttribute('data-src') || '';
    }

    if (src) {
      try {
        const parsed = new URL(src, window.location.href);
        const frameHost = parsed.hostname.replace(/^www\./, '').toLowerCase();
        const isCrossOrigin = frameHost && frameHost !== currentHost;

        if (isCrossOrigin && (AD_URL_REGEX.test(src) || parsed.search.length > 70)) {
          score += 0.35;
        }
      } catch (e) {
        // Ignored
      }
    }

    // Feature 3: Promotional Label Match in innerText (+0.35)
    // Only test if text is short (avoid false positives on articles discussing ads)
    const textSnippet = (el.innerText || '').slice(0, 120).trim();
    if (textSnippet && textSnippet.length < 80 && PROMO_TOKEN_REGEX.test(textSnippet)) {
      score += 0.35;
    }

    // Feature 4: High z-index Sticky / Fixed Docked Overlay (+0.25)
    try {
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed' || style.position === 'sticky';
      const zIndex = parseInt(style.zIndex, 10);

      if (isFixed && zIndex >= 999) {
        // Sticky banner pinned to viewport edge
        if (rect.top <= 10 || rect.bottom >= window.innerHeight - 10) {
          score += 0.25;
        }
      }
    } catch (e) {
      // Ignored
    }

    // Feature 5: Suspicious Ad Attributes (+0.25)
    if (
      el.hasAttribute('data-google-query-id') ||
      el.hasAttribute('data-ad-client') ||
      el.hasAttribute('data-dmp-id') ||
      el.className?.toString().includes('google-auto-placed')
    ) {
      score += 0.25;
    }

    return score;
  }

  /**
   * Neutralize elements scoring >= 0.85
   */
  function neutralizeCandidate(el) {
    el.dataset.nablaNeutralized = 'true';
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');

    // Notify background telemetry
    chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
  }

  /**
   * Scan candidate elements in DOM
   */
  function scanCandidates() {
    const candidates = document.querySelectorAll('iframe, div, aside');
    for (const el of candidates) {
      if (scoreElement(el) >= 0.85) {
        neutralizeCandidate(el);
      }
    }
  }

  // Initial scan after DOM content loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanCandidates();
    }, { once: true });
  } else {
    scanCandidates();
  }

  // MutationObserver for dynamic ad injections
  let scanScheduled = false;
  const observer = new MutationObserver((mutations) => {
    let hasNewElements = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        hasNewElements = true;
        break;
      }
    }

    if (hasNewElements && !scanScheduled) {
      scanScheduled = true;
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => {
          scanCandidates();
          scanScheduled = false;
        }, { timeout: 800 });
      } else {
        setTimeout(() => {
          scanCandidates();
          scanScheduled = false;
        }, 300);
      }
    }
  });

  const root = document.body || document.documentElement;
  if (root) {
    observer.observe(root, { childList: true, subtree: true });
  }
})();
