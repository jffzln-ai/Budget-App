// Three themes, applied by setting CSS custom properties on the document
// root. Every component references colors via var(--token) instead of
// hardcoded hex, so switching themes is just swapping which values these
// variables resolve to - no per-component logic needed.

export const THEMES = {
  existing: {
    label: 'Original',
    bg: '#16201C', card: '#F8F6F0', cardShadow: '0 12px 40px rgba(0,0,0,0.25)',
    pine: '#1F4D3D', pineSoft: '#D8E4DE', gold: '#B8894A', rust: '#9C4A34',
    ink: '#1B211D', inkSoft: '#6B7268', line: '#E3DECF', lineSoft: '#E3DECF',
    creamTint: '#FCFBF8', inputBg: '#FFFFFF', navBg: '#F8F6F0', heroText: '#F8F6F0',
  },
  dark: {
    label: 'Dark',
    bg: '#12130F', card: '#1D211B', cardShadow: '0 4px 20px rgba(0,0,0,0.35)',
    pine: '#5FBF9C', pineSoft: '#26352D', gold: '#D4A96A', rust: '#E0796A',
    ink: '#F0EDE4', inkSoft: '#9C9688', line: '#2E3A34', lineSoft: '#2A342F',
    creamTint: '#20261F', inputBg: '#181C16', navBg: '#1D211B', heroText: '#0F1411',
  },
  colorful: {
    label: 'Bright',
    bg: '#F4F1EA', card: '#FFFFFF', cardShadow: '0 1px 3px rgba(27,33,29,0.04)',
    pine: '#1F4D3D', pineSoft: '#E3ECE6', gold: '#B8894A', rust: '#9C4A34',
    ink: '#1B211D', inkSoft: '#8A8477', line: '#E3DECF', lineSoft: '#F0ECE2',
    creamTint: '#FAF8F2', inputBg: '#FFFFFF', navBg: '#FFFFFF', heroText: '#F8F6F0',
  },
};

const VAR_MAP = {
  bg: '--bg', card: '--card', cardShadow: '--card-shadow', pine: '--pine', pineSoft: '--pine-soft',
  gold: '--gold', rust: '--rust', ink: '--ink', inkSoft: '--ink-soft', line: '--line',
  lineSoft: '--line-soft', creamTint: '--cream-tint', inputBg: '--input-bg', navBg: '--nav-bg', heroText: '--hero-text',
};

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.colorful;
  const root = document.documentElement;
  Object.entries(VAR_MAP).forEach(([key, cssVar]) => root.style.setProperty(cssVar, theme[key]));
}

export function getStoredTheme() {
  try {
    const stored = localStorage.getItem('ledger-theme');
    return THEMES[stored] ? stored : 'colorful';
  } catch {
    return 'colorful';
  }
}

export function setStoredTheme(key) {
  try { localStorage.setItem('ledger-theme', key); } catch { /* not fatal if unavailable */ }
}
