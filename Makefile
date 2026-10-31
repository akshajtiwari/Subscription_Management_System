.PHONY: format format-check

format:
	cd backend && uv run --extra test ruff format app migrations tests
	npm --prefix frontend run format

format-check:
	cd backend && uv run --extra test ruff format --check app migrations tests
	npm --prefix frontend run format:check
