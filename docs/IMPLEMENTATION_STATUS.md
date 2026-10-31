# Application implementation status

The PDF remains the requirements source. This is a persistent fictional demo, not a live billing service.

## Implemented

- Customer signup, login, password-rule validation, reset requests and confirmation, demo outbox, role-scoped reads, and admin staff creation.
- Product and variant selection, plan configuration, quotation templates, server-resolved subscription prices, lifecycle actions, and history.
- Billing runs with per-period invoice deduplication, retries by idempotency key, automatic term handling, configured tax and discount calculations, invoice confirmation/cancellation, fictional PDF output, and partial payment allocation.
- Customer change requests and staff approval, with approved changes applied at the next billing boundary.
- Currency-separated overview, collections series, and overdue invoice API data; React report chart and table use the same series.

## Required before the full problem statement is complete

- Run the FastAPI integration suite and React build after dependencies are available; fix any failures and add browser tests for every PDF scenario, including loading, empty, error, retry, and mobile states.
- Replace remaining generic JSON detail and editor views with complete domain forms and itemized invoice screens. Hide actions using the current status and plan permissions; complete the customer add-on quantity flow.
- Add tax and discount configuration validation, quotation expiry and renewal boundary tests, payment method/reference validation, and safe handling of concurrent billing runs and discount usage limits.
- Add the two-second page-response benchmark with thousands of subscriptions. Do not claim the target until it passes.

## Verification available in this environment

`python3 -m compileall -q backend/app backend/tests` passes. The pure calendar, invoice arithmetic, payment boundary, jurisdiction tax, and PDF tests pass when called directly. `uv sync --extra test` and `npm install` cannot finish because the package registries cannot be resolved here, so API integration and browser checks remain unverified.
