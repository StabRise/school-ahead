# Build context is the repo root (pyproject.toml/uv.lock live there, not under
# backend/) — build with: docker build -f backend/Dockerfile .

FROM python:3.12-alpine AS builder

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# gcc/musl-dev/postgresql-dev cover the case where psycopg-binary has no
# musllinux wheel for the target arch and uv falls back to building it (and
# its transitive C deps) from source against musl libc.
RUN apk add --no-cache gcc musl-dev postgresql-dev

# Dependencies first, isolated from source, for layer caching.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

# src/school_ahead is the uv_build project package declared in pyproject.toml.
COPY src ./src
COPY backend ./backend
RUN uv sync --frozen --no-dev

FROM python:3.12-alpine AS runtime

# libpq is only needed if psycopg ended up dynamically linked against it
# (source build fallback above); harmless no-op if the binary wheel
# (statically linked) was used instead.
RUN apk add --no-cache libpq && \
    addgroup -S app && adduser -S -G app -H -h /app app
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
