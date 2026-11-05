/**
 * Nabla Ad Shield — Layer 4: High-Velocity On-Device Heuristic Classifier
 * Optimized with:
 *  - WeakSet memoization (each DOM node evaluated at most once)
 *  - Incremental subtree scanning (only newly mutated nodes are inspected)
 *  - Strict Read/Write phase separation (zero forced synchronous layout reflows)
 *  - Mathematical short-circuiting (skips getComputedStyle when score < 0.60)
 */

(async function initHeuristicClassifier() {
  'use strict';

  // YouTube DOM is handled exclusively by youtube_shield.js
  if (window.location.hostname.includes('youtube.com')) {
    return;
  }

  // 1. Resolve shared ~1ms state (zero Service Worker wakeup)
  const state =
    typeof window.__nablaGetState === 'function'
      ? await window.__nablaGetState()
      : { enabled: false, isWhitelisted: false };

  if (!state.enabled || state.isWhitelisted) {
    return;
  }

  let heuristicDisposed = false;

  function report(category, level, message, details = {}, blockedIncrement = 0) {
    if (heuristicDisposed) return;
    try {
      if (typeof window.__nablaReport === 'function') {
        window.__nablaReport(category, level, message, details, blockedIncrement);
      }
    } catch (e) {}
  }

  // Standard IAB Ad Dimensions [width, height]
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

  const PROMO_TOKEN_REGEX =
    /\b(advertisement|sponsored|promoted|adchoices|sponsoris[ée]|anzeige|werbung|publicidad|pubblicit[àa]|reklama)\b/i;
  const AD_URL_REGEX =
    /(gampad|doubleclick|ad_client|adunit|click_url|safeframe|adnxs|criteo|outbrain|taboola|amazon-adsystem)/i;

  const currentHost = window.location.hostname.replace(/^www\./i, '').toLowerCase();
  const isInsideIframe = window.self !== window.top;
  const evaluatedNodes = new WeakSet();

  const PROTECTED_TAGS = new Set([
    'NAV',
    'HEADER',
    'FOOTER',
    'MAIN',
    'ARTICLE',
    'FORM',
    'VIDEO',
    'SECTION'
  ]);

  /**
   * Fast structural guard to protect navigation and editorial content without layout reflow.
   * Elements with obvious ad attributes or ad server iframes are explicitly excluded from being core content.
   */
  function isCoreContent(el) {
    const classStr = typeof el.className === 'string' ? el.className : '';
    if (
      el.hasAttribute('data-google-query-id') ||
      el.hasAttribute('data-ad-client') ||
      el.hasAttribute('data-dmp-id') ||
      classStr.includes('google-auto-placed')
    ) {
      return false;
    }

    if (el.tagName === 'IFRAME') {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      if (src && AD_URL_REGEX.test(src)) {
        return false;
      }
    }

    if (PROTECTED_TAGS.has(el.tagName)) return true;

    // Large layout wrappers with many child blocks are never standalone ad units
    if (el.children.length > 25) return true;

    const rawText = el.textContent || '';
    if (rawText.length > 450) {
      if (el.getElementsByTagName('p').length >= 3) return true;
    }

    if (el.closest('nav, header, [role="navigation"], [role="main"]')) {
      return true;
    }

    return false;
  }

  /**
   * Read-only scoring pass (never mutates DOM styles during geometry reads)
   */
  function scoreElement(el) {
    if (evaluatedNodes.has(el)) return null;
    if (el.dataset.nablaNeutralized === 'true') return null;

    if (isCoreContent(el)) {
      evaluatedNodes.add(el);
      return null;
    }

    let score = 0.0;
    const features = [];

    // Feature 5 (evaluated early — cheap C++ attribute check): Suspicious Ad Attributes (+0.30)
    const classStr = typeof el.className === 'string' ? el.className : '';
    const idStr = typeof el.id === 'string' ? el.id : '';
    if (
      el.hasAttribute('data-google-query-id') ||
      el.hasAttribute('data-ad-client') ||
      el.hasAttribute('data-dmp-id') ||
      classStr.includes('google-auto-placed') ||
      /google_ads_iframe|dfp-ad|gpt-ad|ad-slot|ad-unit|ad-container/i.test(idStr)
    ) {
      score += 0.30;
      features.push('Ad Vendor Attributes');
    }

    // Inside an ad subframe, the frame itself carries the ad URL & entropy (+0.40)
    if (isInsideIframe) {
      const currentUrl = window.location.href;
      if (AD_URL_REGEX.test(currentUrl) || window.location.search.length > 50) {
        score += 0.40;
        features.push('Inside Ad Subframe');
      }
    }

    // Feature 2 (cheap attribute check): Cross-Origin Ad URL & Query Entropy (+0.35)
    let src = '';
    if (el.tagName === 'IFRAME') {
      src = el.getAttribute('src') || el.getAttribute('data-src') || '';
    } else {
      const childIframe = el.querySelector('iframe');
      if (childIframe) {
        src = childIframe.getAttribute('src') || childIframe.getAttribute('data-src') || '';
      }
    }

    if (src) {
      try {
        const parsed = new URL(src, window.location.href);
        const frameHost = parsed.hostname.replace(/^www\./i, '').toLowerCase();
        if (frameHost && frameHost !== currentHost && (AD_URL_REGEX.test(src) || parsed.search.length > 70)) {
          score += 0.35;
          features.push('Cross-Origin Ad URL');
        }
      } catch (e) {}
    }

    // Feature 3 (zero-reflow textContent check): Promotional Label Match (+0.35)
    const textSnippet = (el.textContent || '').slice(0, 120).trim();
    if (textSnippet.length > 0 && textSnippet.length < 80 && PROMO_TOKEN_REGEX.test(textSnippet)) {
      score += 0.35;
      features.push(`Promo Token ("${textSnippet.slice(0, 28)}")`);
    }

    // Mathematical Early Exit #1:
    // Remaining features are Feature 1 (+0.35) and Feature 4 (+0.25), max +0.60.
    // If current score < 0.05, even matching BOTH cannot reach the 0.65 threshold! Skip getBoundingClientRect() completely!
    if (score < 0.05) {
      if (el.tagName !== 'IFRAME' || src) {
        evaluatedNodes.add(el);
      }
      return null;
    }

    // Feature 1: Standard IAB Dimension Match (+0.35)
    const rect = el.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (width > 0 && height > 0) {
      for (let i = 0; i < IAB_DIMENSIONS.length; i++) {
        const w = IAB_DIMENSIONS[i][0];
        const h = IAB_DIMENSIONS[i][1];
        if (Math.abs(width - w) <= 4 && Math.abs(height - h) <= 4) {
          score += 0.35;
          features.push(`IAB_${w}x${h}`);
          break;
        }
      }
      evaluatedNodes.add(el);
    }

    // Mathematical Early Exit #2:
    // Only Feature 4 (+0.25) remains. If score >= 0.40 and < 0.65, check expensive getComputedStyle()
    if (score >= 0.40 && score < 0.65) {
      try {
        const style = window.getComputedStyle(el);
        if (style.position === 'fixed' || style.position === 'sticky') {
          const zIndex = parseInt(style.zIndex, 10);
          if (zIndex >= 999 && (rect.top <= 10 || rect.bottom >= window.innerHeight - 10)) {
            score += 0.25;
            features.push('High z-index sticky overlay');
          }
        }
      } catch (e) {}
    }

    if (score >= 0.65) {
      return { el, score, features, width, height, classStr };
    }

    return null;
  }

  /**
   * Two-phase scan:
   * Phase 1 reads DOM/geometry on candidate nodes.
   * Phase 2 mutates styles in one batch (zero layout thrashing).
   */
  function processCandidateCollection(elements) {
    const matchesToCollapse = [];

    // Phase 1: Pure Reads
    for (let i = 0; i < elements.length; i++) {
      const result = scoreElement(elements[i]);
      if (result) {
        matchesToCollapse.push(result);
      }
    }

    // Phase 2: Batched Writes
    for (let i = 0; i < matchesToCollapse.length; i++) {
      const { el, score, features, width, height, classStr } = matchesToCollapse[i];
      el.dataset.nablaNeutralized = 'true';
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('height', '0', 'important');
      el.style.setProperty('min-height', '0', 'important');
      el.style.setProperty('max-height', '0', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
      el.style.setProperty('overflow', 'hidden', 'important');

      report(
        'HEURISTIC',
        'BLOCKED',
        `Heuristic AI neutralized element (Score: ${score.toFixed(2)})`,
        {
          score,
          features,
          dimensions: `${width}x${height}`,
          tag: el.tagName,
          id: el.id,
          className: classStr.slice(0, 60)
        },
        1
      );
    }
  }

  function runInitialScan() {
    const candidates = document.querySelectorAll('iframe, div, aside');
    processCandidateCollection(candidates);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInitialScan, { once: true });
  } else {
    runInitialScan();
  }

  // Incremental Subtree Mutation Queue
  const pendingRoots = new Set();
  let scanScheduled = false;

  function flushPendingRoots() {
    scanScheduled = false;
    if (pendingRoots.size === 0) return;

    const candidates = [];
    pendingRoots.forEach((root) => {
      if (!root.isConnected) return;
      const tag = root.tagName;
      if (tag === 'IFRAME' || tag === 'DIV' || tag === 'ASIDE') {
        candidates.push(root);
      }
      const nested = root.querySelectorAll('iframe, div, aside');
      for (let i = 0; i < nested.length; i++) {
        candidates.push(nested[i]);
      }
    });
    pendingRoots.clear();

    if (candidates.length > 0) {
      processCandidateCollection(candidates);
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const added = mutations[i].addedNodes;
      for (let j = 0; j < added.length; j++) {
        const node = added[j];
        if (node.nodeType === 1) {
          pendingRoots.add(node);
        }
      }
    }

    if (pendingRoots.size > 0 && !scanScheduled) {
      scanScheduled = true;
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(flushPendingRoots, { timeout: 600 });
      } else {
        setTimeout(flushPendingRoots, 200);
      }
    }
  });

  function attachMutationObserver() {
    const root = document.body || document.documentElement;
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  }

  window.addEventListener(
    'nabla-context-invalidated',
    () => {
      heuristicDisposed = true;
      observer.disconnect();
      pendingRoots.clear();
    },
    { once: true }
  );

  if (document.body) {
    attachMutationObserver();
  } else {
    document.addEventListener('DOMContentLoaded', attachMutationObserver, { once: true });
  }
})();
