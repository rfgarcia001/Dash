---
target: src/components/Dashboard.tsx
total_score: 24
max_score: 36
na_heuristics: 10
p0_count: 1
p1_count: 2
timestamp: 2026-09-03T01-18-59Z
slug: src-components-dashboard-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Last-sync timestamp, live ticker, transition-based recalc |
| 2 | Match System / Real World | 3 | Correct PT-BR domain vocabulary |
| 3 | User Control and Freedom | 3 | Limpar selecao, Escape-to-close, clear Voltar |
| 4 | Consistency and Standards | 2 | Raw &amp; HTML entity leaks into chart legend/tooltip text |
| 5 | Error Prevention | 3 | New "hoje ainda nao terminou" caveat is a genuinely good guard |
| 6 | Recognition Rather Than Recall | 2 | Funnel/campaign names truncate with no visible expand/tooltip; IADZ undecoded |
| 7 | Flexibility and Efficiency | 3 | Grouped date presets, sortable columns, click-to-highlight |
| 8 | Aesthetic and Minimalist Design | 2 | 10 KPI cards + 2 dense multi-scale charts + unreadable wrapped legend |
| 9 | Error Recovery | 3 | Present, generic-but-adequate fallbacks |
| 10 | Help and Documentation | n/a | Internal ops tool |
| Total | | 24/36 | Good (67%, low end) |

## Design Specificity Verdict

DESIGN.md is a real, opinionated system; Funil tab's stepped-width visualization is bespoke. Geral tab composition (4-up hero -> 6-up secondary -> line chart -> bar chart) is category-default SaaS shape.

detect.mjs --json src/components/Dashboard.tsx -> [], exit 0.

Both assessments independently caught the same real defect: unescaped &amp; HTML entity painted literally into chart legends/tooltips, reproduced desktop+mobile.

Previously-fixed charts render correctly with real multi-day data; no rendering defect remains once past sparse-seed-data condition.

## Overall Impression

Score moved 27/36 -> 24/36, not a regression from the fixes but two different assessments finding different things; this run surfaced a real previously-unnoticed &amp; encoding bug. Prior fixes hold up (charts render, partial-day caveat working and called out as a strength).

## What's Working

- Comparison-delta color logic correctly inverts for cost metrics.
- Funil tab stepped-width funnel visualization, bespoke and well-composed.
- Partial-day comparison caveat added last round is genuine proactive empathy, called out independently by both assessments.

## Priority Issues

- [P0] Raw HTML entity (&amp;) painted literally in chart legends and tooltips, confirmed desktop+mobile. Fix: decode entities once at the source. Suggested command: /impeccable harden.
- [P1] Degenerate chart rendering on sparse data has no empty-state guard (a real production condition for any new/slow-launch funnel, not just local test data). Fix: below N data points render a labeled empty state. Suggested command: /impeccable harden.
- [P1] Illegible truncated campaign/set identifiers in Funil table, no tooltip/expand. Fix: add title attribute at minimum. Suggested command: /impeccable clarify.
- [P2] Secondary KPI row still has 6 cards, exceeds chunking guideline. Suggested command: /impeccable layout.
- [P3] Undecoded acronym "IADZ" in filter chips, no tooltip. Suggested command: /impeccable clarify.

## Persona Red Flags

Jordan (First-Timer): blocked by IADZ and truncated campaign identifiers, nothing teaches meaning.
Casey (Mobile/Distracted): sees a single teal block where a chart should be on default filter with sparse data, concludes dashboard is broken.

## Minor Observations

- "Algumas fontes nao entraram" banner is state-driven, not an inserted insight, but worth a conscious check against the standing no-proactive-banner preference.
- "Vendas por produto" legend wraps into a dense hard-to-parse multi-line strip, independent of the &amp; bug.

## Questions to Consider

1. If delta-color logic already knows which direction is good, why does the legend still require memorizing color-to-metric mapping from a wrapped truncated strip?
2. Would this screen make more sense at half the metric count?
