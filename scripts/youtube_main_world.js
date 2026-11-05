/**
 * Nabla Ad Shield — Layer 3A: YouTube Main-World Shield
 * Runs in MAIN world at document_start on *.youtube.com.
 *
 * Provides:
 *  - Native google_ad_status compliance so YouTube canary probes always pass.
 *  - Safe sessionStorage cleanup of stale anti-adblock flags.
 *  - Zero tampering with Promise or JSON.parse prototypes (eliminates player stall/black screen).
 */

(function initYouTubeMainWorld() {
  'use strict';

  function isShieldDisabled() {
    try {
      const rootData = document.documentElement?.dataset;
      if (rootData && (rootData.nablaDisabled === 'true' || rootData.nablaYoutubeDisabled === 'true')) {
        return true;
      }
      return sessionStorage.getItem('__nabla_off') === '1';
    } catch (e) {
      return false;
    }
  }

  if (isShieldDisabled()) return;

  // 1. Clear any stale anti-adblock flags from browser storage
  try {
    sessionStorage.removeItem('yt-player-ad-block');
    sessionStorage.removeItem('yt-remote-session-app');
  } catch (e) {}

  // 2. Surgical Player Payload Pruning (eliminates pre-roll & mid-roll ads at root)
  function pruneAds(data) {
    if (!data || typeof data !== 'object' || isShieldDisabled()) return data;
    try {
      delete data.adPlacements;
      delete data.playerAds;
      delete data.adSlots;
    } catch (e) {}
    return data;
  }

  // Intercept window.ytInitialPlayerResponse for initial SSR page loads
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      enumerable: true,
      get() {
        return _ytInitialPlayerResponse;
      },
      set(val) {
        _ytInitialPlayerResponse = pruneAds(val);
      }
    });
  } catch (e) {}
  if (_ytInitialPlayerResponse) {
    _ytInitialPlayerResponse = pruneAds(_ytInitialPlayerResponse);
  }

  // Intercept fetch for SPA /youtubei/v1/player and midroll ad_break requests
  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = async function (resource, init) {
      const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

      // Intercept and neutralize mid-roll ad requests cleanly without 404/network errors
      if (url.includes('/youtubei/v1/player/ad_break') || url.includes('/pagead/')) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const response = await nativeFetch.apply(this, arguments);

      // Prune ad placement trees from dynamic player payload fetches
      if (url.includes('/youtubei/v1/player')) {
        try {
          const originalJson = response.json.bind(response);
          response.json = async function () {
            const data = await originalJson();
            return pruneAds(data);
          };
        } catch (e) {}
      }

      return response;
    };

    try {
      Object.defineProperty(window.fetch, 'toString', {
        value: () => 'function fetch() { [native code] }',
        configurable: true
      });
    } catch (e) {}
  }

  // 3. Keep YouTube's internal ad status satisfied across all SPA navigations
  function ensureAdStatus() {
    try {
      window.google_ad_status = 1;
    } catch (e) {}
  }

  ensureAdStatus();

  try {
    if (typeof window.google_ad_status === 'undefined') {
      Object.defineProperty(window, 'google_ad_status', {
        get: () => 1,
        set: () => {},
        configurable: true,
        enumerable: true
      });
    }
  } catch (e) {
    ensureAdStatus();
  }

  // 4. Safe Player Playback Resumer (NEVER calls loadVideoById mid-stream)
  function attemptPlayerRecovery() {
    if (isShieldDisabled()) return;
    if (window.location.pathname !== '/watch') return;

    const player = document.getElementById('movie_player') || window.movie_player;
    if (player && typeof player.playVideo === 'function') {
      try {
        player.playVideo();
      } catch (e) {}
    }

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }

  window.addEventListener('nabla-request-player-recovery', attemptPlayerRecovery, { passive: true });
  document.addEventListener('yt-navigate-start', ensureAdStatus, { passive: true });
  document.addEventListener('yt-navigate-finish', ensureAdStatus, { passive: true });
  document.addEventListener('yt-page-data-updated', ensureAdStatus, { passive: true });
  window.addEventListener('popstate', ensureAdStatus, { passive: true });
})();
