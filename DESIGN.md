---
name: Allevo Dashboard
description: Dark-first performance dashboard for tracking book-launch funnels, ad spend, and sales
colors:
  bg: "#0F1115"
  surface-1: "#151922"
  surface-2: "#1C2230"
  surface-3: "#263041"
  surface-4: "#334155"
  text-primary: "#FFFFFF"
  text-muted: "#B6C1D2"
  text-subtle: "#8290A5"
  signal-teal: "#00FFBB"
  signal-teal-strong: "#00D99F"
  brand-management: "#66BEFF"
  accent-purple: "#A855F7"
  accent-purple-subtle: "#D8B4FE"
  status-positive: "#00E5A8"
  status-negative: "#F43F5E"
  status-warning: "#F59E0B"
  chart-1: "#1885c4"
  chart-2: "#bf7d23"
  chart-3: "#7b68ee"
  chart-4: "#a28b08"
  chart-5: "#b8538c"
  chart-6: "#59ac44"
  chart-7: "#bd5446"
  chart-8: "#028ba3"
typography:
  display:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.75rem, 2.25vw, 2.625rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0"
  body:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  label:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "0.045em"
  metric-hero:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.5rem, 1.9vw, 2.125rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0"
  metric-compact:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.1rem, 1.5vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0"
  subtext:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0"
  meta:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  caption:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.02em"
  badge:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.625rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.08em"
  micro:
    fontFamily: "Instrument Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "0.5625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.08em"
rounded:
  control: "0.5rem"
  panel: "0.75rem"
  chip: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.signal-teal}"
    textColor: "#061814"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "#45FFD0"
  metric-card:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.panel}"
    padding: "1.25rem"
---

# Design System: Allevo Dashboard

## Overview

**Creative North Star: "The Night Studio"**

Allevo Dashboard is a dark-canvas operational surface for tracking book-launch funnels: ad spend, revenue, ROAS, and creative performance, refreshed on a live cadence. The dark background is a deliberate editorial choice, not a technical default — it makes Signal Teal and the categorical chart palette read as considered accents against a calm, low-noise field, the way a studio dims the room to let the work under the light stand out. Density stays high (ten-plus metrics, sortable tables, per-funnel breakdowns) without feeling cluttered, because color and weight are spent sparingly and deliberately.

Depth in this system is ambient, not structural: soft radial glows, layered panel gradients, and blurred shadows create atmosphere and make the dark canvas feel alive, but they never encode meaning on their own — state and hierarchy are carried by color, type weight, and position, not by how much a panel glows.

**Key Characteristics:**
- Dark-first canvas with a fully composed (not inverted) light theme
- One primary accent (Signal Teal) used sparingly for action, selection, and positive state
- An 8-hue, CVD-validated categorical palette for chart series, assigned by fixed position
- Ambient depth (gradients, soft shadows, radial glows) rather than structural elevation
- Tactile, confident components — soft gradient panels, glowing hover states, deliberate elevation on interactive surfaces

## Colors

The palette is a dark, low-saturation neutral field with one primary accent and a validated multi-hue system reserved for data series.

