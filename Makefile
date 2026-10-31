.PHONY: setup python-env dev-api dev-web test build format format-check

python-env:
	pyenv exec python -m venv backend/.venv

setup: python-env
	backend/.venv/bin/python -m pip install -r backend/requirements.lock -e './backend[test]'
	npm --prefix frontend install

dev-api:
	cd backend && .venv/bin/python -m uvicorn app.main:app --reload --port 8001

dev-web:
	npm --prefix frontend run dev

test:
	cd backend && .venv/bin/python -m pytest
	npm --prefix frontend run lint

build:
	npm --prefix frontend run build

format:
	cd backend && .venv/bin/python -m ruff format app migrations tests
	npm --prefix frontend run format

format-check:
	cd backend && .venv/bin/python -m ruff format --check app migrations tests
	npm --prefix frontend run format:check
