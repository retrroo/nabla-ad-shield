/**
 * Nabla Ad Shield — Layer 4: Zero-Cost On-Device Heuristic Classifier
 * Vanilla JS heuristic evaluation of dynamic DOM elements without cloud APIs.
 * Analyzes standard IAB dimensions, URL entropy, z-index, and promotional tokens.
 * Emits telemetry events to the diagnostic logging engine.
 */

(async function initHeuristicClassifier() {
  'use strict';

  // YouTube DOM is handled exclusively by youtube_shield.js to prevent false positives on video cards
  if (window.location.hostname.includes('youtube.com')) {
    return;
  }

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

  function logHeuristic(level, message, details = {}) {
    try {
      chrome.runtime.sendMessage({
        type: 'NABLA_LOG_EVENT',
        event: {
          category: 'HEURISTIC',
          level,
          message,
          url: window.location.href,
          details
        }
      }).catch(() => {});
    } catch (e) {}
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
    if (['nav', 'header', 'footer', 'main', 'article', 'form', 'video'].includes(tagName)) {
      return true;
    }

    if (el.closest('nav, header, [role="navigation"], [role="main"]')) {
      return true;
    }

    const paragraphs = el.querySelectorAll('p');
    if (paragraphs.length >= 3) {
      const textLen = (el.innerText || '').length;
      if (textLen > 400) return true;
    }

    return false;
  }

  /**
   * Evaluates feature weights for a candidate element
   */
  function scoreElement(el) {
    if (el.dataset.nablaNeutralized === 'true') return { score: 0, features: [] };
    if (isCoreContent(el)) return { score: 0, features: ['core_content_bypass'] };

    let score = 0.0;
    const features = [];
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    // Feature 1: Standard IAB Dimension Match (+0.35)
    if (width > 0 && height > 0) {
      for (const [w, h] of IAB_DIMENSIONS) {
        if (Math.abs(width - w) <= 4 && Math.abs(height - h) <= 4) {
          score += 0.35;
          features.push(`IAB_${w}x${h}`);
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
          features.push('Cross-Origin Ad URL');
        }
      } catch (e) {}
    }

    // Feature 3: Promotional Label Match in innerText (+0.35)
    const textSnippet = (el.innerText || '').slice(0, 120).trim();
    if (textSnippet && textSnippet.length < 80 && PROMO_TOKEN_REGEX.test(textSnippet)) {
      score += 0.35;
      features.push(`Promo Text ("${textSnippet.slice(0, 30)}")`);
    }

    // Feature 4: High z-index Sticky / Fixed Docked Overlay (+0.25)
    try {
      const style = window.getComputedStyle(el);
      const isFixed = style.position === 'fixed' || style.position === 'sticky';
      const zIndex = parseInt(style.zIndex, 10);

      if (isFixed && zIndex >= 999) {
        if (rect.top <= 10 || rect.bottom >= window.innerHeight - 10) {
          score += 0.25;
          features.push('High z-index sticky overlay');
        }
      }
    } catch (e) {}

    // Feature 5: Suspicious Ad Attributes (+0.25)
    if (
      el.hasAttribute('data-google-query-id') ||
      el.hasAttribute('data-ad-client') ||
      el.hasAttribute('data-dmp-id') ||
      el.className?.toString().includes('google-auto-placed')
    ) {
      score += 0.25;
      features.push('Ad Vendor Dataset Attributes');
    }

    return { score, features, width, height };
  }

  /**
   * Neutralize elements scoring >= 0.85
   */
  function neutralizeCandidate(el, evaluation) {
    el.dataset.nablaNeutralized = 'true';
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('max-height', '0', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');

    logHeuristic('BLOCKED', `Heuristic AI neutralized element (Score: ${evaluation.score.toFixed(2)})`, {
      score: evaluation.score,
      features: evaluation.features,
      dimensions: `${evaluation.width}x${evaluation.height}`,
      tag: el.tagName,
      id: el.id,
      className: typeof el.className === 'string' ? el.className.slice(0, 60) : ''
    });

    chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
  }

  /**
   * Scan candidate elements in DOM
   */
  function scanCandidates() {
    const candidates = document.querySelectorAll('iframe, div, aside');
    for (const el of candidates) {
      const evalResult = scoreElement(el);
      if (evalResult.score >= 0.85) {
        neutralizeCandidate(el, evalResult);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      scanCandidates();
    }, { once: true });
  } else {
    scanCandidates();
  }

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
