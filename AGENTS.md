# Repository Guidelines

## Structure and requirements

`Subscription_Management_System.pdf` is the source of truth. `frontend/` contains the React interface, `backend/` the FastAPI service and tests, and `docs/API_CONTRACT.md` the proposed full API. Organize new code around accounts and roles, catalog and plans, subscriptions, invoicing, payments, discounts, and reporting.

## Commands and style

Use the exact setup and check commands in `README.md`. Format and lint Python with Ruff; type-check and build TypeScript before a pull request. Use domain names such as `Subscription`, `Invoice`, and `Payment`. Keep credentials out of source and use environment variables for secrets.

## Tests and security

Prioritize role boundaries, lifecycle transitions, renewal dates, tax and discount arithmetic, payment allocation, and duplicate-invoice prevention. Test expired discounts and repeated billing jobs. Verify the PDF's two-second response target against representative data before claiming it. Only admins may add staff or create discount rules; customer reads and actions must be scoped to their own records.

## Commits and pull requests

Make small commits throughout the work as each fix, feature, or other natural unit is completed; do not wait until the end. Use short imperative subjects and the Git identity assigned for that unit. Do not add co-author trailers. Pull requests should describe changed behavior, link the requirement or issue, list checks and results, and include screenshots for interface changes.
