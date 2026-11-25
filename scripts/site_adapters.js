/**
 * Nabla Ad Shield — Layer 2B: Modular Site-Adapter Registry
 *
 * Provides clean, isolated per-site ad & promo mitigation for major web apps
 * (X.com, Reddit, Twitch, News portals) without coupling site-specific logic
 * into cosmetic.js or risking SPA layout breakage.
 *
 * Safety Guarantees:
 *  - Runs only on matching hostnames (zero overhead on unrelated sites).
 *  - Never touches page root containers, modals/dialogs, login/checkout forms, or YouTube.
 *  - Never calls .remove() on third-party SPA DOM nodes (CSS hiding only).
 */

(async function initSiteAdapters() {
  'use strict';

  const href = window.location.href || '';
  const host = (window.location.hostname || '').toLowerCase();
  if (!host || href === 'about:blank' || href.startsWith('about:')) {
    return;
  }

  // YouTube is exclusively handled by youtube_main_world.js + youtube_shield.js
  if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('googlevideo.com')) {
    return;
  }

  const ADAPTER_STYLE_PREFIX = 'nabla-adapter-style-';

  const SITE_ADAPTERS = [
    {
      id: 'x-twitter',
      matches: (h) => h === 'x.com' || h.endsWith('.x.com') || h === 'twitter.com' || h.endsWith('.twitter.com'),
      // Surgical promoted-tweet hiding only; never touches root layout wrappers or modals
      css: `
        [data-testid="cellInnerDiv"]:has([data-testid="placementTracking"]),
        [data-testid="cellInnerDiv"]:has(article[data-testid="tweet"] [data-testid="promotedIndicator"]) {
          display: none !important;
          height: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `,
      onInit: (report, registerCleanup) => {
        const AD_BADGE_LABELS = new Set(['Ad', 'Promoted', 'Gesponsord', 'Anzeige', 'Sponsorisé', 'Promocionado']);
        const hiddenCells = new WeakSet();

        function scanPromotedTweets() {
          const articles = document.querySelectorAll('article[data-testid="tweet"]');
          for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const cell = article.closest('[data-testid="cellInnerDiv"]');
            if (!cell || hiddenCells.has(cell)) continue;

            // Only inspect short standalone badge spans inside the tweet header/footer
            const spans = article.querySelectorAll('span');
            let isPromoted = false;
            for (let j = 0; j < spans.length; j++) {
              const s = spans[j];
              if (s.children.length > 0) continue;
              const txt = (s.textContent || '').trim();
              if (AD_BADGE_LABELS.has(txt)) {
                // Verify it's not inside tweet body text ([data-testid="tweetText"])
                if (!s.closest('[data-testid="tweetText"]') && !s.closest('[data-testid="User-Name"]')) {
                  isPromoted = true;
                  break;
                }
              }
            }

            if (isPromoted) {
              hiddenCells.add(cell);
              cell.style.setProperty('display', 'none', 'important');
              report('COSMETIC', 'BLOCKED', 'Collapsed promoted post on X.com', { adapter: 'x-twitter' }, 1);
            }
          }
        }

        let rafScheduled = false;
        const observer = new MutationObserver(() => {
          if (rafScheduled) return;
          rafScheduled = true;
          requestAnimationFrame(() => {
            rafScheduled = false;
            scanPromotedTweets();
          });
        });

        const attach = () => {
          scanPromotedTweets();
          const root = document.body || document.documentElement;
          if (root) observer.observe(root, { childList: true, subtree: true });
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', attach, { once: true });
        } else {
          attach();
        }

        registerCleanup(() => observer.disconnect());
      }
    },
    {
      id: 'reddit',
      matches: (h) => h === 'reddit.com' || h.endsWith('.reddit.com'),
      css: `
        shreddit-ad-post,
        shreddit-comments-page-ad,
        shreddit-async-loader[bundlename="feed_ad"],
        shreddit-async-loader[bundlename="sidebar_ad"],
        .promotedlink,
        [data-testid="ad-frame"] {
          display: none !important;
          height: 0 !important;
          min-height: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `
    },
    {
      id: 'twitch',
      matches: (h) => h === 'twitch.tv' || h.endsWith('.twitch.tv'),
      // Display banners only — never touches Twitch video player or chat
      css: `
        .stream-display-ad__container,
        [data-a-target="video-ad-banner"],
        .channel-leaderboard-header-rotating__users--ad {
          display: none !important;
          height: 0 !important;
          overflow: hidden !important;
          pointer-events: none !important;
        }
      `
    }
  ];

  const matchedAdapters = SITE_ADAPTERS.filter((a) => a.matches(host));
  if (matchedAdapters.length === 0) {
    return;
  }

  function injectAdapterCss(adapter) {
    if (!adapter.css) return;
    const styleId = ADAPTER_STYLE_PREFIX + adapter.id;
    if (document.getElementById(styleId)) return;
    const el = document.createElement('style');
    el.id = styleId;
    el.textContent = adapter.css;
    const target = document.head || document.documentElement;
    if (target) target.appendChild(el);
  }

  function removeAllAdapterCss() {
    for (let i = 0; i < matchedAdapters.length; i++) {
      const existing = document.getElementById(ADAPTER_STYLE_PREFIX + matchedAdapters[i].id);
      if (existing) existing.remove();
    }
  }

  // 1. Optimistic 0ms CSS injection
  const optimisticallyOff =
    typeof window.__nablaIsOptimisticallyDisabled === 'function' &&
    window.__nablaIsOptimisticallyDisabled();

  if (!optimisticallyOff && document.documentElement) {
    for (let i = 0; i < matchedAdapters.length; i++) {
      injectAdapterCss(matchedAdapters[i]);
    }
  }

  // 2. Resolve shared state (~1ms)
  const state =
    typeof window.__nablaGetState === 'function'
      ? await window.__nablaGetState()
      : { enabled: false, isWhitelisted: false };

  if (!state.enabled || state.isWhitelisted) {
    removeAllAdapterCss();
    return;
  }

  const cleanups = [];
  function registerCleanup(fn) {
    if (typeof fn === 'function') cleanups.push(fn);
  }

  function report(category, level, message, details = {}, blockedIncrement = 0) {
    try {
      if (typeof window.__nablaReport === 'function') {
        window.__nablaReport(category, level, message, details, blockedIncrement);
      }
    } catch (e) {}
  }

  for (let i = 0; i < matchedAdapters.length; i++) {
    const adapter = matchedAdapters[i];
    if (document.documentElement) {
      injectAdapterCss(adapter);
    } else {
      document.addEventListener('readystatechange', () => injectAdapterCss(adapter), { once: true });
    }
    if (typeof adapter.onInit === 'function') {
      try {
        adapter.onInit(report, registerCleanup);
      } catch (e) {}
    }
  }

  window.addEventListener(
    'nabla-context-invalidated',
    () => {
      for (let i = 0; i < cleanups.length; i++) {
        try { cleanups[i](); } catch (e) {}
      }
    },
    { once: true }
  );
})();
