/**
 * Nabla Ad Shield — Instant 0ms Theme Preloader
 * Executes synchronously in <head> to prevent FOUC (flash of unstyled/wrong theme).
 * Strict MV3 compliant (external script file allowed by script-src 'self').
 */
(function() {
  try {
    const theme = localStorage.getItem('nabla_theme');
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
