/**
 * Nabla Ad Shield — Layer 3A: YouTube Main-World Canary & Player Response Sanitizer
 * Runs in MAIN world at document_start on *.youtube.com.
 * 1. Satisfies YouTube's anti-adblock canary (window.google_ad_status = 1).
 * 2. Strips adPlacements, playerAds, and adSlots from YouTube Player API payloads
 *    before the video player initializes, preventing black screen delays and pre-rolls.
 */

(function initYouTubeMainWorld() {
  'use strict';

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

  function isShieldDisabled() {
    return document.documentElement?.dataset?.nablaYoutubeDisabled === 'true';
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

    let strippedKeys = [];

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
      try {
        if (data && typeof data === 'object' && (data.adPlacements || data.playerAds || data.adSlots)) {
          sanitizePlayerPayload(data, 'fetch.json');
        }
      } catch (e) {}
      return data;
    };
  } catch (e) {}

  // 4. Intercept JSON.parse for XHR / Polymer player responses
  try {
    const originalParse = JSON.parse;
    JSON.parse = function (...args) {
      const data = originalParse.apply(this, args);
      try {
        if (
          data &&
          typeof data === 'object' &&
          data.playabilityStatus &&
          (data.adPlacements || data.playerAds || data.adSlots)
        ) {
          sanitizePlayerPayload(data, 'JSON.parse');
        }
      } catch (e) {}
      return data;
    };
  } catch (e) {}
})();
