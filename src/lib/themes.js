// Colour themes, applied by setting CSS custom properties on the document root.
// There is one layout; a theme only changes colour. Components should use the
// semantic tokens (--brand, --neg, --s1...) - the legacy names at the bottom of
// VAR_MAP (--pine, --rust, --card...) are aliases kept so older inline styles
// pick up the new palette without being rewritten.
//
// Non-colour foundations (type scale, spacing, radii, elevation names) live in
// src/styles.css.

const LIGHT = {
  s0: '#F4F1EA', s1: '#FFFFFF', s2: '#F0ECE2', ink: '#1B211D', ink2: '#5F665C', line: '#E3DECF', lineSoft: '#EEEAE0',
  brand: '#1F4D3D', onBrand: '#F8F6F0', brandSoft: '#E3ECE6',
  heroBg: '#1F4D3D', heroInk: '#F8F6F0', heroInk2: 'rgba(248,246,240,0.74)', heroTrack: 'rgba(248,246,240,0.2)', heroFill: '#F8F6F0',
  pos: '#2E7D52', posSoft: '#E2F0E7', neg: '#B3412A', negSoft: '#F8E4DE', warn: '#8A6220', warnSoft: '#F5EAD6', barTrack: '#ECE7DC',
  e1: '0 1px 2px rgba(27,33,29,0.06), 0 2px 10px rgba(27,33,29,0.05)',
  e2: '0 10px 36px rgba(27,33,29,0.2)',
  scrim: 'rgba(27,33,29,0.4)', barBg: 'rgba(255,255,255,0.86)', iconTile: '#1F4D3D', onIconTile: '#F8F6F0',
  chrome: '#F4F1EA',
};

// Dark is designed, not inverted: a deep green hero instead of a bright slab,
// surfaces that get lighter as they stack (shadows barely read on dark), and
// lifted, softened status colours.
const DARK = {
  s0: '#12130F', s1: '#1D211B', s2: '#272C25', ink: '#F0EDE4', ink2: '#A8A396', line: '#2E3A34', lineSoft: '#262E29',
  brand: '#5FBF9C', onBrand: '#0F1411', brandSoft: '#26352D',
  heroBg: '#173A2F', heroInk: '#EEF6F1', heroInk2: 'rgba(238,246,241,0.7)', heroTrack: 'rgba(238,246,241,0.14)', heroFill: '#5FBF9C',
  pos: '#6CC79A', posSoft: '#1E3328', neg: '#EE8A78', negSoft: '#3A221D', warn: '#E0B474', warnSoft: '#3A2F1C', barTrack: '#2A302A',
  e1: '0 0 0 1px rgba(255,255,255,0.03)',
  e2: '0 10px 36px rgba(0,0,0,0.55)',
  scrim: 'rgba(0,0,0,0.55)', barBg: 'rgba(29,33,27,0.86)', iconTile: '#264D3F', onIconTile: '#9FE0C5',
  chrome: '#12130F',
};

// On iOS the surfaces switch to the system greys (true black in dark) so the
// installed web app sits naturally next to native apps; Ledger green stays the tint.
const IOS = {
  light: { s0: '#F2F2F7', s1: '#FFFFFF', s2: '#E5E5EA', ink: '#000000', ink2: '#6C6C70', line: '#C6C6C8', lineSoft: '#E5E5EA', barTrack: '#E5E5EA', barBg: 'rgba(249,249,249,0.82)', chrome: '#F2F2F7' },
  dark: { s0: '#000000', s1: '#1C1C1E', s2: '#2C2C2E', ink: '#FFFFFF', ink2: '#98989F', line: '#38383A', lineSoft: '#2C2C2E', barTrack: '#2C2C2E', barBg: 'rgba(22,22,24,0.82)', chrome: '#000000' },
};

export const THEME_PREFS = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const VAR_MAP = {
  s0: '--s0', s1: '--s1', s2: '--s2', ink: '--ink', ink2: '--ink2', line: '--line', lineSoft: '--line-soft',
  brand: '--brand', onBrand: '--on-brand', brandSoft: '--brand-soft',
  heroBg: '--hero-bg', heroInk: '--hero-ink', heroInk2: '--hero-ink-2', heroTrack: '--hero-track', heroFill: '--hero-fill',
  pos: '--pos', posSoft: '--pos-soft', neg: '--neg', negSoft: '--neg-soft', warn: '--warn', warnSoft: '--warn-soft', barTrack: '--bar-track',
  e1: '--e1', e2: '--e2', scrim: '--scrim', barBg: '--bar-bg', iconTile: '--icon-tile', onIconTile: '--on-icon-tile',
};

// Legacy token -> semantic token. Older components still reference these.
const ALIASES = {
  '--bg': 's0', '--card': 's1', '--cream-tint': 's2', '--input-bg': 's1', '--nav-bg': 's1',
  '--ink-soft': 'ink2', '--pine': 'brand', '--pine-soft': 'brandSoft', '--hero-text': 'onBrand',
  '--rust': 'neg', '--gold': 'warn', '--card-shadow': 'e1',
  '--sidebar-bg': 's1', '--sidebar-text': 'ink', '--sidebar-text-soft': 'ink2',
};

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
  const mode = resolveMode(pref);
  const tokens = { ...(mode === 'dark' ? DARK : LIGHT), ...(isIOS ? IOS[mode] : {}) };
  const root = document.documentElement;
  Object.entries(VAR_MAP).forEach(([key, cssVar]) => root.style.setProperty(cssVar, tokens[key]));
  Object.entries(ALIASES).forEach(([cssVar, key]) => root.style.setProperty(cssVar, tokens[key]));
  root.dataset.mode = mode;
  root.style.colorScheme = mode;
  root.classList.toggle('ios', isIOS);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', tokens.chrome));
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
