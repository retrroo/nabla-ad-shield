/**
 * Nabla Ad Shield — Layer 3A: Stealth YouTube Main-World Sanitizer
 * Runs in MAIN world at document_start on *.youtube.com.
 *
 * Anti-Detection & Honeypot Evasion:
 *  - Leaves YouTube's 7-second synthetic canary payloads (videoId === "ux" or invalid IDs)
 *    100% untouched so tamper-detection self-tests always pass.
 *  - Skips synthetic in-memory Response.prototype.json() checks where response.url === "".
 *  - Uses V8 Proxy apply traps so Function.prototype.toString preserves [native code].
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

  // 1. Neutralize YouTube's internal onAbnormalityDetected check via Promise.prototype.then
  try {
    const originalThen = Promise.prototype.then;
    Promise.prototype.then = function (onFulfilled, onRejected) {
      if (typeof onFulfilled === 'function' && onFulfilled.toString().includes('onAbnormalityDetected')) {
        onFulfilled = function () {};
      }
      return originalThen.call(this, onFulfilled, onRejected);
    };
  } catch (e) {}

  // 2. Clear any lingering YouTube enforcement flags in sessionStorage
  try {
    sessionStorage.removeItem('yt-player-ad-block');
    sessionStorage.removeItem('yt-remote-session-app');
  } catch (e) {}

  // Real YouTube video IDs are strictly 11-character base64url strings (never "ux" honeypots)
  const VALID_YT_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

  function isRealVideoPayload(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const videoId = obj.videoDetails?.videoId;
    if (typeof videoId !== 'string' || !VALID_YT_VIDEO_ID.test(videoId)) {
      return false;
    }
    return Boolean(obj.playabilityStatus || obj.streamingData);
  }

  // 3. Satisfy YouTube's anti-adblock canary variable safely
  try {
    Object.defineProperty(window, 'google_ad_status', {
      get: () => 1,
      set: () => {},
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    try {
      window.google_ad_status = 1;
    } catch (e2) {}
  }

  function emitMainWorldLog(message, details = {}) {
    try {
      window.dispatchEvent(
        new CustomEvent('nabla-yt-main-log', {
          detail: { message, details }
        })
      );
    } catch (e) {}
  }

  /**
   * Sanitizes genuine YouTube video payloads:
   * - Deletes adPlacements, playerAds, and adSlots (mimicking YouTube Premium response)
   * - Overrides UNPLAYABLE anti-adblock playabilityStatus to OK so video decoders never halt.
   */
  function sanitizeRealPlayerObject(playerObj, source) {
    if (!isRealPlayerCandidate(playerObj) || isShieldDisabled()) return;

    const strippedKeys = [];

    // Delete ad structures (setting undefined mimics Premium; empty array [] trips internal sanity assertions)
    if (playerObj.adPlacements) {
      delete playerObj.adPlacements;
      strippedKeys.push('adPlacements');
    }

    if (playerObj.playerAds) {
      delete playerObj.playerAds;
      strippedKeys.push('playerAds');
    }

    if (playerObj.adSlots) {
      delete playerObj.adSlots;
      strippedKeys.push('adSlots');
    }

    // Bypass UNPLAYABLE anti-adblock enforcement status if YouTube flagged this session
    if (playerObj.playabilityStatus) {
      const pStatus = playerObj.playabilityStatus.status;
      if (pStatus === 'UNPLAYABLE') {
        const fullErr = JSON.stringify(playerObj.playabilityStatus);
        if (
          fullErr.includes('ad blocker') ||
          fullErr.includes('Ad blockers') ||
          fullErr.includes('enforcement') ||
          fullErr.includes('3037019') ||
          playerObj.playabilityStatus.errorScreen
        ) {
          playerObj.playabilityStatus.status = 'OK';
          delete playerObj.playabilityStatus.errorScreen;
          delete playerObj.playabilityStatus.reason;
          delete playerObj.playabilityStatus.subreason;
          strippedKeys.push('antiAdblockEnforcementNeutralized');
        }
      }
    }

    if (strippedKeys.length > 0) {
      emitMainWorldLog(`Sanitized YouTube player payload (${source})`, {
        source,
        stripped: strippedKeys,
        videoId: playerObj.videoDetails?.videoId
      });
    }
  }

  function isRealPlayerCandidate(obj) {
    return isRealVideoPayload(obj);
  }

  function inspectAndSanitize(data, source) {
    if (!data || typeof data !== 'object' || isShieldDisabled()) return data;

    // Case A: Root object is a genuine player response
    if (isRealVideoPayload(data)) {
      sanitizeRealPlayerObject(data, source);
    }

    // Case B: SPA /youtubei/v1/next response containing nested playerResponse
    if (data.playerResponse && typeof data.playerResponse === 'object' && isRealVideoPayload(data.playerResponse)) {
      sanitizeRealPlayerObject(data.playerResponse, `${source}:nested`);
    }

    return data;
  }

  // 4. Intercept window.ytInitialPlayerResponse setter for SSR video loads
  try {
    let internalPlayerResponse = window.ytInitialPlayerResponse;
    if (internalPlayerResponse) {
      inspectAndSanitize(internalPlayerResponse, 'ytInitialPlayerResponse');
    }
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() {
        return internalPlayerResponse;
      },
      set(newValue) {
        internalPlayerResponse = inspectAndSanitize(newValue, 'ytInitialPlayerResponse');
      }
    });
  } catch (e) {}

  // 5. Proxy Response.prototype.json strictly for genuine /player endpoints
  try {
    Response.prototype.json = new Proxy(Response.prototype.json, {
      apply(target, thisArg, args) {
        const promise = Reflect.apply(target, thisArg, args);
        const respUrl = thisArg && typeof thisArg.url === 'string' ? thisArg.url : '';
        if (!respUrl || (!respUrl.includes('/youtubei/v1/player') && !respUrl.includes('/youtubei/v1/next'))) {
          return promise;
        }
        return promise.then((data) => inspectAndSanitize(data, 'fetch.json'));
      }
    });
  } catch (e) {}

  // 6. Proxy JSON.parse ONLY for large player responses (prevents spamming hundreds of card hover previews)
  try {
    JSON.parse = new Proxy(JSON.parse, {
      apply(target, thisArg, args) {
        const raw = args[0];
        const shouldInspect =
          typeof raw === 'string' &&
          raw.length > 500 &&
          !raw.includes('"videoId":"ux"') &&
          raw.includes('"streamingData"') &&
          (raw.includes('adPlacements') || raw.includes('playerAds') || raw.includes('adSlots') || raw.includes('UNPLAYABLE'));

        const parsed = Reflect.apply(target, thisArg, args);

        if (shouldInspect && parsed && typeof parsed === 'object') {
          inspectAndSanitize(parsed, 'JSON.parse');
        }
        return parsed;
      }
    });
  } catch (e) {}
})();
