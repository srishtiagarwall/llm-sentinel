# Build context must be the repo root (see docker-compose.yml) — npm
# workspaces monorepo, same reasoning as gateway/Dockerfile.
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
COPY eval-service ./eval-service
RUN npm run build:libs
RUN npm run build -w eval-service

FROM node:22-alpine AS runner
WORKDIR /app
COPY --from=builder /app/eval-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/eval-service/package.json ./package.json
CMD ["node", "dist/src/main"]
