/**
 * Nabla Ad Shield — Layer 3A: YouTube Main-World Shield
 * Runs in MAIN world at document_start on *.youtube.com.
 *
 * Provides:
 *  - Neutralization of YouTube's internal onAbnormalityDetected anomaly check via Promise.prototype.then proxy.
 *  - Disabling of adBlockMessageViewModel in yt.config_ and Object.prototype.adBlocksFound = 0.
 *  - Native google_ad_status compliance so YouTube canary probes always pass.
 *  - Safe sessionStorage cleanup of stale anti-adblock flags.
 *  - Surgical JSON.parse, Response.text & Response.json payload pruning (eliminates adPlacements,
 *    playerAds, adSlots, adBreakHeartbeatParams at the root).
 *  - Automatic stream recovery via movie_player.loadVideoById if YouTube marks a stream unplayable.
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

  // 2. Disarm YouTube's onAbnormalityDetected anomaly reporter via Promise.prototype.then Proxy
  try {
    const originalThen = window.Promise.prototype.then;
    window.Promise.prototype.then = new Proxy(originalThen, {
      apply(target, thisArg, args) {
        const handler = args[0];
        if (typeof handler === 'function') {
          try {
            const fnStr = Function.prototype.toString.call(handler);
            if (fnStr.includes('onAbnormalityDetected')) {
              args[0] = function () {};
            }
          } catch (e) {}
        }
        return Reflect.apply(target, thisArg, args);
      }
    });
  } catch (e) {}

  // 3. Spoof adBlocksFound and disarm adBlockMessageViewModel in YouTube config
  try {
    if (!('adBlocksFound' in Object.prototype)) {
      Object.defineProperty(Object.prototype, 'adBlocksFound', {
        get: () => 0,
        set: () => {},
        configurable: true
      });
    }
  } catch (e) {}

  function disableAdblockPopups() {
    try {
      if (window.yt?.config_?.openPopupConfig?.supportedPopups) {
        window.yt.config_.openPopupConfig.supportedPopups.adBlockMessageViewModel = false;
      }
    } catch (e) {}
  }
  disableAdblockPopups();
  document.addEventListener('DOMContentLoaded', disableAdblockPopups, { passive: true });
  window.addEventListener('yt-navigate-finish', disableAdblockPopups, { passive: true });

  // 4. Dynamic Player Stream Restorer via movie_player.loadVideoById
  let recoveryDebounce = 0;
  function attemptPlayerRecovery() {
    if (isShieldDisabled()) return;
    if (!window.location.pathname.startsWith('/watch')) return;

    const now = performance.now();
    if (now - recoveryDebounce < 800) return;
    recoveryDebounce = now;

    const player = document.getElementById('movie_player') || window.movie_player;
    if (!player) return;

    try {
      const videoData = typeof player.getVideoData === 'function' ? player.getVideoData() : null;
      const urlParams = new URLSearchParams(window.location.search);
      const videoId = videoData?.video_id || urlParams.get('v');
      const currentTime = typeof player.getCurrentTime === 'function' ? player.getCurrentTime() : 0;
      const startTime = currentTime > 1 ? currentTime : parseInt(urlParams.get('t'), 10) || 0;

      const playerResponse = typeof player.getPlayerResponse === 'function' ? player.getPlayerResponse() : null;
      const playability = playerResponse?.playabilityStatus?.status;

      // If YouTube marked the video UNPLAYABLE or removed stream data, reload the video
      if (videoId && (playability === 'UNPLAYABLE' || playability === 'ERROR' || !playerResponse?.streamingData)) {
        if (typeof player.loadVideoById === 'function') {
          player.loadVideoById(videoId, startTime);
          return;
        }
      }

      if (typeof player.playVideo === 'function') {
        player.playVideo();
      }
    } catch (e) {}

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (video && video.paused) {
      video.play().catch(() => {});
    }
  }

  window.addEventListener('nabla-request-player-recovery', attemptPlayerRecovery, { passive: true });

  // 5. Surgical Player Payload Pruning (eliminates pre-roll & mid-roll ads at root)
  function pruneAds(data) {
    if (!data || typeof data !== 'object') return data;
    try {
      let prunedCount = 0;
      const prunedTypes = [];

      if (data.adPlacements) {
        delete data.adPlacements;
        prunedCount++;
        prunedTypes.push('adPlacements');
      }
      if (data.playerAds) {
        delete data.playerAds;
        prunedCount++;
        prunedTypes.push('playerAds');
      }
      if (data.adSlots) {
        delete data.adSlots;
        prunedCount++;
        prunedTypes.push('adSlots');
      }
      if (data.adBreakHeartbeatParams) {
        delete data.adBreakHeartbeatParams;
        prunedCount++;
        prunedTypes.push('adBreakHeartbeatParams');
      }
      if (data.playerResponse && typeof data.playerResponse === 'object') {
        pruneAds(data.playerResponse);
      }

      // If YouTube marked playback UNPLAYABLE due to adblock detection, restore to OK
      if (data.playabilityStatus && data.playabilityStatus.status === 'UNPLAYABLE') {
        const fullErr = (data.playabilityStatus.reason || '') + ' ' + JSON.stringify(data.playabilityStatus.errorScreen || {});
        if (/ad blocker|terms of service|3037019/i.test(fullErr)) {
          if (data.streamingData) {
            data.playabilityStatus.status = 'OK';
            delete data.playabilityStatus.errorScreen;
            delete data.playabilityStatus.reason;
            delete data.playabilityStatus.subreason;
          } else {
            setTimeout(attemptPlayerRecovery, 50);
          }
        }
      }

      if (prunedCount > 0) {
        try {
          window.dispatchEvent(
            new CustomEvent('nabla-yt-main-log', {
              detail: {
                message: `Pruned YouTube root ad payload (${prunedTypes.join(', ')})`,
                details: { prunedCount, prunedTypes }
              }
            })
          );
        } catch (e) {}
      }
    } catch (e) {}
    return data;
  }

  // Intercept JSON.parse (uBlock Origin json-prune scriptlet equivalent)
  try {
    const originalJsonParse = JSON.parse;
    JSON.parse = function (text, reviver) {
      const parsed = originalJsonParse.apply(this, arguments);
      if (
        typeof text === 'string' &&
        (text.includes('adPlacements') || text.includes('playerAds') || text.includes('adSlots') || text.includes('adBreakHeartbeatParams'))
      ) {
        return pruneAds(parsed);
      }
      return parsed;
    };
  } catch (e) {}

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
  } catch (e) {
    if (window.ytInitialPlayerResponse) {
      pruneAds(window.ytInitialPlayerResponse);
    }
  }

  function pruneWindowPlayerResponse() {
    if (window.ytInitialPlayerResponse) {
      pruneAds(window.ytInitialPlayerResponse);
    }
    if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) {
      const args = window.ytplayer.config.args;
      if (args.raw_player_response) {
        if (typeof args.raw_player_response === 'string') {
          try {
            args.raw_player_response = JSON.stringify(pruneAds(JSON.parse(args.raw_player_response)));
          } catch (e) {}
        } else if (typeof args.raw_player_response === 'object') {
          pruneAds(args.raw_player_response);
        }
      }
      if (args.player_response) {
        if (typeof args.player_response === 'string') {
          try {
            args.player_response = JSON.stringify(pruneAds(JSON.parse(args.player_response)));
          } catch (e) {}
        } else if (typeof args.player_response === 'object') {
          pruneAds(args.player_response);
        }
      }
    }
  }
  pruneWindowPlayerResponse();
  document.addEventListener('DOMContentLoaded', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-navigate-start', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-navigate-finish', pruneWindowPlayerResponse, { passive: true });
  window.addEventListener('yt-page-data-updated', pruneWindowPlayerResponse, { passive: true });

  // Intercept Response.prototype.text (YouTube web player reads API responses as text)
  try {
    if (typeof window.Response !== 'undefined' && Response.prototype.text) {
      const originalResponseText = Response.prototype.text;
      Response.prototype.text = async function () {
        const text = await originalResponseText.apply(this, arguments);
        if (
          typeof text === 'string' &&
          (text.includes('adPlacements') || text.includes('playerAds') || text.includes('adSlots') || text.includes('adBreakHeartbeatParams'))
        ) {
          try {
            const parsed = JSON.parse(text);
            return JSON.stringify(pruneAds(parsed));
          } catch (e) {
            return text;
          }
        }
        return text;
      };
    }
  } catch (e) {}

  // Intercept Response.prototype.json for Fetch responses (preserves encodings, headers, and streams)
  try {
    if (typeof window.Response !== 'undefined' && Response.prototype.json) {
      const originalResponseJson = Response.prototype.json;
      Response.prototype.json = async function () {
        const data = await originalResponseJson.apply(this, arguments);
        return pruneAds(data);
      };
    }
  } catch (e) {}

  // 6. Keep YouTube's internal ad status satisfied across all SPA navigations (direct assignment)
  function ensureAdStatus() {
    try {
      window.google_ad_status = 1;
    } catch (e) {}
  }

  ensureAdStatus();
  document.addEventListener('yt-navigate-start', ensureAdStatus, { passive: true });
  document.addEventListener('yt-navigate-finish', ensureAdStatus, { passive: true });
  document.addEventListener('yt-page-data-updated', ensureAdStatus, { passive: true });
  window.addEventListener('popstate', ensureAdStatus, { passive: true });
})();
