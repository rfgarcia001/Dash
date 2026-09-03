---
target: src/components/Dashboard.tsx
total_score: 27
max_score: 36
na_heuristics: 10
p0_count: 2
p1_count: 1
timestamp: 2026-09-03T00-54-19Z
slug: src-components-dashboard-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Auto-refresh every 5min is silent — no toast/pulse when numbers change under the user |
| 2 | Match System / Real World | 4 | CPA/ROAS/Order Bump vocabulary matches how the team actually talks about launches |
| 3 | User Control and Freedom | 3 | Funnel-editor modal blocks Escape/outside-click mid-submit with only a disabled-state cue |
| 4 | Consistency and Standards | 3 | Signal Teal (reserved for "primary/positive") also colors a neutral mid-funnel stage block |
| 5 | Error Prevention | 2 | Invalid custom date range is computed (hasInvalidCustomDateRange) but doesn't visibly block submission |
| 6 | Recognition Rather Than Recall | 3 | Consistent icon+label+comparison on every metric card; funnel tag colors stay stable |
| 7 | Flexibility and Efficiency | 3 | Good metric-picker/breakdown power features, but no saved-view — filters reset every session |
| 8 | Aesthetic and Minimalist Design | 3 | 10 metric cards + 2 charts stack before any table — dense before it's organized |
| 9 | Error Recovery | 3 | Good per-funnel error detail, but permission errors and empty-data warnings share one visual treatment |
| 10 | Help and Documentation | n/a | Internal ops tool for a small team; no help surface expected or present |
| **Total** | | **27/36** | **Good (75%)** |

## Design Specificity Verdict

Not generic-SaaS-with-a-reskin: CPA split into Tráfego/Total, "Conversão de Order Bump," a literal 5-step book-launch funnel rendered as width-proportional blocks, a 1.1215 tax multiplier baked into revenue math, chart color assigned by stable array index (getFunnelColor). Macro layout (KPI row -> chart -> table) is category-interchangeable.

Deterministic scan: detect.mjs --json src/components/Dashboard.tsx returned [], exit 0 — clean.

No live human-visible browser tab was available; fallback was CLI scan + headless screenshots (desktop 1440x900, mobile 390x844). Assessment B caught a real defect Assessment A missed: both Geral-tab charts render as solid color blocks, 8 repeated console warnings ("width(-1) and height(-1)" Recharts ResponsiveContainer sizing failure), reproduced on both viewports.

## Overall Impression

Domain modeling and color-identity system are genuinely considered. But the reason someone opens this dashboard (reading trend charts) is currently broken, and the thing that would alarm them most (near-universal red down-arrows) is a false alarm from comparing partial-today against a full previous week.

## What's Working

- getFunnelColor assigns color by stable array index, never name-matching — identity survives renames.
- The funnel view renders each stage as a width-proportional block — honest, purpose-built drop-off visualization.
- useTransition around the revenue recompute is a diagnosed fix for a real perceived-performance complaint, not a spinner slapped on after the fact.

## Priority Issues

- [P0] Both dashboard charts render as solid color blocks, not charts. Recharts ResponsiveContainer measures a 0-size parent (8 console warnings, both viewports). Fix: give the lazy-loaded chart container an explicit height before mount. Suggested command: /impeccable optimize.
- [P0] Misleading trend indicators on partial-day data. comparePrevious compares partial-today against a full prior week, producing near-universal -88% to -98% deltas that aren't real. Fix: suppress same-day comparisons or label the basis explicitly. Suggested command: /impeccable clarify.
- [P1] Dead alerting subsystem with a fabricated-result mock (Math.random()-selected outcome in handleAlertAction), fully wired except the render (activeAlerts unused in JSX). Fix: delete or replace mock before ever surfacing. Suggested command: /impeccable harden.
- [P2] Signal Teal used outside its reserved role in the funnel view (a neutral mid-funnel stage shares the color with the terminal "Vendas" stage), violating DESIGN.md's own "One Accent Rule". Suggested command: /impeccable colorize.
- [P3] Flat 9-option date picker (dateOptions) with no sub-grouping, exceeds ~4-item working-memory guideline. Suggested command: /impeccable layout.

## Persona Red Flags

Alex (Power User): hits the P0 false-alarm trend daily; no saved-view, filters reset every session.
Riley (Stress Tester): hasInvalidCustomDateRange computed but no visible inline validation wired; the includeProductRevenue toggle re-triggers an 8000+-row recompute with only a subtle cue.

## Minor Observations

- Campaign/ad-set truncation relies on title attribute — invisible to touch/keyboard-only users.
- Campanhas table's ROAS column sits flush against the viewport edge, no trailing padding.
- PanelLoadingState is one generic fallback reused for every lazy tab, not skeleton-shaped per tab.

## Questions to Consider

1. If "everything is down 90%" every morning is a time-of-day artifact, how many real CPA spikes has the team already learned to shrug off?
2. The alerting subsystem is fully built and unused — cut deliberately, or about to ship with a Math.random() "applied result"?
3. Given this project's "no proactive banners" rule, is the "Algumas fontes não entraram" yellow banner exempt, or the same pattern under a different name?
