/**
 * Nabla Ad Shield — Layer 3B: High-Efficiency YouTube Shield & Grid Reflow
 * Optimized with:
 *  - 0ms optimistic stylesheet injection (zero layout flash)
 *  - Shared ~1ms storage state lookup (zero Service Worker cold-start wakeup)
 *  - Scoped MutationObservers (ignores 60fps player progress bar & caption ticks)
 *  - Batched telemetry IPC via __nablaReport
 */

(async function initYouTubeShield() {
  'use strict';

  const STYLE_ID = 'nabla-yt-shield-styles';

  const YT_SHIELD_CSS = `
    ytd-rich-item-renderer[data-nabla-hidden="true"],
    ytd-rich-section-renderer[data-nabla-hidden="true"],
    ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
    ytd-rich-item-renderer:has(ytd-display-ad-renderer),
    ytd-rich-item-renderer:has([id="masthead-ad"]),
    ytd-rich-item-renderer:has(.ytd-ad-slot-renderer),
    ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    ytd-rich-section-renderer:has(ytd-banner-promo-renderer),
    ytd-rich-section-renderer:has(#masthead-ad),
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-sparkles-text-search-renderer,
    ytd-promoted-video-renderer,
    ytd-compact-promoted-video-renderer,
    #masthead-ad,
    ytd-banner-promo-renderer,
    ytd-statement-banner-renderer,
    ytd-display-ad-renderer,
    .ytd-action-companion-ad-renderer,
    ytd-companion-slot-renderer,
    ytd-player-legacy-desktop-watch-ads-renderer,
    ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
    .ytp-ad-progress-list,
    .ytp-ad-overlay-container,
    #player-ads {
      display: none !important;
      content-visibility: hidden !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const ytStyle = document.createElement('style');
    ytStyle.id = STYLE_ID;
    ytStyle.textContent = YT_SHIELD_CSS;
    const target = document.head || document.documentElement;
    if (target) target.appendChild(ytStyle);
  }

  function removeStyles() {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  // 1. Optimistic 0ms CSS injection at document_start
  const optimisticallyOff =
    typeof window.__nablaIsOptimisticallyDisabled === 'function' &&
    window.__nablaIsOptimisticallyDisabled();

  if (!optimisticallyOff && document.documentElement) {
    injectStyles();
  }

  // 2. Resolve shared ~1ms state
  const state =
    typeof window.__nablaGetState === 'function'
      ? await window.__nablaGetState()
      : { enabled: false, isWhitelisted: false };

  if (!state.enabled || state.isWhitelisted) {
    removeStyles();
    if (document.documentElement) {
      document.documentElement.dataset.nablaYoutubeDisabled = 'true';
    }
    return;
  }

  if (document.documentElement) {
    injectStyles();
  } else {
    document.addEventListener('readystatechange', injectStyles, { once: true });
  }

  const report = window.__nablaReport || function () {};

  // Forward logs from the MAIN world player sanitizer script into batched queue
  window.addEventListener('nabla-yt-main-log', (event) => {
    if (event.detail) {
      report('YOUTUBE', 'BLOCKED', event.detail.message, event.detail.details || {}, 1);
    }
  });

  report('YOUTUBE', 'INFO', 'YouTube Shield active (Zero-Latency CSS + Main-World Sanitizer)', {}, 0);

  // 3. Deduplicated Dynamic Grid Reflow & Row Backfiller
  const AD_GRID_SELECTOR =
    'ytd-ad-slot-renderer:not([data-nabla-handled]),' +
    'ytd-in-feed-ad-layout-renderer:not([data-nabla-handled]),' +
    '#masthead-ad:not([data-nabla-handled]),' +
    'ytd-banner-promo-renderer:not([data-nabla-handled]),' +
    'ytd-statement-banner-renderer:not([data-nabla-handled]),' +
    'ytd-display-ad-renderer:not([data-nabla-handled])';

  function cleanupAdGridSlots() {
    const adElements = document.querySelectorAll(AD_GRID_SELECTOR);
    if (adElements.length === 0) return;

    for (let i = 0; i < adElements.length; i++) {
      const adEl = adElements[i];
      adEl.dataset.nablaHandled = 'true';

      const parentGridItem = adEl.closest('ytd-rich-item-renderer, ytd-rich-section-renderer');
      if (parentGridItem) {
        parentGridItem.setAttribute('data-nabla-hidden', 'true');
        parentGridItem.style.setProperty('display', 'none', 'important');

        let backfilled = false;
        const parentRow = parentGridItem.closest('ytd-rich-grid-row');
        if (parentRow) {
          const rowContents = parentRow.querySelector('#contents');
          const nextRow = parentRow.nextElementSibling;
          if (rowContents && nextRow && nextRow.tagName === 'YTD-RICH-GRID-ROW') {
            const candidateReplacement = nextRow.querySelector(
              'ytd-rich-item-renderer:not([data-nabla-hidden="true"]):not(:has(ytd-ad-slot-renderer))'
            );
            if (candidateReplacement) {
              rowContents.appendChild(candidateReplacement);
              backfilled = true;
            }
          }
        }

        report(
          'YOUTUBE',
          'BLOCKED',
          'Collapsed YouTube feed ad container',
          {
            slotType: adEl.tagName,
            parentContainer: parentGridItem.tagName,
            insideGridRow: Boolean(parentRow),
            backfilledRow: backfilled
          },
          1
        );
      }
    }
  }

  // 4. Instant Video Stream Ad Accelerator & Auto-Skipper
  let wasAdActive = false;
  let userMutedState = false;
  let userPlaybackRate = 1.0;
  let observedPlayer = null;
  let observedAdModule = null;
  let boundVideo = null;

  const SKIP_COMBINED_SELECTOR =
    '.ytp-ad-skip-button,' +
    '.ytp-ad-skip-button-modern,' +
    '.ytp-ad-SkipButton,' +
    '.ytp-skip-ad-button,' +
    '.ytp-ad-skip-button-text,' +
    'button.ytp-ad-skip-button-modern,' +
    'button[class*="ytp-ad-skip"],' +
    '.ytp-ad-skip-button-container button';

  function tryClickSkip() {
    const buttons = document.querySelectorAll(SKIP_COMBINED_SELECTOR);
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (typeof btn.click === 'function') {
        btn.click();
        report('YOUTUBE', 'BLOCKED', `Triggered YouTube ad skip button (${btn.className || btn.tagName})`, {}, 0);
      }
    }

    const overlayClose = document.querySelector('.ytp-ad-overlay-close-button');
    if (overlayClose && typeof overlayClose.click === 'function') {
      overlayClose.click();
      report('YOUTUBE', 'BLOCKED', 'Closed video overlay banner ad', {}, 0);
    }
  }

  function handleVideoAds(player) {
    if (!player) return;

    const isAdShowing =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');

    // Fast bailout when no ad is playing and no cleanup is needed
    if (!isAdShowing && !wasAdActive) {
      return;
    }

    const video = player.querySelector('video.html5-main-video') || player.querySelector('video');
    if (!video) return;

    if (isAdShowing) {
      if (!wasAdActive) {
        userMutedState = video.muted;
        userPlaybackRate = video.playbackRate && video.playbackRate <= 2 ? video.playbackRate : 1.0;
        wasAdActive = true;

        report(
          'YOUTUBE',
          'BLOCKED',
          'In-stream video ad intercepted. Muting & fast-forwarding.',
          { duration: video.duration, currentTime: video.currentTime },
          1
        );
      }

      video.muted = true;

      try {
        if (video.playbackRate !== 16.0) {
          video.playbackRate = 16.0;
        }
      } catch (e) {}

      if (isFinite(video.duration) && video.duration > 0.5) {
        const targetTime = Math.max(0, video.duration - 0.05);
        if (video.currentTime < targetTime) {
          try {
            video.currentTime = targetTime;
          } catch (e) {}
        }
      }

      tryClickSkip();
    } else if (wasAdActive) {
      if (!userMutedState) {
        video.muted = false;
      }
      try {
        video.playbackRate = userPlaybackRate > 0 ? userPlaybackRate : 1.0;
      } catch (e) {}
      wasAdActive = false;

      report('YOUTUBE', 'INFO', 'Video ad cleared. Restored user playback state.', {}, 0);
    }
  }

  function attachPlayerHooks(player) {
    if (!player) return;

    // Watch ONLY player class changes (zero overhead during normal playback)
    if (observedPlayer !== player) {
      observedPlayer = player;
      const classObserver = new MutationObserver(() => {
        handleVideoAds(player);
      });
      classObserver.observe(player, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    // Watch ONLY the tiny .ytp-ad-module container for late-appearing skip buttons
    const adModule = player.querySelector('.ytp-ad-module');
    if (adModule && observedAdModule !== adModule) {
      observedAdModule = adModule;
      const adModuleObserver = new MutationObserver(() => {
        if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
          tryClickSkip();
        }
      });
      adModuleObserver.observe(adModule, { childList: true, subtree: true });
    }

    // Bind ultra-fast 1-boolean-check media listeners directly on <video>
    const video = player.querySelector('video.html5-main-video') || player.querySelector('video');
    if (video && boundVideo !== video) {
      boundVideo = video;
      const fastMediaCheck = () => {
        if (wasAdActive || player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
          handleVideoAds(player);
        }
      };
      video.addEventListener('play', fastMediaCheck, { passive: true });
      video.addEventListener('loadedmetadata', fastMediaCheck, { passive: true });
      video.addEventListener('timeupdate', fastMediaCheck, { passive: true });
    }

    handleVideoAds(player);
  }

  function runSyncCheck() {
    const player = document.querySelector('.html5-video-player');
    if (player) attachPlayerHooks(player);
    cleanupAdGridSlots();
  }

  // Feed observer: ignores internal video player progress/caption ticks completely
  let feedRafScheduled = false;
  const feedObserver = new MutationObserver((mutations) => {
    if (feedRafScheduled) return;

    let relevantAddition = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      // Skip high-frequency player UI updates (progress bar, time display, captions)
      if (observedPlayer && observedPlayer.contains(m.target)) continue;

      const added = m.addedNodes;
      for (let j = 0; j < added.length; j++) {
        if (added[j].nodeType === 1) {
          relevantAddition = true;
          break;
        }
      }
      if (relevantAddition) break;
    }

    if (!relevantAddition) return;

    feedRafScheduled = true;
    requestAnimationFrame(() => {
      feedRafScheduled = false;
      runSyncCheck();
    });
  });

  function startFeedObserver() {
    const root = document.body || document.documentElement;
    if (root) {
      feedObserver.observe(root, { childList: true, subtree: true });
    }
    runSyncCheck();
  }

  window.addEventListener('yt-navigate-finish', runSyncCheck, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startFeedObserver, { once: true });
  } else {
    startFeedObserver();
  }
})();
