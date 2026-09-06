// Three themes, applied by setting CSS custom properties on the document
// root. Every component references colors via var(--token) instead of
// hardcoded hex, so switching themes is just swapping which values these
// variables resolve to - no per-component logic needed.

export const THEMES = {
  existing: {
    label: 'Original', layout: 'classic',
    bg: '#16201C', card: '#F8F6F0', cardShadow: '0 12px 40px rgba(0,0,0,0.25)',
    pine: '#1F4D3D', pineSoft: '#D8E4DE', gold: '#B8894A', rust: '#9C4A34',
    ink: '#1B211D', inkSoft: '#6B7268', line: '#E3DECF', lineSoft: '#E3DECF',
    creamTint: '#FCFBF8', inputBg: '#FFFFFF', navBg: '#F8F6F0', heroText: '#F8F6F0',
    sidebarBg: '#1B211D', sidebarText: '#F8F6F0', sidebarTextSoft: '#9C9688',
  },
  dark: {
    label: 'Dark', layout: 'classic',
    bg: '#12130F', card: '#1D211B', cardShadow: '0 4px 20px rgba(0,0,0,0.35)',
    pine: '#5FBF9C', pineSoft: '#26352D', gold: '#D4A96A', rust: '#E0796A',
    ink: '#F0EDE4', inkSoft: '#9C9688', line: '#2E3A34', lineSoft: '#2A342F',
    creamTint: '#20261F', inputBg: '#181C16', navBg: '#1D211B', heroText: '#0F1411',
    sidebarBg: '#0B0C09', sidebarText: '#F0EDE4', sidebarTextSoft: '#6E7A70',
  },
  colorful: {
    label: 'Bright', layout: 'classic',
    bg: '#F4F1EA', card: '#FFFFFF', cardShadow: '0 1px 3px rgba(27,33,29,0.04)',
    pine: '#1F4D3D', pineSoft: '#E3ECE6', gold: '#B8894A', rust: '#9C4A34',
    ink: '#1B211D', inkSoft: '#8A8477', line: '#E3DECF', lineSoft: '#F0ECE2',
    creamTint: '#FAF8F2', inputBg: '#FFFFFF', navBg: '#FFFFFF', heroText: '#F8F6F0',
    sidebarBg: '#1B211D', sidebarText: '#F8F6F0', sidebarTextSoft: '#8A8477',
  },
  // "Modernist" redesign concept: a sidebar-nav layout with sharp corners, Archivo
  // type, and flat bordered surfaces instead of shadowed rounded cards. Shape/font
  // overrides for this layout live in index.html's [data-layout="modern"] CSS,
  // scoped there rather than per-component since almost nothing here is
  // component-specific - see applyTheme below for how layout gets toggled.
  modernSignal: {
    label: 'Signal', layout: 'modern',
    bg: '#f3f2f2', card: '#eae9e9', cardShadow: 'none',
    pine: '#ec3013', pineSoft: '#fff2ef', gold: '#ec3013', rust: '#ae1800',
    ink: '#201e1d', inkSoft: '#605d5d', line: 'rgba(32,30,29,.4)', lineSoft: 'rgba(32,30,29,.18)',
    creamTint: '#eae9e9', inputBg: '#eae9e9', navBg: '#201e1d', heroText: '#f3f2f2',
    sidebarBg: '#201e1d', sidebarText: '#f3f2f2', sidebarTextSoft: '#bab6b6',
  },
  modernCobalt: {
    label: 'Cobalt', layout: 'modern',
    bg: '#f1f2f4', card: '#e7e9ed', cardShadow: 'none',
    pine: '#2f5fe0', pineSoft: '#eaf0fd', gold: '#2f5fe0', rust: '#173d9e',
    ink: '#1b2027', inkSoft: '#5b6472', line: 'rgba(27,32,39,.4)', lineSoft: 'rgba(27,32,39,.18)',
    creamTint: '#e7e9ed', inputBg: '#e7e9ed', navBg: '#1b2027', heroText: '#f1f2f4',
    sidebarBg: '#1b2027', sidebarText: '#f1f2f4', sidebarTextSoft: '#8b93a1',
  },
  modernMoss: {
    label: 'Moss', layout: 'modern',
    bg: '#f1f3ef', card: '#e6eae3', cardShadow: 'none',
    pine: '#3f7d3a', pineSoft: '#eaf3e8', gold: '#3f7d3a', rust: '#204d1e',
    ink: '#1e231c', inkSoft: '#5c6456', line: 'rgba(30,35,28,.4)', lineSoft: 'rgba(30,35,28,.18)',
    creamTint: '#e6eae3', inputBg: '#e6eae3', navBg: '#1e231c', heroText: '#f1f3ef',
    sidebarBg: '#1e231c', sidebarText: '#f1f3ef', sidebarTextSoft: '#8d9587',
  },
  modernInk: {
    label: 'Ink', layout: 'modern',
    bg: '#1c1b1a', card: '#272524', cardShadow: 'none',
    pine: '#ff5a3c', pineSoft: '#3a1f19', gold: '#ff5a3c', rust: '#ff9783',
    ink: '#f3f2f2', inkSoft: '#a6a3a1', line: 'rgba(243,242,242,.25)', lineSoft: 'rgba(243,242,242,.14)',
    creamTint: '#272524', inputBg: '#272524', navBg: '#100f0f', heroText: '#1c1b1a',
    sidebarBg: '#100f0f', sidebarText: '#f3f2f2', sidebarTextSoft: '#8a8785',
  },
};

const VAR_MAP = {
  bg: '--bg', card: '--card', cardShadow: '--card-shadow', pine: '--pine', pineSoft: '--pine-soft',
  gold: '--gold', rust: '--rust', ink: '--ink', inkSoft: '--ink-soft', line: '--line',
  lineSoft: '--line-soft', creamTint: '--cream-tint', inputBg: '--input-bg', navBg: '--nav-bg', heroText: '--hero-text',
  sidebarBg: '--sidebar-bg', sidebarText: '--sidebar-text', sidebarTextSoft: '--sidebar-text-soft',
};

export function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.colorful;
  const root = document.documentElement;
  Object.entries(VAR_MAP).forEach(([key, cssVar]) => root.style.setProperty(cssVar, theme[key]));
  root.setAttribute('data-layout', theme.layout);
}

export function isModernTheme(themeKey) {
  return THEMES[themeKey]?.layout === 'modern';
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
