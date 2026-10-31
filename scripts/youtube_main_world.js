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

  // 1. Satisfy YouTube's anti-adblock canary variable
  try {
    if (typeof window.google_ad_status === 'undefined') {
      Object.defineProperty(window, 'google_ad_status', {
        value: 1,
        writable: true,
        configurable: true
      });
    }
  } catch (e) {
    window.google_ad_status = 1;
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
   * Surgically strips ad placements ONLY from genuine YouTube video payloads,
   * bypassing synthetic "ux" honeypot self-tests completely.
   */
  function sanitizeRealPlayerObject(playerObj, source) {
    if (!isRealPlayerCandidate(playerObj) || isShieldDisabled()) return;

    const strippedKeys = [];

    if (Array.isArray(playerObj.adPlacements) && playerObj.adPlacements.length > 0) {
      strippedKeys.push(`adPlacements(${playerObj.adPlacements.length})`);
      playerObj.adPlacements = [];
    }

    if (Array.isArray(playerObj.playerAds) && playerObj.playerAds.length > 0) {
      strippedKeys.push(`playerAds(${playerObj.playerAds.length})`);
      playerObj.playerAds = [];
    }

    if (Array.isArray(playerObj.adSlots) && playerObj.adSlots.length > 0) {
      strippedKeys.push(`adSlots(${playerObj.adSlots.length})`);
      playerObj.adSlots = [];
    }

    if (strippedKeys.length > 0) {
      emitMainWorldLog(`Sanitized YouTube player payload (${source})`, {
        source,
        stripped: strippedKeys,
        videoId: playerObj.videoDetails.videoId
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

  // 2. Intercept window.ytInitialPlayerResponse setter for SSR video loads
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

  // 3. Proxy Response.prototype.json (ignores synthetic in-memory new Response() honeypots where url === "")
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

  // 4. Proxy JSON.parse (preserves [native code] signature and ignores "ux" canary strings)
  try {
    JSON.parse = new Proxy(JSON.parse, {
      apply(target, thisArg, args) {
        const raw = args[0];
        const shouldInspect =
          typeof raw === 'string' &&
          raw.length > 200 &&
          !raw.includes('"videoId":"ux"') &&
          (raw.includes('adPlacements') || raw.includes('playerAds') || raw.includes('adSlots'));

        const parsed = Reflect.apply(target, thisArg, args);

        if (shouldInspect && parsed && typeof parsed === 'object') {
          inspectAndSanitize(parsed, 'JSON.parse');
        }
        return parsed;
      }
    });
  } catch (e) {}
})();
