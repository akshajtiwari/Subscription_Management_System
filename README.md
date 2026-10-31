# Brightloop workflow mockup

## Persistent demo application (work in progress)

`frontend/` contains a React and TypeScript workspace. `backend/` contains a FastAPI API with SQLAlchemy persistence. The existing `wireframes/` remain the approved visual reference. The new app is a **fictional demo**, with no real email delivery, tax compliance, or payment collection. It does not yet cover every screen and interaction in the wireframes.

Prerequisites: Python 3.11+, Node 24+, `uv`, and optionally Docker for PostgreSQL. Run each command from the repository root:

```sh
docker compose up -d postgres
cd backend && uv sync --extra test
DATABASE_URL=postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop uv run python -m app.seed
DATABASE_URL=postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop uv run uvicorn app.main:app --reload --port 8001
```

In another terminal:

```sh
cd frontend && npm install && npm run dev
```

Open `http://localhost:5173`. The fictional accounts are `admin@brightloop.demo` / `DemoAdmin!1`, `staff@brightloop.demo` / `DemoStaff!1`, and `customer@brightloop.demo` / `DemoCustomer!1`. Change `DEMO_SECRET` for any shared demo deployment. To run tests and checks:

```sh
cd backend && uv run pytest && uv run ruff check app tests
cd frontend && npm run lint && npm run build
```

For a local SQLite run, omit `DATABASE_URL` and run the seed and server commands from `backend/`. The demo API is documented at `http://localhost:8001/docs` when running. The current implementation has no migration history, scheduled worker, PDF output, or full browser integration suite; the API contract in `docs/API_CONTRACT.md` is still a proposed target for those pieces.

This repository contains a static HTML, CSS, and JavaScript mockup for the workflows in `Subscription_Management_System.pdf`. It uses sample records and keeps changes in memory for the current browser session. No account, billing, or payment data is saved or sent.

## Project layout

- `wireframes/`: the product mockup and shared workflow rules. Invoice PDFs are generated from the current sample state.
- `tests/`: rule tests and an optional Firefox browser workflow harness.
- `docs/`: workflow map, proposed API contract, and approved source hashes.
- `scripts/`: a dependency-free static build command.

## Run

Open `wireframes/index.html` in a browser. A local server also works from the repository root:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/wireframes/`.

Use URL parameters to inspect sample states without adding a role switcher to the UI:

```text
wireframes/index.html?role=staff#overview
wireframes/index.html?role=customer#my-subscription
wireframes/index.html?subscription=draft#subscription-detail
wireframes/index.html?invoice=overdue#invoice-detail
wireframes/index.html?discount=expired#invoice-detail
wireframes/index.html?pause=no&renew=no&close=no#my-subscription
wireframes/index.html?outcome=error#billing-runs
```

`outcome=error` fails the next submitted action once, so the retry path can be checked. The sidebar toggle sits at the same position in its hamburger and cross states on mobile.

## Build and checks

Node.js 24 or newer is used for the dependency-free build and rule tests. Run these from the repository root:

```sh
node scripts/build.cjs
node --check wireframes/model.js
node --check wireframes/app.js
node --check wireframes/workflows.js
node tests/workflow-model.test.cjs
```

The build copies the mockup to `dist/`. There is no bundler or package install. Firefox and ImageMagick are optional for the browser workflow checks. Run these commands separately from the repository root:

```sh
node tests/create-browser-fixture.cjs
firefox --headless --screenshot /tmp/brightloop-browser-smoke.png --window-size 1280,900 "file://$PWD/wireframes/.browser-smoke.html"
node tests/check-browser-screenshot.cjs
rm wireframes/.browser-smoke.html
```

The browser harness checks 38 access, catalog, subscription, invoice, billing, report, and navigation states. The Porcelain UI audit is configured in `premium-ui.json`; its latest strict result is in `premium-audit.json`.
