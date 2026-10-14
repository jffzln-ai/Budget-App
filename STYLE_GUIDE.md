# UI & Branding Style Guide: Stark Structural Grid + Frosted Touch

**Version 1.1 · October 2026.** Applies to McKellar Marine OS (`shop-os`), the Family Financial Dashboard (`Budget-App`), and the McKellar Marine website.

> **Agent directive (Gemini / Antigravity & Claude Code):** Read and enforce every rule in this file before creating, refactoring, or styling any HTML, CSS, Tailwind, or React/TSX component. Every rule here overrides default training-data aesthetics.

### Changes in 1.1

- **Dark mode is complete.** It now follows the OS setting as well as `[data-theme="dark"]`, and it redefines the frost, shadow, and status tokens.
- **Frost is theme-aware.** New `--frost` and `--frost-highlight` tokens, so frosted bars no longer stay white in dark mode.
- **Budget primary works in dark mode.** Theme B gets a light primary in dark mode. New `--on-brand` token for text on primary fills.
- **One motion token.** `--ease` and `--dur` replace the mixed `ease` / cubic-bezier values. Every recipe uses them.
- **Muted text passes WCAG AA.** `--ink-muted` and `--rail-muted` were darkened or lightened to reach 4.5:1.
- **Status colours split by use.** Dot colours and text colours are now separate tokens (`--status-*` and `--status-*-text`), because several dot colours failed 4.5:1 as text.
- **One rail colour:** `#0B0F17`.
- **McKellar blues come from the logo.** Theme A primary and accent are now built from the McKellar ice blue instead of stock Tailwind values.
- **Expenses are shown in ink.** Red is kept for deficits, overspending, and urgent items.
- **New §7 Website layer** and **§8 Customer-facing components.**
- **New §9 Enforcement.**

---

## 1. Anti-Slop Blocklist (Strictly Banned Patterns)

1. **No Decorative Icon Spam:** Never attach Lucide or FontAwesome icons to form labels, section headers, or table headers (`<h3><i class="fa-user"></i> Client</h3>` is banned). Reserve icons strictly for primary navigation rails, interactive action buttons (icon-only or compact utility actions), and empty-state anchors.
2. **No Emoji UI Controls:** Never use emojis inside `<select>` options, status badges, or headers (ban 🟢 Green, 🔴 Red, 🚤, 💰). Use a 6px geometric status dot (`border-radius: 9999px`) or a 1px keyline badge with uppercase monospace text.
3. **No Pastel Callout Boxes:** Ban opaque pastel Tailwind alert containers (`bg-blue-50`, `bg-yellow-50`, `bg-green-100`, `bg-red-100`, `bg-amber-50`, `bg-emerald-50`, `#dbeafe`, `#d1fae5`, `#fee2e2`, `#fef3c7`). Use stark surface fills with a 2px left status accent bar (`border-left: 2px solid var(--status-warn)`) or a subtle translucent tint (`color-mix(in srgb, var(--status-warn) 8%, var(--surface))`).
4. **No Soft Card Blobs or Neon Glows:** Ban `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, and glowing neon box-shadows (`shadow-[0_0_8px_...]`). Maximum container border-radius is 6px (`--radius-md`) for panels and 4px (`--radius-sm`) for inputs and badges.
5. **No Indigo/Purple Defaults or Multi-Stop Gradients:** Never use default Tailwind indigo/violet (`#6366f1`, `#8b5cf6`) or decorative hero gradients. Don't introduce any other stock Tailwind palette value as a brand colour either. Brand colours come from the `--brand-*` tokens only.
6. **No Bouncy Hover Physics:** Ban `hover:scale-105`, `hover:-translate-y-1`, and `active:scale-*`. Transitions use `var(--dur) var(--ease)` (120ms, `cubic-bezier(0.16, 1, 0.3, 1)`) on `background-color`, `border-color`, and `color` only. Respect `prefers-reduced-motion`.
7. **No Proportional Numbers in Data:** Every currency figure, percentage, labour hour, vessel measurement, work-order ID, phone number, and date must apply `.num` (`font-family: var(--font-mono); font-variant-numeric: tabular-nums;`).
8. **No Literal Colours in Components:** Components reference tokens only. A hex value outside the token block is a bug, because it won't follow the theme.

