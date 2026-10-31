/**
 * Nabla Ad Shield — Layer 3B: Glitch-Free YouTube Shield & Grid Reflow
 *
 * Key Stability & Evasion Guarantees:
 *  - Visual Ad Cloaking: Sets opacity: 0 on the video & ad overlays ONLY while .ad-showing is active
 *    so zero ad frames ever flash while keeping Chromium's MSE decoder running.
 *  - MSE-Safe Seeking: Never forces high playbackRate while readyState === 0 / duration === NaN
 *    (which stalls Chromium's DASH buffer). Waits ~50ms for loadedmetadata/durationchange, then
 *    jumps cleanly to video.duration.
 *  - Visible-Only Skip Clicks: Ignores hidden pre-rendered .ytp-skip-ad-button nodes and throttles
 *    clicks to prevent event-loop spam.
 */

(async function initYouTubeShield() {
  'use strict';

  const STYLE_ID = 'nabla-yt-shield-styles';

  const YT_SHIELD_CSS = `
    /* 1. Feed & Sidebar Ad Container Collapse (prevents empty black grid holes) */
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

    /* 2. In-Stream Ad Visual Cloak (hides ad frames without pausing MSE decoding) */
    .html5-video-player.ad-showing video.html5-main-video,
    .html5-video-player.ad-interrupting video.html5-main-video,
    .html5-video-player.ad-showing .ytp-ad-player-overlay,
    .html5-video-player.ad-showing .ytp-ad-player-overlay-layout,
    .html5-video-player.ad-showing .ytp-ad-action-interstitial,
    .html5-video-player.ad-showing .ytp-ad-image-overlay {
      opacity: 0 !important;
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

  report('YOUTUBE', 'INFO', 'YouTube Shield active (Honeypot-Safe Sanitizer + MSE-Safe Skipper)', {}, 0);

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

  // 4. MSE-Safe Video Ad Fast-Forwarder & Visible-Only Skipper
  let wasAdActive = false;
  let userMutedState = false;
  let userPlaybackRate = 1.0;
  let lastSkipClickTime = 0;
  let lastSeekedDuration = -1;
  let observedPlayer = null;
  let observedAdModule = null;
  let boundVideo = null;

  const SKIP_COMBINED_SELECTOR =
    '.ytp-ad-skip-button,' +
    '.ytp-ad-skip-button-modern,' +
    '.ytp-ad-SkipButton,' +
    '.ytp-skip-ad-button,' +
    'button.ytp-ad-skip-button-modern,' +
    '.ytp-ad-skip-button-container button';

  function isElementGenuinelyVisible(el) {
    if (!el || el.offsetParent === null) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  function tryClickVisibleSkip() {
    const now = performance.now();
    if (now - lastSkipClickTime < 800) return;

    const buttons = document.querySelectorAll(SKIP_COMBINED_SELECTOR);
    for (let i = 0; i < buttons.length; i++) {
      const btn = buttons[i];
      if (isElementGenuinelyVisible(btn) && typeof btn.click === 'function') {
        lastSkipClickTime = now;
        btn.click();
        report('YOUTUBE', 'BLOCKED', `Clicked visible skip button (${btn.className || btn.tagName})`, {}, 0);
        break;
      }
    }

    const overlayClose = document.querySelector('.ytp-ad-overlay-close-button');
    if (isElementGenuinelyVisible(overlayClose) && typeof overlayClose.click === 'function') {
      lastSkipClickTime = now;
      overlayClose.click();
      report('YOUTUBE', 'BLOCKED', 'Closed video overlay banner ad', {}, 0);
    }
  }

  function handleVideoAds(player) {
    if (!player) return;

    const isAdShowing =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');

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
        lastSeekedDuration = -1;

        report(
          'YOUTUBE',
          'BLOCKED',
          'In-stream video ad intercepted (cloaked & muted)',
          {
            readyState: video.readyState,
            duration: isFinite(video.duration) ? Number(video.duration.toFixed(2)) : 'loading'
          },
          1
        );
      }

      // 1. Always mute audio immediately
      video.muted = true;

      // 2. Ensure ad is not paused at 0.00s waiting for user interaction
      if (video.paused && !video.ended) {
        video.play().catch(() => {});
      }

      // 3. MSE-Safe fast-forward: ONLY seek or boost rate AFTER metadata is loaded!
      const dur = video.duration;
      if (video.readyState >= 1 && isFinite(dur) && dur > 0.2) {
        // Seek directly to the end once per ad duration so HTML5 fires 'ended' cleanly
        if (Math.abs(dur - lastSeekedDuration) > 0.1 && video.currentTime < dur - 0.1) {
          lastSeekedDuration = dur;
          try {
            video.currentTime = dur;
            report(
              'YOUTUBE',
              'BLOCKED',
              `Skipped ad stream to end (${dur.toFixed(1)}s)`,
              { duration: dur },
              0
            );
          } catch (e) {}
        }

        // Fallback if seek was clamped: smooth 8x rate only when buffer has frames (readyState >= 3)
        if (dur - video.currentTime > 0.5 && video.readyState >= 3) {
          try {
            if (video.playbackRate !== 8.0) {
              video.playbackRate = 8.0;
            }
          } catch (e) {}
        }
      } else {
        // Metadata still loading (readyState === 0): keep playbackRate at 1.0 so MSE never stalls!
        if (video.playbackRate > 2.0) {
          try {
            video.playbackRate = 1.0;
          } catch (e) {}
        }
      }

      // 4. Click skip button ONLY if genuinely visible
      tryClickVisibleSkip();
    } else if (wasAdActive) {
      // Ad finished: restore user audio & normal playback speed immediately
      if (!userMutedState) {
        video.muted = false;
      }
      try {
        video.playbackRate = userPlaybackRate > 0 ? userPlaybackRate : 1.0;
      } catch (e) {}
      wasAdActive = false;
      lastSeekedDuration = -1;

      report('YOUTUBE', 'INFO', 'Ad bypassed cleanly. Main video playing.', {}, 0);
    }
  }

  function attachPlayerHooks(player) {
    if (!player) return;

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

    const adModule = player.querySelector('.ytp-ad-module');
    if (adModule && observedAdModule !== adModule) {
      observedAdModule = adModule;
      const adModuleObserver = new MutationObserver(() => {
        if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
          handleVideoAds(player);
        }
      });
      adModuleObserver.observe(adModule, { childList: true, subtree: true });
    }

    const video = player.querySelector('video.html5-main-video') || player.querySelector('video');
    if (video && boundVideo !== video) {
      boundVideo = video;
      const fastMediaCheck = () => {
        if (wasAdActive || player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
          handleVideoAds(player);
        }
      };
      video.addEventListener('play', fastMediaCheck, { passive: true });
      video.addEventListener('playing', fastMediaCheck, { passive: true });
      video.addEventListener('loadedmetadata', fastMediaCheck, { passive: true });
      video.addEventListener('durationchange', fastMediaCheck, { passive: true });
      video.addEventListener('canplay', fastMediaCheck, { passive: true });
      video.addEventListener('timeupdate', fastMediaCheck, { passive: true });
    }

    handleVideoAds(player);
  }

  function runSyncCheck() {
    const player = document.querySelector('.html5-video-player');
    if (player) attachPlayerHooks(player);
    cleanupAdGridSlots();
  }

  let feedRafScheduled = false;
  const feedObserver = new MutationObserver((mutations) => {
    if (feedRafScheduled) return;

    let relevantAddition = false;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
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
