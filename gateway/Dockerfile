# Build context must be the repo root (see docker-compose.yml) — this is an
# npm workspaces monorepo, so gateway depends on libs/* via workspace symlinks
# and there's no package-lock.json inside gateway/ alone; npm ci needs the
# root lockfile and full workspace layout to resolve those.
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY gateway/package.json gateway/package.json
COPY api/package.json api/package.json
COPY eval-service/package.json eval-service/package.json
COPY dashboard/package.json dashboard/package.json
COPY libs/tracing/package.json libs/tracing/package.json
COPY libs/guardrails/package.json libs/guardrails/package.json
COPY libs/evaluators/package.json libs/evaluators/package.json
COPY libs/queue/package.json libs/queue/package.json
COPY libs/audit/package.json libs/audit/package.json
RUN npm ci
COPY libs ./libs
COPY gateway ./gateway
RUN npm run build:libs
RUN npm run build -w gateway

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/gateway/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/gateway/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/src/main"]
