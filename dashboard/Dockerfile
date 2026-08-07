# Build context must be the repo root (see docker-compose.yml) — npm
# workspaces monorepo; dashboard has no standalone package-lock.json, only
# the root one. Unlike gateway/api/eval-service, dashboard doesn't depend on
# libs/*, so it only needs its own source copied in, not the shared libs.
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
COPY dashboard ./dashboard
WORKDIR /app/dashboard
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dashboard/dist /usr/share/nginx/html
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