## 2. Core Aesthetic Pillars

- **Stark Architectural Foundation** ([Eli Coleman UI](https://dribbble.com/Elicolemanui)): A high-contrast dark command rail (`#0B0F17`) paired with a crisp mineral slate canvas (`#F4F6F8` light / `#090D12` dark). Let contrast, negative space, and typographic scale create hierarchy rather than coloured boxes.
- **Exposed Hairline Grids** ([Stripe Style System](https://docs.stripe.com/stripe-apps/style)): Prefer continuous 1px solid `var(--line)` structural borders and shared grid walls over isolated floating cards. Use a strict 4px/8px spatial rhythm (4, 8, 12, 16, 24, 32, 48px; the website adds 64, 96, 128px).
- **Frosted Touch Surfaces:** Reserve translucency exclusively for elevated or touch-interactive layers (sticky topbars, floating action bars, slide-over drawers, command palettes, autocomplete dropdowns, and mobile bottom sheets). Combine `backdrop-filter: var(--frost-blur)` with the `--frost-highlight` inner top-edge specular highlight.

## 3. Canonical CSS Custom Properties

Include this block in `globals.css` (Next.js / Tailwind v4), `styles.css` (Vite), or `<style>` (standalone HTML). Override only the `--brand-*` block per application.

**Theme switching.** The theme is set by attributes on `<html>`, never by writing variables from JavaScript:

- `data-app="shop-os"` or `data-app="budget-app"` picks the brand.
- `data-theme="light"` or `data-theme="dark"` records an explicit user choice.
- No `data-theme` means "follow the system". The `prefers-color-scheme` block handles it.

```css
:root {
  /* ── Typography ── */
  --font-sans: 'Inter', 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'SF Mono', Menlo, monospace;
  --font-display: 'Archivo', 'Inter', -apple-system, sans-serif; /* website headlines only (§7) */

  /* ── Stark Structural Surfaces (Light Canvas + Dark Command Rail) ── */
  --plane: #F4F6F8;              /* Primary app canvas */
  --surface: #FFFFFF;            /* Primary panel / grid cell surface */
  --surface-subtle: #EEF2F6;     /* Secondary recessed surface (inputs, table headers) */
  --rail-bg: #0B0F17;            /* Dark command sidebar / terminal header. The rail stays dark in both themes */
  --rail-ink: #E2E8F0;           /* Sidebar primary text */
  --rail-muted: #8391A6;         /* Sidebar muted labels (6.0:1 on rail) */
  --rail-line: rgba(255, 255, 255, 0.08);

  /* ── Ink & Keylines (Stripe Hairline Grid) ── */
  --ink: #0C1418;                /* Primary body & heading ink */
  --ink-secondary: #47575F;      /* Secondary descriptions */
  --ink-muted: #5F6F78;          /* Eyebrows, column headers, hints (4.8:1 on plane) */
  --line: #DDE5EA;               /* Primary 1px structural hairline */
  --line-strong: #C3CFD6;        /* Active input border / axis line */

  /* ── Frosted Touch ── */
  --frost-blur: blur(16px) saturate(140%);
  --frost: rgba(255, 255, 255, 0.76);                         /* Theme-aware frost fill */
  --frost-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.65);
  --frost-dark: rgba(11, 15, 23, 0.78);                       /* Always-dark frost (mobile bottom bar) */
  --frost-highlight-dark: inset 0 1px 0 0 rgba(255, 255, 255, 0.12);

  /* ── Geometry, Elevation & Motion ── */
  --radius-sm: 4px;              /* Inputs, buttons, status pills */
  --radius-md: 6px;              /* Panels, cards, modals */
  --shadow-subtle: 0 1px 2px rgba(12, 20, 24, 0.05);
  --shadow-float: 0 12px 32px -12px rgba(12, 20, 24, 0.22), 0 1px 2px rgba(12, 20, 24, 0.08);
  --ease: cubic-bezier(0.16, 1, 0.3, 1);
  --dur: 120ms;

  /* ── Semantic Status & Financial Tokens ──
     --status-*       dots, accent bars, chart marks, icons (needs 3:1)
     --status-*-text  coloured text and figures (needs 4.5:1) */
  --status-good: #059669;       --status-good-text: #047857;   /* Completed, surplus, income */
  --status-warn: #D97706;       --status-warn-text: #B45309;   /* On hold, caution, over threshold */
  --status-crit: #DC2626;       --status-crit-text: #DC2626;   /* Urgent, deficit, overspent */
  --status-debt: #EA580C;       --status-debt-text: #C2410C;   /* Liabilities, drawdowns */
  --status-info: var(--brand-accent);                          /* In progress, scheduled */
}

/* ── Theme A: McKellar Marine OS (`shop-os`) and the McKellar website ──
   Primary and accent share the hue of the McKellar ice-blue wordmark. */
:root, [data-app="shop-os"] {
  --brand-primary: #12415E;      /* Deep hull navy: primary CTA fill (10.8:1 with white) */
  --brand-accent: #1F8FC7;       /* Active tab keyline, focus ring, in-progress dot */
  --brand-ice: #7FB9D9;          /* McKellar wordmark & dark-rail active indicator */
  --brand-ring: rgba(31, 143, 199, 0.28);
  --on-brand: #FFFFFF;           /* Text on --brand-primary */
}

/* ── Theme B: Family Financial Dashboard (`Budget-App`) ── */
[data-app="budget-app"] {
  --brand-primary: #0F172A;      /* Obsidian primary button fill */
  --brand-accent: #2563EB;       /* Asset / net-worth series accent */
  --brand-ice: #60A5FA;          /* Dark rail active left-border indicator */
  --brand-ring: rgba(37, 99, 235, 0.22);
  --on-brand: #FFFFFF;
}

/* ── Dark mode. The token values are repeated in both blocks so
   "system" and an explicit choice both work. ── */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --plane: #090D12; --surface: #11171D; --surface-subtle: #172029;
    --ink: #F2F6F8; --ink-secondary: #A9BAC3; --ink-muted: #7F909A;
    --line: #222D36; --line-strong: #32414D;
    --frost: rgba(17, 23, 29, 0.72); --frost-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.07);
    --shadow-subtle: 0 1px 2px rgba(0, 0, 0, 0.4);
    --shadow-float: 0 12px 32px -12px rgba(0, 0, 0, 0.7), 0 1px 2px rgba(0, 0, 0, 0.4);
    --status-good: #10B981; --status-good-text: #34D399;
    --status-warn: #F59E0B; --status-warn-text: #FBBF24;
    --status-crit: #EF4444; --status-crit-text: #F87171;
    --status-debt: #F97316; --status-debt-text: #FB923C;
    --brand-accent: #4FB0E0;
    color-scheme: dark;
  }
  :root:not([data-theme="light"])[data-app="budget-app"] {
    --brand-primary: #E2E8F0; --on-brand: #0B0F17; --brand-accent: #60A5FA;
  }
}
:root[data-theme="dark"] {
  --plane: #090D12; --surface: #11171D; --surface-subtle: #172029;
  --ink: #F2F6F8; --ink-secondary: #A9BAC3; --ink-muted: #7F909A;
  --line: #222D36; --line-strong: #32414D;
  --frost: rgba(17, 23, 29, 0.72); --frost-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.07);
  --shadow-subtle: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-float: 0 12px 32px -12px rgba(0, 0, 0, 0.7), 0 1px 2px rgba(0, 0, 0, 0.4);
  --status-good: #10B981; --status-good-text: #34D399;
  --status-warn: #F59E0B; --status-warn-text: #FBBF24;
  --status-crit: #EF4444; --status-crit-text: #F87171;
  --status-debt: #F97316; --status-debt-text: #FB923C;
  --brand-accent: #4FB0E0;
  color-scheme: dark;
}
:root[data-theme="dark"][data-app="budget-app"] {
  --brand-primary: #E2E8F0; --on-brand: #0B0F17; --brand-accent: #60A5FA;
}
```

### Financial colour rules

- Expenses, payments, and ordinary negative amounts use `--ink`. A list of red numbers reads as an emergency.
- `--status-good-text` is for income and positive change.
- `--status-debt-text` is for liability balances such as a mortgage, card, or loan.
- `--status-crit-text` is only for a deficit, an overspent budget, or something overdue.
- Show a minus sign (`−$1,846.30`) rather than parentheses or colour alone. The sign has to carry the meaning for colour-blind readers.

## 4. Typography & Hierarchy Scale (application)

- **Page Title / Masthead (`h1`):** 22–26px, `font-weight: 700`, `letter-spacing: -0.02em`, `line-height: 1.15`, `color: var(--ink)`.
- **Section / Panel Header (`h2`):** 15–16px, `font-weight: 600`, `letter-spacing: -0.01em`, `color: var(--ink)`.
- **Eyebrow / Category Label (`.eyebrow`):** 11px, `font-weight: 600`, `text-transform: uppercase`, `letter-spacing: 0.1em`, `color: var(--ink-muted)`. Never attach an icon to an eyebrow.
- **Body Copy:** 14px (dense operational tables/forms) or 15px (reading panels), `line-height: 1.45`, `color: var(--ink)`.
- **Tabular Data (`.num`):** `font-family: var(--font-mono)`, `font-variant-numeric: tabular-nums`, `letter-spacing: -0.01em`. Always right-align numeric columns in tables.
- **Hero figure** (one per screen at most, such as Budget's "Safe to spend"): 32–40px `.num`, `font-weight: 500`.

## 5. Signature Component Recipes

```css
/* 1. Stark Hairline Panel (replaces rounded-xl shadow cards) */
.stark-panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-subtle);
}

/* 2. Exposed 1px Hairline Data Grid (Stripe-style cell matrix) */
.hairline-grid {
  display: grid;
  background: var(--line);
  gap: 1px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.hairline-grid > * {
  background: var(--surface);
  padding: 14px 16px;
  min-width: 0;
}

/* 3. Frosted Touch Surface (sticky headers, drawers, dropdowns). Follows the theme. */
.frosted-touch {
  background: var(--frost);
  backdrop-filter: var(--frost-blur);
  -webkit-backdrop-filter: var(--frost-blur);
  border: 1px solid var(--line);
  box-shadow: var(--frost-highlight), var(--shadow-float);
}
/* Always dark (mobile bottom bar, rail flyouts) */
.frosted-touch-dark {
  background: var(--frost-dark);
  backdrop-filter: var(--frost-blur);
  -webkit-backdrop-filter: var(--frost-blur);
  border: 1px solid var(--rail-line);
  box-shadow: var(--frost-highlight-dark), var(--shadow-float);
  color: var(--rail-ink);
}

/* 4. Tactile Segmented Control (replaces pill tabs with glowing drop shadows) */
.seg-control {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--surface-subtle);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
}
.seg-control button {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--ink-secondary);
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  border: 0;
  background: transparent;
  transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.seg-control button[aria-pressed="true"],
.seg-control button[aria-selected="true"] {
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  box-shadow: var(--shadow-subtle);
}

/* 5. Status Indicator (replaces pastel boxes and emojis). Staff-facing. */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--surface-subtle);
  color: var(--ink);
  white-space: nowrap;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  flex: none;
}

/* 6. Callout (replaces pastel alert boxes). Set --c to a --status-* token. */
.callout {
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-left: 2px solid var(--c);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--c) 8%, var(--surface));
}

/* 7. Buttons */
.btn {
  min-height: 32px; padding: 0 12px;
  border-radius: var(--radius-sm); border: 1px solid transparent;
  font: 500 13px/1 var(--font-sans);
  transition: background-color var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.btn-primary   { background: var(--brand-primary); color: var(--on-brand); }
.btn-secondary { background: var(--surface); border-color: var(--line-strong); color: var(--ink); }
.btn-quiet     { background: transparent; color: var(--ink-secondary); }
:focus-visible { outline: 2px solid var(--brand-accent); outline-offset: 2px; }
```

## 6. Desktop-to-Mobile Responsive Rules

- **Desktop (≥ 1024px):** Fixed left command rail (220–240px, `background: var(--rail-bg)`) with a 2px solid `var(--brand-ice)` active left indicator. The main workspace uses multi-pane split views (e.g. 1/3 queue or vessel metadata + 2/3 technician or scenario workspace) and exposed 1px hairline metric strips.
- **Tablet (768–1023px):** The rail collapses to a 64px icon rail. Icons need an `aria-label` and a tooltip.
- **Mobile / Yard Field View (< 768px):** Hide the left sidebar rail and render a fixed bottom `.frosted-touch-dark` navigation bar (height `56px`, `padding-bottom: env(safe-area-inset-bottom)`). Show four destinations plus "More", which opens a bottom sheet. Split views stack into one column. Enforce a minimum 44px tap target on all buttons, inputs, and queue rows, and a 16px minimum input font size to prevent iOS Safari auto-zoom.

## 7. Website Layer (McKellar Marine public site)

The website uses the same tokens at a larger, more open scale. It is Theme A and follows the visitor's light/dark setting.

**Carries over from the apps:** every colour token, hairlines and hairline grids, radii, status dots, `.num` figures, buttons, and frosted sticky navigation.

**Doesn't carry over:** the command rail, the 14px dense type, and metric strips.

**Type scale**

| Role | Font | Size | Weight | Tracking | Line height |
|---|---|---|---|---|---|
| Hero headline | `--font-display` | `clamp(36px, 5.5vw, 64px)` | 800 | −0.03em | 1.0 |
| Section headline | `--font-display` | 28–36px | 700 | −0.02em | 1.1 |
| Card heading | `--font-sans` | 18px | 600 | −0.01em | 1.3 |
| Lede | `--font-sans` | 17–19px | 400 | 0 | 1.5, max 46ch |
| Body | `--font-sans` | 16px | 400 | 0 | 1.55, max 65ch |

**Layout**

- Section spacing is 64px on mobile and 96–128px on desktop.
- The content width is 1200px, with a 16px minimum side gutter.
- The hero sits on `--rail-bg`, so the site opens with the same dark band as the app rail. Size the hero to its content, never `100vh`.
- Service and feature lists use `.hairline-grid` cells, not floating cards.

**Photography**

- Use real yard, shop, and on-the-water photos of McKellar boats and staff. No stock photos of strangers.
- Use natural light and true colour, with no filters or tints.
- Crop photos to fill their cell edge to edge, with no rounded frames.
- Photos replace gradients as the visual interest. Never place text on a busy part of an image. Use the dark band instead.

## 8. Customer-Facing Components

Website pages that show app data (boat status, estimate approval, storage booking) use the app's tokens with these changes:

- **Plain-language status.** Use sentence case in `--font-sans`, a 14px label, and an 8px dot: "Waiting on parts", "Work underway", "Ready for pickup". Never show internal codes such as `ON-HOLD`, `Awaiting Approval`, or tech initials.
- **One action per card,** as a 44px primary button ("Review estimate", "Book a haul-out").
- **Progress as steps.** Show an ordered list of the job's stages with dates, not a percentage bar.
- **Explain the reason.** Every non-green status shows a `.callout` with what is happening and the expected date.
- **Read-only by default.** Customer pages read from their own public, token-scoped endpoints, and those endpoints never expose staff notes, rates, or other customers. They are separate pages that use the same tokens, not embedded app screens.

## 9. Enforcement

- Each repo carries a copy of the §3 token block as `tokens.css`. When tokens change, update every copy in the same change.
- CI fails on the banned patterns in §1. In `shop-os`, extend `tools/ci/check-tailwind.mjs`. At minimum, check for `rounded-(xl|2xl|3xl)`, `shadow-(lg|xl|2xl)`, `bg-(blue|yellow|green|red|amber|emerald)-(50|100)`, `(indigo|violet|purple)-\d`, `hover:scale-`, `hover:-translate-y`, and emoji characters in markup.
- Contrast: any new token pair used for text must reach 4.5:1, and pairs used for icons, dots, or large text must reach 3:1, in both themes.

## 10. Migration Notes

- **`shop-os`:**
  1. Add `tokens.css`.
  2. Point the legacy Tailwind `brand.*` colours at the tokens, so `brand.blue` maps to `var(--brand-ice)`.
  3. Replace the banned patterns one view at a time, starting with Live Queue and Workspace.
  4. Swap Font Awesome for inline SVG icons used only where §1.1 allows.
- **`Budget-App`:**
  1. Replace `lib/themes.js` writing variables with setting `data-theme` on `<html>`.
  2. Map the legacy aliases (`--pine`, `--rust`, `--card`, `--s0`/`--s1`/`--s2`, `--brand`, `--neg`, `--pos`) to the new tokens, then remove the aliases screen by screen.
  3. Replace pill buttons and 16px radii with §5 buttons and 6px panels.
  4. Remove `scale(.97)` on press.
