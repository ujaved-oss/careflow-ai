.PHONY: run worker seed migrate test lint typecheck
run:
	uv run uvicorn careflow.main:app --reload
worker:
	uv run python -m careflow.worker
seed:
	uv run python -m careflow.seed
migrate:
	uv run alembic upgrade head
test:
	uv run pytest
lint:
	uv run ruff check src tests scripts
typecheck:
	uv run mypy src
