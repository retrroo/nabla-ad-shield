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

  // 2. Keep YouTube's internal ad status satisfied across all SPA navigations
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

  // 3. Autonomous Player Recovery (neutralizes gray/unstarted player on SPA navigation)
  function attemptPlayerRecovery() {
    if (isShieldDisabled()) return;
    if (window.location.pathname !== '/watch') return;

    const vMatch = new URLSearchParams(window.location.search).get('v');
    if (!vMatch) return;

    const player = document.getElementById('movie_player') || window.movie_player;
    if (player && typeof player.loadVideoById === 'function') {
      try {
        const curTime = typeof player.getCurrentTime === 'function' ? (player.getCurrentTime() || 0) : 0;
        player.loadVideoById(vMatch, curTime);
        if (typeof player.playVideo === 'function') {
          player.playVideo();
        }
      } catch (e) {}
    }

    // Automated single-shot reload fallback: ensures video stream starts without manual F5
    const sessionKey = '__nabla_yt_rec_' + vMatch;
    if (!sessionStorage.getItem(sessionKey)) {
      setTimeout(() => {
        const p = document.getElementById('movie_player') || window.movie_player;
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        const isStuck = !video || video.paused || (p && typeof p.getPlayerState === 'function' && p.getPlayerState() === -1);
        if (isStuck && !sessionStorage.getItem(sessionKey)) {
          sessionStorage.setItem(sessionKey, '1');
          window.location.reload();
        }
      }, 400);
    }
  }

  window.addEventListener('nabla-request-player-recovery', attemptPlayerRecovery, { passive: true });
  document.addEventListener('yt-navigate-start', ensureAdStatus, { passive: true });
  document.addEventListener('yt-navigate-finish', () => {
    ensureAdStatus();
    // Check if error-screen was mounted on navigation
    const hasError = document.querySelector('yt-playability-error-supported-renderers, ytd-enforcement-message-view-model');
    if (hasError) {
      attemptPlayerRecovery();
    }
  }, { passive: true });
  document.addEventListener('yt-page-data-updated', ensureAdStatus, { passive: true });
  window.addEventListener('popstate', ensureAdStatus, { passive: true });
})();
