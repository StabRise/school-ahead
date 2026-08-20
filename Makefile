.PHONY: help install install-backend install-frontend \
	dev backend frontend \
	migrate makemigrations superuser shell \
	lint lint-backend lint-frontend \
	format format-backend format-frontend \
	typecheck typecheck-backend typecheck-frontend \
	test test-backend test-frontend \
	clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

## Install

install: install-backend install-frontend ## Install backend and frontend dependencies

install-backend: ## Install backend dependencies (uv)
	uv sync

install-frontend: ## Install frontend dependencies (bun)
	cd frontend && bun install

## Dev servers

dev: ## Run backend and frontend dev servers together
	@trap 'kill 0' EXIT; \
	$(MAKE) backend-dev & \
	$(MAKE) frontend-dev & \
	wait

backend: ## Run the Django dev server
	cd backend && uv run manage.py runserver

frontend: ## Run the Next.js dev server
	cd frontend && bun run dev

## Django management

migrate: ## Apply database migrations
	cd backend && uv run manage.py migrate

makemigrations: ## Create new database migrations
	cd backend && uv run manage.py makemigrations

superuser: ## Create a Django superuser
	cd backend && uv run manage.py createsuperuser

shell: ## Open the Django shell
	cd backend && uv run manage.py shell

## Lint

lint: lint-backend lint-frontend ## Lint backend and frontend

lint-backend: ## Lint backend with ruff
	cd backend && uv run ruff check .

lint-frontend: ## Lint frontend with eslint
	cd frontend && bun run lint

## Format

format: format-backend format-frontend ## Format backend and frontend

format-backend: ## Format backend with ruff
	cd backend && uv run ruff format .

format-frontend: ## Format frontend with eslint --fix
	cd frontend && bun run lint --fix

## Typecheck

typecheck: typecheck-backend typecheck-frontend ## Typecheck backend and frontend

typecheck-backend: ## Typecheck backend with ty
	cd backend && uv run ty check .

typecheck-frontend: ## Typecheck frontend with tsc
	cd frontend && bunx tsc --noEmit

## Test

test: test-backend test-frontend ## Test backend and frontend

test-backend: ## Run backend tests with pytest
	cd backend && uv run pytest

test-frontend: ## Run frontend tests with vitest
	cd frontend && bun run test

## Clean

clean: ## Remove build artifacts and caches
	rm -rf backend/.pytest_cache backend/.ruff_cache
	rm -rf frontend/.next
