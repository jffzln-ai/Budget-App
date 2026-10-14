// Theme choice. The colours themselves are tokens in src/styles.css (see
// STYLE_GUIDE.md §3); this file only records which theme is showing. An explicit
// Light or Dark sets data-theme on <html>. System leaves it off, so the
// prefers-color-scheme block in styles.css decides.

export const THEME_PREFS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

// Browser and OS chrome follows the app canvas (--plane).
const CHROME = { light: '#F4F6F8', dark: '#090D12' };

export const isIOS = typeof navigator !== 'undefined' && (
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
);

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function resolveMode(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return darkQuery && darkQuery.matches ? 'dark' : 'light';
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === 'light' || pref === 'dark') root.dataset.theme = pref;
  else delete root.dataset.theme;
  const mode = resolveMode(pref);
  root.classList.toggle('ios', isIOS);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', CHROME[mode]));
  return mode;
}

// Re-apply when the OS switches light/dark, for people on the System setting.
export function watchSystemTheme(getPref) {
  if (!darkQuery) return () => {};
  const handler = () => { if (getPref() === 'system') applyTheme('system'); };
  darkQuery.addEventListener('change', handler);
  return () => darkQuery.removeEventListener('change', handler);
}

// Older builds stored a theme name per layout (Bright, Signal, Ink...). Map
// those onto the light/dark preference so nobody loses their choice.
const LEGACY = { colorful: 'light', existing: 'light', modernSignal: 'light', modernCobalt: 'light', modernMoss: 'light', dark: 'dark', modernInk: 'dark' };

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem('ledger-theme');
    if (THEME_PREFS.some(p => p.key === stored)) return stored;
    if (LEGACY[stored]) return LEGACY[stored];
  } catch { /* storage unavailable */ }
  return 'system';
}

export function setStoredTheme(key) {
  try { localStorage.setItem('ledger-theme', key); } catch { /* not fatal if unavailable */ }
}
