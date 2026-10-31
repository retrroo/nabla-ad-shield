/**
 * Nabla Ad Shield — Telemetry & Diagnostics Logger
 * Universal logging module for background, content scripts, and UI pages.
 * Supports categories: NETWORK, COSMETIC, YOUTUBE, HEURISTIC, COOKIE, SYSTEM
 */

export const LogCategory = {
  NETWORK: 'NETWORK',
  COSMETIC: 'COSMETIC',
  YOUTUBE: 'YOUTUBE',
  HEURISTIC: 'HEURISTIC',
  COOKIE: 'COOKIE',
  SYSTEM: 'SYSTEM'
};

export const LogLevel = {
  INFO: 'INFO',
  BLOCKED: 'BLOCKED',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Sends a structured log event to the background service worker
 */
export async function logEvent(category, level, message, details = {}, customUrl = null) {
  const event = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    category,
    level,
    message,
    url: customUrl || (typeof window !== 'undefined' ? window.location.href : 'background'),
    details
  };

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        type: 'NABLA_LOG_EVENT',
        event
      });
    }
  } catch (err) {
    // Background worker may be cycling; fail gracefully
  }

  return event;
}
