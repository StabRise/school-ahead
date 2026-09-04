# Build context is frontend/ (the bun workspace root) — build with:
# docker build -f frontend/apps/web/Dockerfile frontend

FROM oven/bun:1-slim AS deps

WORKDIR /app

# Every workspace's package.json is needed before `bun install` can resolve
# the workspace graph, even though only apps/web gets built below.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/preschool-ui/package.json packages/preschool-ui/package.json
COPY packages/preschool-games/package.json packages/preschool-games/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Inlined into the browser bundle at build time — must be set here, not just
# at runtime. NEXT_PUBLIC_API_URL is the browser-facing URL (localhost, since
# the browser runs on the host); server-side requests use API_URL instead
# (see packages/api-client/src/mutators/server-mutator.ts), which isn't
# needed at build time.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN bun run --cwd apps/web build

# Next's standalone server.js is a plain Node script — no bun runtime needed.
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
