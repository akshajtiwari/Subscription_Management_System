# Repository Guidelines

## Project Structure & Module Organization

`Subscription_Management_System.pdf` is the source of truth for Brightloop Software's subscription and billing requirements. `wireframes/` contains the static product mockup, `tests/` its rule and browser checks, `scripts/` the static build, and `docs/` the workflow map, API proposal, and baseline. The mockup has no backend. Future application code should live in a separate top-level directory organized around accounts and roles, catalog and plans, subscriptions, invoicing, payments, discounts, and reporting.

## Build, Test, and Development Commands

The mockup is dependency-free HTML, CSS, and JavaScript. `README.md` gives exact root commands. Use `node scripts/build.cjs` for a static copy in `dist/`, `node --check` on the three JavaScript files for syntax checks, `node tests/workflow-model.test.cjs` for rule tests, and the documented Firefox commands for browser checks. Do not assume `npm test` exists.

## Coding Style & Naming Conventions

The legacy mockup keeps its existing compact source format to preserve the approved baseline. New JavaScript uses semicolons and two-space indentation. Run `node --check` and the strict Porcelain UI audit before opening a pull request. Use domain terms from the brief consistently: `Subscription`, `Invoice`, and `Payment`. Name tests after the behavior they verify, and avoid ambiguous names such as `data` or `item` for billing records.

## Testing Guidelines

`tests/workflow-model.test.cjs` uses Node's built-in test runner; `tests/browser-verify.js` covers interactive mockup states in Firefox. Prioritize authorization boundaries, subscription state transitions, renewal scheduling, tax and discount calculations, payment allocation, and duplicate-invoice prevention. Include failure and boundary cases, such as expired discounts and repeated billing jobs. The brief's two-second target requires a real backend and representative data before it can be claimed.

## Commit & Pull Request Guidelines

Make small commits throughout the work as each fix, feature, or other natural unit is completed; do not wait until the end. Use short, imperative subjects, such as `Add invoice generation for renewals`, and the Git identity assigned for that unit of work. Do not add co-author trailers. Pull requests should explain the behavior changed, link the relevant requirement or issue, list test commands and results, and include screenshots for user-facing changes.

## Security & Configuration

Keep credentials and payment secrets out of the repository. Use environment variables and provide a redacted example configuration when needed. Enforce the brief's role boundaries: only admins may add staff or create discount rules, and customers may access only their own subscriptions and invoices.
