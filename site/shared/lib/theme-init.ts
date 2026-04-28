/**
 * Theme initialization script string.
 *
 * Inline this in a <script> tag before any visible content to prevent FOUC.
 * Reads the `theme` cookie (shared across barefootjs.dev subdomains) and
 * falls back to system preference. Migrates a legacy localStorage value
 * to the cookie on first run so existing users keep their preference.
 */
export const themeInitScript = `
(function() {
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|;\\\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(name, value) {
    var host = location.hostname;
    var parent = 'barefootjs.dev';
    var useParent = host === parent || host.endsWith('.' + parent);
    var parts = [name + '=' + value, 'Path=/', 'Max-Age=' + (60 * 60 * 24 * 365), 'SameSite=Lax'];
    if (useParent) parts.push('Domain=' + parent);
    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
  }
  var stored = readCookie('theme');
  if (stored !== 'light' && stored !== 'dark') {
    try {
      var legacy = localStorage.getItem('theme');
      if (legacy === 'light' || legacy === 'dark') {
        stored = legacy;
        writeCookie('theme', legacy);
      }
    } catch (_) {}
  }
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
    document.documentElement.classList.add('dark');
  }
})();
`
