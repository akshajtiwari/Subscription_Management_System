# Brightloop subscription management demo

This repository is building the application described in `Subscription_Management_System.pdf`. `frontend/` is a React and TypeScript interface; `backend/` is a Python FastAPI service with SQLAlchemy persistence. The application uses fictional records. It sends no real email, charges no money, and does not provide production tax compliance. The application is still incomplete; see `docs/API_CONTRACT.md` for the intended API and open billing decisions.

## Local setup

Prerequisites: Python 3.11+, Node.js 24+, `uv`, and optionally Docker for PostgreSQL. Run from the repository root:

```sh
docker compose up -d postgres
cd backend && uv sync --extra test
DATABASE_URL=postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop uv run alembic upgrade head
DATABASE_URL=postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop uv run python -m app.seed
DATABASE_URL=postgresql+psycopg://brightloop:demo_only@localhost:5432/brightloop uv run uvicorn app.main:app --reload --port 8001
```

In another terminal, run `cd frontend && npm install && npm run dev`, then open `http://localhost:5173`. For a local SQLite demo, omit `DATABASE_URL` in the backend commands. The API documentation is at `http://localhost:8001/docs`.

Fictional accounts: `admin@brightloop.demo` / `DemoAdmin!1`, `staff@brightloop.demo` / `DemoStaff!1`, and `customer@brightloop.demo` / `DemoCustomer!1`. Set `DEMO_SECRET` before sharing a deployment.

## Checks

```sh
cd backend && uv run pytest && uv run ruff check app tests
cd frontend && npm run lint && npm run build
```

Run `cd backend && uv run python -m app.worker` to start the demo billing poller in a separate process. PDF output, full browser integration tests, and several API contract workflows are not implemented yet.
