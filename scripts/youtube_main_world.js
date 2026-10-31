/**
 * Nabla Ad Shield — Layer 3A: High-Speed YouTube Main-World Sanitizer
 * Runs in MAIN world at document_start on *.youtube.com.
 * Uses fast SIMD string pre-filtering on JSON.parse and respects whitelist/pause flags.
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

  // Exit early if cached session marker indicates YouTube is whitelisted or shield is paused
  if (isShieldDisabled()) return;

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
   * Surgically strips ad placements from YouTube Player API response objects
   */
  function sanitizePlayerPayload(data, source) {
    if (!data || typeof data !== 'object' || isShieldDisabled()) return data;

    const strippedKeys = [];

    if (Array.isArray(data.adPlacements) && data.adPlacements.length > 0) {
      strippedKeys.push(`adPlacements(${data.adPlacements.length})`);
      data.adPlacements = [];
    }

    if (Array.isArray(data.playerAds) && data.playerAds.length > 0) {
      strippedKeys.push(`playerAds(${data.playerAds.length})`);
      data.playerAds = [];
    }

    if (Array.isArray(data.adSlots) && data.adSlots.length > 0) {
      strippedKeys.push(`adSlots(${data.adSlots.length})`);
      data.adSlots = [];
    }

    if (strippedKeys.length > 0) {
      emitMainWorldLog(`Sanitized YouTube player payload (${source})`, {
        source,
        stripped: strippedKeys,
        videoId: data.videoDetails?.videoId || 'unknown'
      });
    }

    return data;
  }

  // 2. Intercept window.ytInitialPlayerResponse setter for SSR video loads
  try {
    let internalPlayerResponse = window.ytInitialPlayerResponse;
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get() {
        return internalPlayerResponse;
      },
      set(newValue) {
        internalPlayerResponse = sanitizePlayerPayload(newValue, 'ytInitialPlayerResponse');
      }
    });
  } catch (e) {}

  // 3. Intercept Response.prototype.json for SPA /youtubei/v1/player fetches
  try {
    const originalJson = Response.prototype.json;
    Response.prototype.json = async function (...args) {
      const data = await originalJson.apply(this, args);
      if (data && typeof data === 'object' && ('adPlacements' in data || 'playerAds' in data || 'adSlots' in data)) {
        sanitizePlayerPayload(data, 'fetch.json');
      }
      return data;
    };
  } catch (e) {}

  // 4. Intercept JSON.parse with fast string substring pre-filter
  try {
    const originalParse = JSON.parse;
    JSON.parse = function (...args) {
      const raw = args[0];
      const mayContainPlayerAds =
        typeof raw === 'string' &&
        raw.length > 120 &&
        (raw.includes('adPlacements') || raw.includes('playerAds') || raw.includes('adSlots'));

      const data = originalParse.apply(this, args);

      if (mayContainPlayerAds && data && typeof data === 'object' && data.playabilityStatus) {
        sanitizePlayerPayload(data, 'JSON.parse');
      }
      return data;
    };
  } catch (e) {}
})();
