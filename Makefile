.PHONY: setup python-env dev dev-api dev-web worker test test-e2e build format format-check verify

python-env:
	pyenv exec python -m venv backend/.venv

setup: python-env
	backend/.venv/bin/python -m pip install -r backend/requirements.lock -e './backend[test]'
	npm --prefix frontend ci

dev-api:
	cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8001

dev:
	cd backend && .venv/bin/python -m app.dev

dev-web:
	npm --prefix frontend run dev

worker:
	cd backend && .venv/bin/python -m app.worker

test:
	cd backend && .venv/bin/python -m ruff check app migrations tests
	cd backend && .venv/bin/python -m pytest
	npm --prefix frontend run lint

test-e2e:
	npm --prefix frontend run test:e2e

verify: format-check test build

build:
	npm --prefix frontend run build

format:
	cd backend && .venv/bin/python -m ruff format app migrations tests
	npm --prefix frontend run format

format-check:
	cd backend && .venv/bin/python -m ruff format --check app migrations tests
	npm --prefix frontend run format:check
