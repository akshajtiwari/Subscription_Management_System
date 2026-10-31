# Brightloop screen and motion map

Open [`wireframes/index.html`](../wireframes/index.html) in a browser. The mockup contains **34 screens and overlays** for internal operations and the customer portal. The sidebar groups destinations as Billing operations, Catalog & pricing, Team access, and Customer portal, with minimal outline icons beside both section headings and destinations. The desktop rail collapses, and the mobile hamburger changes to a cross at the same top-left position when the drawer opens. Compact staff, tax, and payment forms open as rectangular overlays above their lists; longer workflows keep full screens. The shared searchable product selector fills subscription lines, quotation templates, and product-scoped discounts. Use **Notes** in the header to inspect motion. All figures are sample data; outcomes are in memory only.

The separate [`design-preview/index.html`](design-preview/index.html) compares three Porcelain accent shades on identical overview and invoice layouts. Porcelain · Graphite is applied to the full mockup.

## Screen inventory

| Flow | Screens | Main decision shown |
| --- | --- | --- |
| Access | Sign in, create account, forgot password, set new password | Credentials, recovery and role landing |
| Administration | Staff members, add staff member | Admin-only staff creation and directory |
| Operations landing | Overview | Active subscriptions, collections, outstanding and overdue work |
| Customers | Customer list, customer account | Contact record with related subscriptions and invoices |
| Catalog | Product list/editor, plan list/editor | Variants and price adjustment; plan billing and lifecycle permissions |
| Configuration | Tax list/editor, discount list/editor | Effective dates, discount scope, product selection and limits |
| Sales | Quote template list/editor, subscription list/editor/detail | Template to quotation to active lifecycle |
| Billing | Billing runs, invoice list/detail, payment list/entry | Created/skipped/failed counts, itemized bill, status, PDF, partial payment and amount due |
| Finance | Reports, overdue invoices | Filtered summaries and overdue queue |
| Customer portal | My account, my subscriptions/detail, my invoices/detail | Own records and invoice download |

## Wireframe patterns

```text
Internal list       Internal detail        Editor                Customer portal
┌──────┬──────────┐ ┌──────┬──────────┐ ┌──────┬──────────┐ ┌──────┬──────────┐
│ nav  │  header  │ │ nav  │  header  │ │ nav  │  header  │ │ nav  │  header  │
│      ├──────────┤ │      ├──────────┤ │      ├──────────┤ │      ├──────────┤
│      │ search   │ │      │ figures  │ │      │ fields   │ │      │ summary  │
│      │ filter   │ │      │ terms    │ │      │ review   │ │      │ records  │
│      │ rows     │ │      │ activity │ │      │ action   │ │      │ download │
└──────┴──────────┘ └──────┴──────────┘ └──────┴──────────┘ └──────┴──────────┘
```

## Motion system

Motion communicates a change in state. Routes fade out for 130 ms and enter over 360 ms; browser history follows the same path. The mobile navigation drawer slides in and closes by the fixed toggle, scrim, or Escape. The hamburger changes into a cross in place. List search waits 300 ms after typing and clears immediately; product-picker search filters as the user types. The picker retains checkbox selection while searching, and Cancel leaves applied lines unchanged. Overview and report charts draw and fade on entry; bars grow over 700 ms, with values also visible as text and a report table. Money values and statuses never count upward. Financial actions open a review dialog. Reduced motion removes route travel and chart drawing while preserving final states.

## Decisions before implementation

The PDF calls for customer management but does not define exact self service permissions, tax jurisdiction, billing timezone and proration, payment reversals, or the meaning of revenue. The mockup shows eligible customer actions using sample plan permissions; the implemented authorization policy remains open. Invoice arithmetic and billing deduplication are illustrative rule checks, not records or financial guarantees. Currency values deliberately have no symbol. The draft [`API_CONTRACT.md`](API_CONTRACT.md) lists unresolved domain decisions.

## Review checklist

Role states are inspectable with `?role=admin|staff|customer`. `?subscription=draft|quotation|confirmed|active|paused|closed`, `?invoice=draft|confirmed|paid|cancelled|overdue`, `?discount=expired|exhausted`, and `?pause=no&renew=no&close=no` expose status, discount, and plan boundaries. `?outcome=error` fails the next action once, leaving a retry path. Actions show a fixed-size busy state before updating the in-memory mockup.

The browser harness checked 38 access, catalog, subscription, invoice, billing, report, and navigation states. Desktop screenshots covered the new detail, editor, billing-run, and report screens at 1280×900; the invoice and navigation drawer were reviewed at 390×844. The strict UI audit passed with zero findings. Review the unresolved policy decisions above before using these screens as implementation acceptance criteria.
