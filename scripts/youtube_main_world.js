/**
 * Deprecated & Removed in v1.0.17
 * Main-world script injection is no longer used for YouTube.
 * Running scripts in the MAIN world monkey-patches native V8 prototypes,
 * which triggers YouTube's Botguard / anti-tamper security checks.
 * All YouTube ad acceleration, skipping, and cosmetic filtering now run
 * exclusively in the isolated content script world (scripts/youtube_shield.js).
 */
