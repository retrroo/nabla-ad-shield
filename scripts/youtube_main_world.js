/**
 * Nabla Ad Shield — Layer 3A: YouTube Main-World Shield
 * Runs in MAIN world at document_start on *.youtube.com.
 *
 * Provides:
 *  - Native google_ad_status compliance so YouTube canary probes always pass.
 *  - Safe sessionStorage cleanup of stale anti-adblock flags.
 *  - Root player payload pruning (ytInitialPlayerResponse + /youtubei/v1/player fetch)
 *    so ads are eliminated before player instantiation, preventing player stall.
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
    if (!data || typeof data !== 'object') return data;
    try {
      if (data.adPlacements) delete data.adPlacements;
      if (data.playerAds) delete data.playerAds;
      if (data.adSlots) delete data.adSlots;
      if (data.adBreakHeartbeatParams) delete data.adBreakHeartbeatParams;

      // If YouTube marked playback UNPLAYABLE due to adblock detection, restore to OK
      if (data.playabilityStatus && data.playabilityStatus.status === 'UNPLAYABLE') {
        const fullErr = (data.playabilityStatus.reason || '') + ' ' + JSON.stringify(data.playabilityStatus.errorScreen || {});
        if (/ad blocker|terms of service|3037019/i.test(fullErr)) {
          data.playabilityStatus.status = 'OK';
          delete data.playabilityStatus.errorScreen;
          delete data.playabilityStatus.reason;
          delete data.playabilityStatus.subreason;
        }
      }
    } catch (e) {}
    return data;
  }

  // Intercept window.ytInitialPlayerResponse for initial SSR page loads
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
  if (_ytInitialPlayerResponse) {
    pruneAds(_ytInitialPlayerResponse);
  }
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

  function pruneWindowPlayerResponse() {
    if (window.ytInitialPlayerResponse) {
      pruneAds(window.ytInitialPlayerResponse);
    }
  }
  pruneWindowPlayerResponse();
  document.addEventListener('DOMContentLoaded', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-navigate-start', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-navigate-finish', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-page-data-updated', pruneWindowPlayerResponse, { passive: true });

  // Intercept fetch for SPA /youtubei/v1/player requests using native Proxy
  if (typeof window.fetch === 'function') {
    const nativeFetch = window.fetch;
    window.fetch = new Proxy(nativeFetch, {
      apply(target, thisArg, args) {
        const fetchPromise = Reflect.apply(target, thisArg, args);
        const resource = args[0];
        const url = typeof resource === 'string' ? resource : (resource && resource.url) || '';

        if (typeof url === 'string' && url.includes('/youtubei/v1/player')) {
          return fetchPromise.then(responseBefore => {
            if (!responseBefore || !responseBefore.ok) return responseBefore;
            const cloned = responseBefore.clone();
            return cloned.json().then(objBefore => {
              if (typeof objBefore !== 'object' || objBefore === null) return responseBefore;
              const objAfter = pruneAds(objBefore);
              const responseAfter = Response.json(objAfter, {
                status: responseBefore.status,
                statusText: responseBefore.statusText,
                headers: responseBefore.headers
              });
              Object.defineProperties(responseAfter, {
                ok: { value: responseBefore.ok },
                redirected: { value: responseBefore.redirected },
                type: { value: responseBefore.type },
                url: { value: responseBefore.url }
              });
              return responseAfter;
            }).catch(() => responseBefore);
          }).catch(() => fetchPromise);
        }

        return fetchPromise;
      }
    });
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
