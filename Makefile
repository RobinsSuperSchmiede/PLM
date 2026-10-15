.PHONY: install-web install-api dev-web dev-api test-api help

help:
	@echo "Available targets: install-web, install-api, dev-web, dev-api, test-api"

install-web:
	npm install --prefix apps/web

install-api:
	cd apps/api && python -m venv .venv && . .venv/bin/activate && pip install -e .

dev-web:
	npm --prefix apps/web run dev

dev-api:
	cd apps/api && . .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

test-api:
	cd apps/api && . .venv/bin/activate && pytest -q
