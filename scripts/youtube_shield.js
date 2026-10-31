/**
 * Nabla Ad Shield — Layer 3: Stealth YouTube Ad Mitigation & Grid Reflow
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

  logShieldAction('INFO', 'YouTube Shield initialized on current page');

  // 2. Feed & Grid Item Cosmetic CSS Injection
  // Crucial: targets the parent ytd-rich-item-renderer to prevent empty black boxes in grid!
  const ytStyle = document.createElement('style');
  ytStyle.id = 'nabla-yt-shield-styles';
  ytStyle.textContent = `
    /* Prevent empty black boxes: collapse the container grid cells */
    ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
    ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
    ytd-rich-item-renderer:has([id="masthead-ad"]),
    ytd-rich-item-renderer:has(.ytd-ad-slot-renderer),
    ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
    ytd-rich-section-renderer:has(ytd-banner-promo-renderer),
    ytd-rich-section-renderer:has(.ytd-banner-promo-renderer),
    ytd-ad-slot-renderer,
    ytd-in-feed-ad-layout-renderer,
    ytd-promoted-sparkles-web-renderer,
    ytd-promoted-video-renderer,
    #masthead-ad,
    ytd-banner-promo-renderer,
    ytd-statement-banner-renderer,
    ytd-display-ad-renderer,
    .ytd-action-companion-ad-renderer,
    ytd-companion-slot-renderer,
    .ytp-ad-progress-list,
    .ytp-ad-overlay-container,
    #player-ads {
      display: none !important;
      visibility: hidden !important;
      height: 0 !important;
      min-height: 0 !important;
      max-height: 0 !important;
      width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      border: none !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(ytStyle);

  // 3. Dynamic Grid Reflow Helper (cleans up any empty black slots)
  function cleanupAdGridSlots() {
    const adElements = document.querySelectorAll(
      'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, #masthead-ad, ytd-banner-promo-renderer'
    );

    for (const adEl of adElements) {
      const parentGridItem = adEl.closest('ytd-rich-item-renderer, ytd-rich-section-renderer');
      if (parentGridItem && parentGridItem.style.display !== 'none') {
        parentGridItem.style.setProperty('display', 'none', 'important');
        parentGridItem.style.setProperty('height', '0', 'important');
        parentGridItem.style.setProperty('margin', '0', 'important');
        parentGridItem.style.setProperty('padding', '0', 'important');

        logShieldAction('BLOCKED', 'Collapsed ad grid cell (prevented black gap)', {
          slotType: adEl.tagName,
          parentContainer: parentGridItem.tagName
        });

        chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
      }
    }
  }

  // 4. Video Stream Ad Accelerator & Auto-Skipper
  let wasAdActive = false;
  let userMutedState = false;
  let userPlaybackRate = 1.0;
  let observerAttached = false;

  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-SkipButton',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-text',
    'button.ytp-ad-skip-button-modern',
    'button[class*="ytp-ad-skip"]'
  ];

  function tryClickSkip() {
    let clicked = false;
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && typeof btn.click === 'function') {
        btn.click();
        clicked = true;
        logShieldAction('BLOCKED', `Triggered click on YouTube ad skip button: ${sel}`);
        break;
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
    const video = player.querySelector('video');
    if (!video) return;

    const isAdShowing = player.classList.contains('ad-showing') ||
                        player.classList.contains('ad-interrupting') ||
                        Boolean(document.querySelector('.video-ads.ytp-ad-module:not(:empty)'));

    if (isAdShowing) {
      if (!wasAdActive) {
        userMutedState = video.muted;
        userPlaybackRate = video.playbackRate || 1.0;
        wasAdActive = true;

        logShieldAction('BLOCKED', 'In-stream video ad detected. Muting and fast-forwarding stream.');
        chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
      }

      // 1. Mute ad audio instantly
      video.muted = true;

      // 2. Accelerate stream speed to maximum
      video.playbackRate = 16.0;

      // 3. Fast-forward to end if duration is valid
      if (isFinite(video.duration) && video.duration > 0) {
        // Jump near end of ad stream
        if (video.currentTime < video.duration - 0.2) {
          video.currentTime = Math.max(0, video.duration - 0.1);
        }
      }

      // 4. Continuously attempt skip button trigger
      tryClickSkip();
    } else if (wasAdActive) {
      // Ad finished: restore original user volume and playback speed
      if (!userMutedState) {
        video.muted = false;
      }
      video.playbackRate = userPlaybackRate > 0 ? userPlaybackRate : 1.0;
      wasAdActive = false;

      logShieldAction('INFO', 'Video ad stream finished. Normal playback restored.');
    }
  }

  function setupPlayerObserver() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    if (!observerAttached) {
      const observer = new MutationObserver(() => {
        handleVideoAds(player);
        cleanupAdGridSlots();
      });

      observer.observe(player, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });

      observerAttached = true;
    }

    handleVideoAds(player);
    cleanupAdGridSlots();
  }

  // Periodic polling safety net for YouTube dynamic feeds
  setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    if (player) {
      if (!observerAttached) {
        setupPlayerObserver();
      } else {
        handleVideoAds(player);
      }
    }
    cleanupAdGridSlots();
  }, 400);

  // YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', () => {
    observerAttached = false;
    setupPlayerObserver();
    cleanupAdGridSlots();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupPlayerObserver();
      cleanupAdGridSlots();
    }, { once: true });
  } else {
    setupPlayerObserver();
    cleanupAdGridSlots();
  }
})();