### Primary
- **Signal Teal** (#00FFBB / dark; #007A5E ink on light surfaces): the one accent that always means "go" — primary actions, the active/selected state, focus rings, and positive trend indicators. Used sparingly; its rarity is what gives it force.

### Secondary
- **Brand Management Blue** (#66BEFF): the second built-in funnel's identity color and the system's `--selection` token — used for non-primary selection state (e.g. active nav item), kept visually distinct from Signal Teal so "selected" never reads as "primary action."

### Tertiary
- **Accent Purple** (#A855F7, subtle: #D8B4FE): reserved accent for cases needing a third hue beyond teal/blue, with a lighter-tint variant for text-on-color contexts.

### Neutral
- **Canvas** (#0F1115): the base dark background.
- **Surface 1–4** (#151922 → #334155): an ascending stack of panel/card backgrounds, each one step lighter, used to express layering without shadows alone.
- **Text Primary** (#FFFFFF), **Text Muted** (#B6C1D2), **Text Subtle** (#8290A5): a three-step text hierarchy — full white for values and headings, muted for labels and body copy, subtle for the least important metadata.
- **Border Hairline / Strong / Input** (rgba(148,163,184) at 0.16 / 0.26 / 0.34 opacity): a single gray-blue hue stepped by opacity rather than three unrelated grays.

### Status
- **Status Positive** (#00E5A8), **Status Negative** (#F43F5E), **Status Warning** (#F59E0B): semantic tokens for comparison deltas, error states, and validation. In light mode, `status-positive` reuses the same ink as `brand-strategy-ink` so every green — brand, table headings, positive trend — is one consistent hue.

### Data Visualization
- **Chart 1–8**: an 8-hue categorical palette (blue, orange, violet, gold, pink, green, red, teal) sourced from real product references (Trello's label palette, ClickUp's brand violet) and validated for CVD-safety and contrast against both the dark and light canvas. Assigned by a series' fixed position, never reassigned by name — "same funnel" always means "same color," everywhere it appears.

### Named Rules
**The One Accent Rule.** Signal Teal is the only color that means "primary action" or "positive." Selection state, secondary funnels, and tertiary accents each get their own hue so no two meanings compete for the same color.

## Typography

**Display Font:** Instrument Sans (with system-ui fallback stack)
**Body Font:** Instrument Sans
**Label/Mono Font:** Instrument Sans (tabular numeric variant for data)

**Character:** A single, versatile grotesque carries the entire hierarchy — display, body, and tabular data — so the interface reads as one voice at every density, from a hero metric down to a table cell.

### Hierarchy
- **Display** (700, `clamp(1.75rem, 2.25vw, 2.625rem)`, 1.05 line-height): page-level headings (`--type-display`).
- **Metric Hero** (700, `clamp(1.5rem, 1.9vw, 2.125rem)`, 1.05 line-height): the primary 4-up metric-card row's value — sized so a 6+ digit currency total (e.g. "R$ 135.162,04") never wraps.
- **Metric Compact** (700, `clamp(1.1rem, 1.5vw, 1.75rem)`, 1.05 line-height): the secondary compact metric-card row (up to 6 cards per row), a lower ceiling than the hero clamp for the same overflow reason.
- **Title/Section** (700, 1.125rem): section headers within a panel.
- **Body** (400, 1rem, 1.4 line-height): default reading text, descriptions, table cell content.
- **Subtext** (400, 0.875rem, 1.4 line-height): supporting text directly under a metric value or heading.
- **Label** (650, 0.8125rem, 0.045em tracking): metric titles, form labels, table headings, comparison deltas — bold and slightly tracked-out to read as a caption role even at small size.
- **Meta** (500, 0.75rem, 1.4 line-height): secondary form hints, tighter supporting copy.
- **Caption** (500, 0.6875rem, 0.02em tracking): timestamps, footnotes, added-by lines, table row secondary text.
- **Badge** (700, 0.625rem, 0.08em tracking, uppercase): status pills and small badges (e.g. `badge-primary-green`).
- **Micro** (600, 0.5625rem, 0.08em tracking, uppercase): the smallest role, for the densest inline tags. Reserved for label-only text, never body copy.

Tabular figures (`font-variant-numeric: tabular-nums`) are applied wherever numbers appear in sequence (tables, metric cards) so digits align vertically during scanning.

### Named Rules
**The One Voice Rule.** No second type family. Instrument Sans carries display, body, and mono/data roles alike — hierarchy comes from size, weight, and tracking, not from switching faces.

## Layout

A collapsible left sidebar (icon rail when collapsed, full nav when expanded) plus a scrollable main content area. Content is organized into a tab strip (Geral / Fontes das Vendas / Funil / Campanhas / Criativos / Lançamento) rather than nested pages. Metric cards render in a responsive grid (1 column on mobile up to 6 on wide desktop for the compact secondary row). Popovers and dropdowns clamp their width to `min(20rem, calc(100vw - 1.5rem))` so they never cause horizontal overflow on narrow viewports. Spacing follows a `--space-1` (0.25rem) through `--space-6` (1.5rem) scale.

## Elevation & Depth

Depth is ambient, not structural. The page background carries soft radial gradients (teal and blue glows at low opacity) behind the dark canvas; panels layer subtle linear gradients between two nearby surface tones rather than sitting flat. Shadows are large, soft, and dark (`0 16–22px 40–70px rgba(0,0,0,0.22–0.28)`) — closer to ambient occlusion than a hard drop shadow. None of this depth vocabulary encodes state on its own; a metric card's hover lift (`translateY(-1px)` plus a teal-tinted border) is the one place elevation change is tied to interaction, and even that is disabled on coarse-pointer (touch) devices.

### Shadow Vocabulary
- **Elevation 1** (`0 16px 42px rgba(0,0,0,0.22)`): metric cards and small panels at rest.
- **Elevation 2** (`0 18px 52px rgba(0,0,0,0.22)`): table panels and mid-size containers.
- **Elevation 3** (`0 22px 70px rgba(0,0,0,0.28)`): modals and the top-level executive panel.

### Named Rules
**The Ambient Rule.** Gradients, glows, and shadows are mood, not meaning. They make the dark canvas feel alive; state and hierarchy are always carried by color, weight, or position instead.

## Shapes

Two radius roles cover the system: `--radius-control` (0.5rem) for interactive controls (buttons, inputs, small icon buttons) and `--radius-panel` (0.75rem) for cards, modals, and containers. Fully round (`--radius-chip`, 999px) is reserved for pill-shaped badges and status dots. Borders are hairline (1px, low-opacity gray-blue) rather than heavy strokes, letting surface-tone stepping and shadow do most of the separation work.

## Components

Components are tactile and confident: soft gradient fills, a visible glow on hover/focus rather than a flat color swap, and deliberate elevation on anything interactive — nothing sits perfectly flat at rest.

### Buttons
- **Shape:** `--radius-control` (0.5rem).
- **Primary:** Signal Teal background (#00FFBB) with dark ink text (#061814) for AA contrast regardless of page theme; 10px/16px padding.
- **Hover / Focus:** primary hover brightens to #45FFD0; all interactive elements share one `:focus-visible` treatment — a 2px outline in the focus-ring token, offset 3px from the control.
- **Secondary / Ghost / Icon:** transparent or surface-tone background, text-muted color, hover wash (`--hover-wash` / `--hover-wash-strong`) rather than a border change.

### Metric Cards
- **Corner Style:** `--radius-panel` (0.75rem).
- **Background:** layered gradient between two adjacent dark tones (`linear-gradient(180deg, rgba(24,29,39,.98), rgba(18,22,30,.98))` in dark mode), full white-to-off-white in light mode.
- **Shadow Strategy:** Elevation 1 at rest; hover adds a teal-tinted border and a 1px lift (skipped on coarse pointers).
- **States:** selected (accent border), focus-visible (blue border), compact variant for dense multi-card rows with a lower type-size ceiling to prevent currency values from wrapping.

### Dialogs / Modals
- **Style:** centered overlay on a `black/70` backdrop with blur; panel uses `--radius-panel`, Elevation 3 shadow, and a `zoom-in-95` entrance.
- **Behavior:** full focus trap, Escape-to-close, focus restored to the trigger on close — the deliberate, accessible baseline every modal in the product shares.

### Badges / Chips
- **Style:** `--radius-chip` (fully round), small caps or bold micro-label text, background tinted from the relevant semantic or brand token at low opacity.

### Navigation
- **Style:** icon + label rows in the sidebar, active state marked with a tinted background and colored left text (not a colored border), `aria-current="page"` on the active tab. Collapses to an icon-only rail with `aria-label`s replacing visible labels.

### Tables
- **Style:** `table-panel` container matches card elevation; sortable column headers use a hover wash and a consistent 44px-minimum tap target for touch.

## Do's and Don'ts

### Do:
- **Do** reserve Signal Teal for primary action, selection, and positive state — nothing else uses it.
- **Do** use the `--status-*` semantic tokens for any positive/negative/warning text or background, never a raw Tailwind palette class.
- **Do** keep interactive touch targets at a 44×44px minimum, matching the rest of the sidebar and table controls.
- **Do** assign chart-series colors by fixed position in the palette array, never by name-matching.

### Don't:
- **Don't** introduce a second type family; Instrument Sans carries every role, including tabular data.
- **Don't** use a colored `border-left`/`border-right` as an emphasis pattern on cards or callouts — use a tinted background wash instead.
- **Don't** let ambient depth (gradients, glows, shadow) carry state meaning; state comes from color, weight, and position.
- **Don't** invert the dark theme mechanically for light mode — light mode is composed with its own contrast-checked ink tokens, not a filter over the dark palette.
