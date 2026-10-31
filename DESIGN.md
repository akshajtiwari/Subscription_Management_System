---
version: alpha
name: Brightloop
description: A porcelain and graphite subscription workspace with quiet, readable data.
colors:
  primary: "#49514D"
  secondary: "#505641"
  navigation: "#F0F3F6"
  background: "#F7F9FC"
  text: "#212B40"
  muted: "#657086"
  border: "#E1E6EE"
typography:
  sans:
    fontFamily: "Adwaita Sans, Segoe UI, system-ui, sans-serif"
  mono:
    fontFamily: "Adwaita Mono, Cascadia Mono, ui-monospace, monospace"
rounded:
  DEFAULT: "0.6875rem"
  sm: "0.4375rem"
  md: "0.5rem"
  lg: "0.6875rem"
spacing:
  section-gap: "1.375rem"
  page-max: "82.5rem"
components:
  button: {}
  card: {}
  table: {}
  dialog: {}
  navigation: {}
---

# Brightloop Design System

## Approved implementation baseline

The current `wireframes/` mockup is the approved UI baseline for the real product. Preserve its rendered layout, fonts, colors, spacing, component shapes, motion, navigation order, and visible text at matching viewport sizes and states. Do not add helper copy, subtext, or other visible content to implemented screens without an approved mockup change. `docs/MOCKUP_BASELINE.sha256` records the reviewed source files. Runtime data replaces illustrative values inside the same UI slots. Compare rendered screens and visible text with the mockup before accepting implementation work.

## Direction

Brightloop is an operations tool for admins, staff, and customers. The selected Porcelain · Graphite direction uses a cool porcelain base, blue-black ink, and olive-gray controls. A restrained line of state runs through navigation, charts, and lifecycle timelines. Meaning comes from words, spacing, and placement. Status labels remain legible without color.

## Layout and typography

The desktop shell has a collapsible 232 px navigation rail and a flexible content area up to 1320 px. The sidebar groups primary destinations into Billing operations, Catalog & pricing, Team access, and Customer portal, each with a quiet outline icon; detail and editor screens open through their owning flow. The top bar shows section, current screen, notes, account identity, and the rail toggle. Interaction notes open in a separate drawer. Below 860 px, navigation becomes a drawer; its hamburger changes to a cross in the same top-left position when open. Body copy starts at 15 px, with modest weights and comfortable field and row spacing. Detail pages use a primary column and a contextual side panel. Monetary figures use tabular monospaced numerals. Adwaita Sans and Adwaita Mono use system fallbacks when unavailable.

## Components and motion

Cards, tables, fields, buttons, and dialogs use the tokens above. `wireframes/styles.css` is the runtime token source; update that file and this document together. Section headings and destinations share a minimal outline icon family. The home screen uses one shared metric strip, one chart, and a short work queue. Compact staff, tax, and payment forms use rectangular overlays above their owning list. Subscription actions, invoice actions, and customer self service use one rectangular review dialog. The catalog picker is shared by subscriptions, quote templates, and product-scoped discounts. Surfaces use subtle borders and spacing instead of stacked shadows. Status uses a label and dot, never color alone. Motion signals route changes and chart updates: 130 ms exit, 360 ms entrance, 700 ms bar growth, and a 1150 ms chart line draw. Reduced motion preserves final values without travel or drawing.

## Restraint

Use one chart per overview, with a nearby data table in reports. Keep invoice totals, error text, and lifecycle labels still and readable. Avoid strong brand color, gradients, decorative accent strips, looping animation, hidden scrollbars, and animated money counters.

## Accent study

`docs/design-preview/index.html` compares three accents on the same Porcelain base and Brightloop layouts: Copper `#A34F2D`, Mulberry `#8B3E58`, and Graphite `#49514D`. Graphite is applied to `wireframes/index.html` across navigation, actions, charts, and invoice states.
