/**
 * Nabla Ad Shield — Layer 3B: Stealth YouTube Ad Mitigation & Grid Reflow
 * High-performance, anti-detection ad fast-forwarder, muter, auto-skipper,
 * and feed cleaner. Prevents blank/black card grid artifacts and logs all actions.
 */

(async function initYouTubeShield() {
  'use strict';

  // 1. Verify extension state
  let state;
  try {
    state = await chrome.runtime.sendMessage({
      type: 'GET_STATE_FOR_CONTENT',
      url: window.location.href
    });
  } catch (e) {
    return;
  }

  if (!state || !state.enabled || state.isWhitelisted) {
    if (document.documentElement) {
      document.documentElement.dataset.nablaYoutubeDisabled = 'true';
    }
    return;
  }

  function logShieldAction(level, message, details = {}) {
    try {
      chrome.runtime.sendMessage({
        type: 'NABLA_LOG_EVENT',
        event: {
          category: 'YOUTUBE',
          level,
          message,
          url: window.location.href,
          details
        }
      }).catch(() => {});
    } catch (e) {}
  }

  // Forward logs from the MAIN world player sanitizer script
  window.addEventListener('nabla-yt-main-log', (event) => {
    if (event.detail) {
      logShieldAction('BLOCKED', event.detail.message, event.detail.details || {});
      chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
    }
  });

  logShieldAction('INFO', 'YouTube Shield initialized (DOM + Main-World Sanitizer active)');

  // 2. Feed & Grid Item Cosmetic CSS Injection
  const ytStyle = document.createElement('style');
  ytStyle.id = 'nabla-yt-shield-styles';
  ytStyle.textContent = `
    /* Collapse marked and ad-bearing grid containers completely so flex/grid items shift left */
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
    if (!document.getElementById('nabla-yt-shield-styles')) {
      (document.head || document.documentElement).appendChild(ytStyle);
    }
  }

  if (document.documentElement) {
    injectStyles();
  } else {
    document.addEventListener('readystatechange', injectStyles, { once: true });
  }

  // 3. Deduplicated Dynamic Grid Reflow & Row Backfiller
  function cleanupAdGridSlots() {
    injectStyles();

    const adElements = document.querySelectorAll(
      'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #masthead-ad, ytd-banner-promo-renderer, ytd-statement-banner-renderer, ytd-display-ad-renderer'
    );

    for (const adEl of adElements) {
      if (adEl.dataset.nablaHandled === 'true') continue;
      adEl.dataset.nablaHandled = 'true';

      const parentGridItem = adEl.closest('ytd-rich-item-renderer, ytd-rich-section-renderer');
      if (parentGridItem) {
        parentGridItem.setAttribute('data-nabla-hidden', 'true');
        parentGridItem.style.setProperty('display', 'none', 'important');

        // Check if YouTube wrapped items in <ytd-rich-grid-row>
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

        logShieldAction('BLOCKED', 'Collapsed YouTube feed ad container', {
          slotType: adEl.tagName,
          parentContainer: parentGridItem.tagName,
          insideGridRow: Boolean(parentRow),
          backfilledRow: backfilled
        });

        chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
      }
    }
  }

  // 4. Instant Video Stream Ad Accelerator & Auto-Skipper
  let wasAdActive = false;
  let userMutedState = false;
  let userPlaybackRate = 1.0;
  let observedPlayer = null;
  let boundVideo = null;

  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-SkipButton',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-text',
    'button.ytp-ad-skip-button-modern',
    'button[class*="ytp-ad-skip"]',
    '.ytp-ad-skip-button-container button'
  ];

  function tryClickSkip() {
    let clicked = false;
    for (const sel of SKIP_SELECTORS) {
      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        if (btn && typeof btn.click === 'function') {
          btn.click();
          clicked = true;
          logShieldAction('BLOCKED', `Triggered click on YouTube skip button: ${sel}`);
        }
      }
    }

    const overlayClose = document.querySelector('.ytp-ad-overlay-close-button');
    if (overlayClose && typeof overlayClose.click === 'function') {
      overlayClose.click();
      clicked = true;
      logShieldAction('BLOCKED', 'Closed video overlay banner ad');
    }

    return clicked;
  }

  function handleVideoAds(player) {
    if (!player) return;
    const video = player.querySelector('video.html5-main-video') || player.querySelector('video');
    if (!video) return;

    // Attach direct media listeners to the <video> element once
    if (boundVideo !== video) {
      boundVideo = video;
      const onMediaEvent = () => {
        if (
          player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting')
        ) {
          handleVideoAds(player);
        }
      };
      video.addEventListener('play', onMediaEvent, { passive: true });
      video.addEventListener('playing', onMediaEvent, { passive: true });
      video.addEventListener('loadedmetadata', onMediaEvent, { passive: true });
      video.addEventListener('timeupdate', onMediaEvent, { passive: true });
    }

    const isAdShowing =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting') ||
      Boolean(player.querySelector('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout'));

    if (isAdShowing) {
      if (!wasAdActive) {
        userMutedState = video.muted;
        userPlaybackRate = video.playbackRate && video.playbackRate <= 2 ? video.playbackRate : 1.0;
        wasAdActive = true;

        logShieldAction('BLOCKED', 'In-stream video ad intercepted. Muting & skipping.', {
          duration: video.duration,
          currentTime: video.currentTime
        });
        chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
      }

      // 1. Mute ad audio immediately
      video.muted = true;

      // 2. Accelerate playback rate to 16x
      try {
        video.playbackRate = 16.0;
      } catch (e) {}

      // 3. Jump to end of ad stream if duration is known
      if (isFinite(video.duration) && video.duration > 0.5) {
        const targetTime = Math.max(0, video.duration - 0.05);
        if (video.currentTime < targetTime) {
          try {
            video.currentTime = targetTime;
          } catch (e) {}
        }
      }

      // 4. Click skip button if present
      tryClickSkip();
    } else if (wasAdActive) {
      // Ad ended: restore user volume and playback rate
      if (!userMutedState) {
        video.muted = false;
      }
      try {
        video.playbackRate = userPlaybackRate > 0 ? userPlaybackRate : 1.0;
      } catch (e) {}
      wasAdActive = false;

      logShieldAction('INFO', 'Video ad cleared. Restored user playback state.');
    }
  }

  function setupObservers() {
    const player = document.querySelector('.html5-video-player');
    if (player && observedPlayer !== player) {
      observedPlayer = player;
      const playerObserver = new MutationObserver(() => {
        handleVideoAds(player);
      });

      playerObserver.observe(player, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });

      handleVideoAds(player);
    }

    cleanupAdGridSlots();
  }

  // Observe page-wide DOM additions for feed ad slots (debounced via requestAnimationFrame)
  let feedRafScheduled = false;
  const feedObserver = new MutationObserver(() => {
    if (!feedRafScheduled) {
      feedRafScheduled = true;
      requestAnimationFrame(() => {
        setupObservers();
        feedRafScheduled = false;
      });
    }
  });

  function startFeedObserver() {
    const root = document.body || document.documentElement;
    if (root) {
      feedObserver.observe(root, { childList: true, subtree: true });
    }
    setupObservers();
  }

  window.addEventListener('yt-navigate-finish', () => {
    setupObservers();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startFeedObserver, { once: true });
  } else {
    startFeedObserver();
  }
})();
