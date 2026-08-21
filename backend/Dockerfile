# Build context is the repo root (pyproject.toml/uv.lock live there, not under
# backend/) — build with: docker build -f backend/Dockerfile .

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Dependencies first, isolated from source, for layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# src/school_ahead is the uv_build project package declared in pyproject.toml.
COPY src ./src
COPY backend ./backend
RUN uv sync --frozen --no-dev

FROM python:3.12-slim AS runtime

RUN groupadd --system app && useradd --system --gid app --home-dir /app --no-create-home app
ENV HOME=/app

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/backend ./backend

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=core.settings

WORKDIR /app/backend

# Safe at build time — no DB access, just gathers static files into STATIC_ROOT.
RUN DJANGO_SECRET_KEY=build-time-placeholder python manage.py collectstatic --noinput

COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R app:app /app

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/openapi.json')"

ENTRYPOINT ["/app/entrypoint.sh"]
