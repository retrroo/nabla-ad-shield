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

  // 2. Satisfy YouTube's internal ad status checks
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
    try {
      window.google_ad_status = 1;
    } catch (e2) {}
  }
})();
