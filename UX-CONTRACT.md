# Brightloop UX Contract

This contract covers the standalone mockup in `wireframes/`. Business rules come from `Subscription_Management_System.pdf` and the proposed `docs/API_CONTRACT.md`. Billing and customer actions demonstrate sample outcomes in memory; they do not save records. Visual tokens and motion are in `DESIGN.md`.

## Navigation and roles

The sidebar groups primary routes into Billing operations, Catalog & pricing, Team access, and Customer portal. Each destination has a small outline icon. Lists open detail screens for substantial workflows. Adding staff, editing a tax rule, and recording a payment use a rectangular overlay on the owning list; the other editors keep full screens because they have longer forms or line items. Browser history uses route hashes. The desktop rail collapses with the top-left toggle. On narrow screens, the toggle opens a navigation drawer with a scrim, Escape dismissal, focus containment, and focus return; its icon changes to a cross at the same position. Interaction notes open in a separate drawer on demand. `?role=admin|staff|customer` selects an inspectable role state without a role switcher in the product UI. Staff see catalog data without admin edit actions, and customers see only portal routes. The implemented product must enforce those boundaries on the server.

Native `<select>` owns single-choice fields in this planning prototype, including status filters and line tax rules. Its closed control uses the shared Porcelain · Graphite treatment; the browser or operating system owns the opened menu and keyboard behavior.

## Canonical UI map

| Capability | Prototype owner | Behavior |
| --- | --- | --- |
| Navigation | `render` and `navigate` in `wireframes/app.js` | Route transition and history |
| Form | `fieldControl` and `form` | Native input/select, field grouping and preview submit |
| Table | `table` and `enhanceSearch` | Local sample search, status filter and row navigation |
| Dialog | `#review-dialog` and `#product-picker` | Shared action review, outcome, and catalog selection without financial mutation |
| Toast | `showToast` | Sample action feedback in a live region |
| Motion/tokens | `wireframes/styles.css` | Shared timing, colors and reduced motion |
| Workflow rules | `wireframes/model.js` | Role visibility, lifecycle permissions, password rules, invoice arithmetic, and billing-run deduplication |

## Interaction states

Lists preserve row geometry while filtering. List search waits 300 ms and clears immediately. Empty search results explain how to recover. The shared catalog overlay filters by product name, SKU, or variant. Checkboxes form a draft selection; Cancel discards it, while Add selected updates the owning subscription, quotation template, or discount editor. Subscription lines expose unit price, quantity, tax, and line amount together. Product variants have name, brand, and price adjustment; plans expose separate pause, early-close, and renewal permissions.

Draft subscriptions can be quoted, then confirmed and activated. Active subscriptions can pause, renew, or close according to plan permissions; paused subscriptions can resume. The lifecycle history updates after each in-session action. Eligible customer actions use the same review dialog. Invoices show lines, discount, tax, total, payments, and amount due. Draft invoices can be confirmed or cancelled; confirmed invoices can be sent, cancelled, downloaded as PDF, or paid in part or in full. Billing runs show created, skipped, and failed counts and let failed rows retry. Reports filter a shared month dataset across metric cards, bars, and the table. `?outcome=error` makes the next submitted action fail once and leaves the dialog or form available to retry. Review actions show a fixed-size busy state and a short outcome. Chart animation never replaces visible numbers or the report table. Reduced motion removes travel and drawing.

## Implementation handoff

Target WCAG 2.2 AA. The real application needs server pagination, authorization on every route and request, idempotent billing actions, payment and tax rules, and a confirmed policy for customer self service. The mockup demonstrates layout and flow; its in-memory outcomes are sample states, not backend guarantees.
