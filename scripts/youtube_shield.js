/**
 * Nabla Ad Shield — Layer 3: Stealth YouTube Ad Mitigation
 * High-performance, anti-detection ad fast-forwarder, muter, auto-skipper,
 * and feed cleaner. Never destroys the main video player node.
 */

(async function initYouTubeShield() {
  'use strict';

  // 1. Check extension state
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

  // 2. Feed & Overlay Cosmetic Injection
  const ytStyle = document.createElement('style');
  ytStyle.id = 'nabla-yt-shield-styles';
  ytStyle.textContent = `
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
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  (document.head || document.documentElement).appendChild(ytStyle);

  // 3. Video Stream Fast-Forward & Auto-Skipper
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
    'button.ytp-ad-skip-button-modern'
  ];

  function tryClickSkip() {
    for (const sel of SKIP_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn && typeof btn.click === 'function') {
        btn.click();
        return true;
      }
    }
    // Also dismiss overlay ad close button
    const closeBtn = document.querySelector('.ytp-ad-overlay-close-button');
    if (closeBtn && typeof closeBtn.click === 'function') {
      closeBtn.click();
    }
    return false;
  }

  function handleVideoAds(player) {
    const video = player.querySelector('video');
    if (!video) return;

    const isAdShowing = player.classList.contains('ad-showing') ||
                        player.classList.contains('ad-interrupting');

    if (isAdShowing) {
      if (!wasAdActive) {
        // Save user state before tampering
        userMutedState = video.muted;
        userPlaybackRate = video.playbackRate || 1.0;
        wasAdActive = true;

        // Telemetry update
        chrome.runtime.sendMessage({ type: 'INCREMENT_BLOCKED', count: 1 }).catch(() => {});
      }

      // Mute ad stream instantly
      video.muted = true;

      // Accelerate stream to bypass countdown
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = video.duration;
      } else {
        video.playbackRate = 16.0;
      }

      // Trigger skip button programmatically
      tryClickSkip();
    } else if (wasAdActive) {
      // Ad ended: restore user configuration
      if (!userMutedState) {
        video.muted = false;
      }
      video.playbackRate = userPlaybackRate > 0 ? userPlaybackRate : 1.0;
      wasAdActive = false;
    }
  }

  function setupPlayerObserver() {
    const player = document.querySelector('.html5-video-player');
    if (!player) return;

    if (!observerAttached) {
      const observer = new MutationObserver(() => {
        handleVideoAds(player);
      });

      observer.observe(player, {
        attributes: true,
        attributeFilter: ['class'],
        childList: true,
        subtree: true
      });

      observerAttached = true;
    }

    // Immediate check
    handleVideoAds(player);
  }

  // Periodic polling safety net for YouTube SPA transitions
  setInterval(() => {
    const player = document.querySelector('.html5-video-player');
    if (player) {
      if (!observerAttached) {
        setupPlayerObserver();
      } else {
        handleVideoAds(player);
      }
    }
  }, 500);

  // YouTube SPA navigation events
  window.addEventListener('yt-navigate-finish', () => {
    observerAttached = false;
    setupPlayerObserver();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupPlayerObserver, { once: true });
  } else {
    setupPlayerObserver();
  }
})();
