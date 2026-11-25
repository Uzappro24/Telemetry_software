# Eco Racing dashboard — W9 / W11 design handoff

This document specifies the implemented frontend for recreation as editable Figma components. No Figma file was created: plugin discovery on 25 November 2026 found Figma available but not installed, and no repository Figma links or wider team variable specification were found. The six names, units and warning thresholds in `../telemetry.py` remain the source of truth. Additional variables require confirmed metadata.

## Frames and layout

Create desktop 1440 × 1000, laptop 1024 × 1000, tablet 768 × 1024, and phone 390 × 844 / 320 × 844 frames. Content scrolls vertically; frame height does not constrain data.

- Desktop, 1200 px and above: header then three columns. Sensor column minimum 280 px, graphs flexible (twice the proportional width), controls minimum 260 px. Event log spans all columns. Panels use 24 px padding and 1 px separators.
- Laptop, 769–1199 px: 240 px sensors beside flexible graphs. Status/session/settings occupy a three-column row below. Event log spans both columns.
- Tablet/phone, 768 px and below: sensors, graphs, controls, log in one column. Sensor cards use two columns. Panel padding 16 px; graph area horizontal padding 8 px. Header wraps. Graph time labels reduce from five to three on surfaces under 400 px.

## Tokens and typography

Reuse CSS custom properties in `css/style.css`: background `--bg` #0A0A0B, panel #111113, separators #232327, primary text #EDEDED, plot text #A6A6AF, lime accent #C6FF3D, amber warning #FFB020, fault #FF3B30, minimum marker blue #89CFFF. No shadows or gradients in the graph components.

Barlow Condensed 500/600 for brand, headings and large readings; JetBrains Mono 400 for values, timestamps, controls, ticks and logs. Graph title 18 px; graph values 12 px; ticks, legends and tooltips 11 px. Sensor numbers are 52 px desktop / 36 px mobile. Keep existing fonts local.

## Component: Sensor card

Label and textual state above a large value and unit; gauge and selected-window min/max below. Variants: healthy (lime state), warning (red text plus explicit Warning), stale (amber Stale and muted value), unavailable (em dash, no statistics, explicit Unavailable). Threshold states must not rely on color alone. Cards remain visible even when their graph is hidden.

## Component: Variable picker

An initially expanded details disclosure above graphs lists all six confirmed variables with unit, checkbox, data state and Pin/Unpin button. Row grid: flexible label / 84 px state / 65 px button; at mobile, 66 px / 60 px. Checkbox and pin state are keyboard accessible. Render three graphs by default. Allow at most four selected graphs; unavailable variables may still be selected. At capacity disable additional selections. Pinning makes a graph visible; pinned graphs cannot be hidden until unpinned. Pinned graphs appear first, maintaining stable selection order within each group. Store only selected/pinned keys under `eco-racing.graphs.v1` in localStorage. Storage failure must not stop telemetry.

## Component: Telemetry graph

One bordered article, full column width. Header contains quantity and latest visible value. Plot surface height is 245 px desktop / 230 px mobile. Footer wraps min/max and warning metadata. Canvas plot inset: left 70, right 20, top 24, bottom 55 px. Y quantity and unit are top-left within the plot surface; X title names source time and the browser's IANA timezone. Tooltip includes full local date/time with milliseconds and producer source ID. X positions come from actual source timestamps, never sample index.

The visible interval ends at server-adjusted now and spans the selected 30/60/300/900 seconds. Samples outside it do not affect extrema or scales. Y bounds are padded and rounded from visible data. Minimum spans prevent constant readings collapsing the scale. Throttle stays inside 0–100%; voltage and RPM have zero floors; signed current and temperature remain supported. Axes need not begin at zero: show their explicit values and the Auto-scaled notice. Expand scale immediately for new extrema; contract only after eight consecutive narrower updates. A range change resets scale immediately.

Line: lime, 1.7 px, straight segments with round joins and no synthetic interpolation. Preserve irregular timing. Separate producer series and break unusually long gaps (greater than four times median interval, minimum three seconds). This gap rule is a presentation heuristic, not a hardware sampling guarantee. Single readings still show a marker. Empty window: axes plus No readings in this time window and Unavailable header.

Minimum: blue outlined circle with numerical MIN + unit footer. Maximum: amber outlined square with numerical MAX + unit footer. For identical extrema show both nested shapes and both values, without inventing distinct samples. Ties choose the earliest source-ordered point. Warning thresholds are dashed amber lines at their actual value when inside the scale; footer always states configured threshold so off-scale limits remain discoverable. Thresholds do not force huge empty Y ranges.

## Interaction variants

Desktop: pointer within 32 CSS px selects the nearest actual sample, shows a white marker and vertical guide. Pointer changes redraw only the overlay, coalesced with requestAnimationFrame. Tooltip has panel background and neutral border; stays within the graph surface with 4 px minimum edge spacing. Do not interpolate a value between samples.

Touch: tap or drag within 80 CSS px of a point to inspect; horizontal drag uses pointer capture. Vertical page scrolling remains available (`touch-action: pan-y`), so browser scroll gestures can cancel inspection. Keyboard: focus the plot, left/right arrows inspect samples, Escape or blur closes. Selected keyboard point is retained by timestamp and source during new data arrival. Mouse selection follows the stationary pointer as the live window moves.

## Status and data lifecycle

Keep the existing backend active/stale/disconnected states, source-age clock, single-flight polling and retry backoff. Source timestamps drive plots; server time compensates browser clock offset. A backend session ID change clears browser history so session clearing from another client is reflected. Missing values clear prior card readings. History identities include source plus timestamp; only exact identities are deduplicated. History is bounded to 15 minutes and 10,000 points per variable, matching the backend's default sample bound.

## Implementation and verification references

- `js/graph-model.js`: six-variable metadata, visible-window normalization, extrema, scales, projections, point hit testing and preference rules.
- `js/graph-view.js`: Canvas drawing, overlay, pointer/touch/keyboard inspection.
- `js/dashboard.js`: API integration, picker, health and preferences.
- `tests/graphs.test.js`: executable geometry, scaling and preference tests.
- `tests/browser-graphs.cjs`: real Flask history hydration and browser interaction/responsive checks, using an isolated external-mode server.

No chart library or production package dependency was introduced. Future variables should be added only after their quantity, unit, accepted range, warning limits and formatting are confirmed; add metadata and corresponding overview cards together.
