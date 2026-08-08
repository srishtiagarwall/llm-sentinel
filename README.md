# LLM Sentinel

> Open-source LLM observability & governance platform — a transparent proxy enforcing PII detection, hallucination scoring, policy rules, and EU AI Act Article 12 compliant audit reporting.

## What It Does

LLM Sentinel sits between your application and any LLM provider (Gemini, OpenAI, Claude). Every request passes through it — zero changes needed on the client side.

```
Your App → LLM Sentinel Gateway → LLM Provider
                ↓
        Logs · Guards · Scores · Alerts · Reports
```

## Features

- **Drop-in OpenAI-compatible proxy** — point your existing SDK at LLM Sentinel, nothing else changes
- **Pre-LLM guardrails** — PII detection, prompt injection scanning, policy enforcement, token cost estimation
- **Post-LLM evaluation** — hallucination scoring, toxicity filtering, faithfulness scoring, output PII scrubbing
- **Async trace pipeline** — full span logging via SQS, gateway overhead measured at p50 ~29ms / p95 ~46ms under load (see [`gateway/loadtest/RESULTS.md`](gateway/loadtest/RESULTS.md))
- **Policy engine** — per-tenant, per-model, per-user rules with block/alert actions
- **EU AI Act Article 12 compliant** audit logs — tamper-evident, timestamped, exportable as PDF/JSON
- **Real-time dashboard** — WebSocket-pushed metrics, cost tracking, alert timeline
- **Multi-tenant** — full tenant isolation with RBAC and JWT auth
- **Provider fallback + circuit breaker** — a failing provider is retried against the next one in its fallback chain; three consecutive failures trip a per-provider circuit breaker (OPEN → cooldown → HALF_OPEN trial → CLOSED), so a degraded upstream can't add latency to every request. See [`gateway/src/proxy/circuit-breaker.service.ts`](gateway/src/proxy/circuit-breaker.service.ts) and set `FORCE_PROVIDER_FAILURE` to demo it without touching a real upstream.

## Architecture

```
gateway/          # NestJS proxy — hot path, see loadtest/RESULTS.md for measured overhead
eval-service/      # Async SQS consumers — hallucination, toxicity, faithfulness scoring
api/               # REST + WebSocket API for dashboard and admin
dashboard/         # React + Vite frontend — live trace feed, alerts, stats

libs/
├── guardrails/       # PII detector, prompt injection scanner, policy condition DSL
├── evaluators/       # Hallucination, toxicity, faithfulness scorers (Gemini-as-Judge)
├── tracing/          # Trace entity, hash-chain writer, cross-service event notifier
└── audit/            # EU AI Act compliant report generator (PDF + JSON)

infra/
└── pulumi/           # AWS SQS, S3, RDS, ECS — Infrastructure as Code (not yet implemented)
```

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Gateway / API | NestJS (TypeScript) | |
| Async Workers | NestJS SQS-shaped consumers | Three interchangeable queue backends: local filesystem (`USE_LOCAL_QUEUE=true`, default — needs gateway/eval-service on one machine), Postgres-backed (`QUEUE_BACKEND=postgres` — works across separate machines, used on Render), or real AWS SQS. See [`libs/queue`](libs/queue/src). |
| LLM Evaluation | Google Gemini 2.5 Flash (as-Judge) | See `libs/evaluators/eval-harness/RESULTS.md` for judge-vs-human validation |
| PII Detection | Regex-based pattern matching | See [ADR 0003](docs/adr/0003-guardrail-limitations.md) for known bypasses — this is not Presidio/NER-based |
| Database | PostgreSQL | |
| Cache / Rate Limiting | Redis | |
| Blob Storage | — | Raw prompt/response blobs aren't persisted to S3 in the current implementation; only hashes are stored on the trace |
| Containerization | Docker (all 4 services) | |
| IaC | — | `infra/pulumi/` is a placeholder, not implemented |
| Report Generation | PDF + JSON | |

## Getting Started

### Prerequisites
- Node.js 22+
- Docker Desktop (or any Docker + Compose v2 setup)
- A [Gemini API key](https://aistudio.google.com/apikey) — free tier is enough for local use, needed for the guardrail eval pipeline and the judge-validation harness

**No AWS account needed.** The queue between the gateway and eval-service defaults to a local filesystem queue (`USE_LOCAL_QUEUE=true`) — real SQS is only used if you explicitly configure `AWS_SQS_TRACE_QUEUE_URL`. S3/Pulumi in the tech stack table below describe where this project could go in a real deployment, not what the default local setup uses.

### 1. Clone and configure

```bash
git clone https://github.com/srishtiagarwall/llm-sentinel.git
cd llm-sentinel

# Each of these 4 apps needs its own .env — copy the examples and fill in
# GEMINI_API_KEY and JWT_SECRET (JWT_SECRET must be identical across all of
# gateway/api/eval-service — they validate the same tokens).
cp gateway/.env.example gateway/.env
cp api/.env.example api/.env
cp eval-service/.env.example eval-service/.env
cp dashboard/.env.example dashboard/.env
```

### 2. Start Postgres + Redis

```bash
docker compose up -d postgres redis
```

Postgres listens on **5433** (not 5432) on the host — chosen to avoid colliding with a native Postgres install some machines already have on 5432. The `.env.example` files already point at 5433; if you're pointing at your own Postgres instead, adjust `DATABASE_URL` accordingly.

### 3. Install, build, migrate, seed

```bash
npm install                              # installs every workspace at once (root-level)
npm run build:libs                       # gateway/api/eval-service import these as workspace packages
npm run migration:run -w api             # creates the traces/policies/users/queue_messages tables
npm run seed -w api                      # optional but recommended — seeds ~60 demo traces + 3 policies for tenant "demo"
```

The first `migration:run` or `seed` call can take 20–30s before printing anything — that's `ts-node` compiling on a cold cache, not a hang.

### 4. Run the four services

Each needs its own terminal (or use a process manager of your choice):

```bash
npm run start:dev -w gateway       # :3000 — the OpenAI-compatible proxy
npm run start:dev -w api           # :3001 — REST + WebSocket API for the dashboard
npm run start:dev -w eval-service  # no HTTP port — consumes the local queue, runs Gemini-as-judge scoring
npm run dev -w dashboard           # :5173 — the React dashboard
```

### 5. Log in

Open **http://localhost:5173** and register a tenant (`POST /api/auth/register` on `api`, or use the dashboard's "Register" link) — this creates the tenant's first user and logs you in immediately. If you ran the seed script, you'll see it under tenant `demo`; register your own tenant name to see an empty dashboard instead, or create a user directly against `demo`:

```bash
curl -s -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"YourPassword1!","tenantId":"demo"}'
```

### Alternative: Docker Compose, all four services

Once your four `.env` files are in place, you can skip steps 3–4 and build/run everything as containers instead:

```bash
docker compose up -d --build
```

This builds all four Dockerfiles from the repo root (required — see the comment at the top of each `Dockerfile`, since this is an npm-workspaces monorepo and each service needs the root lockfile and `libs/*` to build). You'll still need to run migrations/seed against the containerized Postgres the first time (`npm run migration:run -w api`, `npm run seed -w api`, from the host, pointing at `localhost:5433`).

### Demo: fallback + circuit breaker without a real outage

Set `FORCE_PROVIDER_FAILURE=openai` (or `openai,gemini`) in `gateway/.env` and restart the gateway to simulate a provider outage without touching a real upstream — requests will fail over to the next provider in the chain, and after 3 consecutive failures that provider's circuit breaker trips OPEN. See [`gateway/src/proxy/circuit-breaker.service.ts`](gateway/src/proxy/circuit-breaker.service.ts). Unset it and restart to go back to normal.

## Deploying to Render

[`render.yaml`](render.yaml) is a Blueprint that deploys the full stack (Postgres, Redis, `api`, `gateway`, `eval-service`, `dashboard`) from one file. A few steps need doing by hand — Render's Blueprint spec can't auto-wire everything across services:

1. **Fork or push this repo to your own GitHub**, then in the Render dashboard: **New → Blueprint**, point it at your repo. Render reads `render.yaml` and proposes all 6 resources (1 database, 5 services).
2. **Deploy it.** `llm-sentinel-api`'s `JWT_SECRET` is auto-generated by the blueprint (`generateValue: true`) — everything else needed to boot is wired automatically (`DATABASE_URL`, `REDIS_URL`, `API_SERVICE_URL` between services).
3. **Copy `llm-sentinel-api`'s generated `JWT_SECRET`** (Render dashboard → that service → Environment) and paste it as the manual value for the same key on both `llm-sentinel-gateway` and `llm-sentinel-eval-service`. All three must match exactly — they validate/sign the same tokens.
4. **Set `GEMINI_API_KEY`** (a free key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) on both `llm-sentinel-gateway` and `llm-sentinel-eval-service`.
5. **Fix `VITE_API_URL`** on `llm-sentinel-dashboard`: once `llm-sentinel-api` has deployed, copy its real public URL from the Render dashboard (top of its service page) and set it as `VITE_API_URL`'s value, replacing the placeholder in `render.yaml`. This is baked into the dashboard's JS bundle at build time, so after changing it you need to trigger a manual redeploy of `llm-sentinel-dashboard` for the new value to take effect.
6. **Run migrations + seed once**, from your own machine, pointing at the deployed Postgres (get its external connection string from the Render dashboard):
   ```bash
   DATABASE_URL="<external connection string from Render>" npm run migration:run -w api
   DATABASE_URL="<same>" npm run seed -w api
   ```
7. Open `llm-sentinel-dashboard`'s URL and register a tenant, or log in against the seeded `demo` tenant (see [Log in](#5-log-in) above for the register-a-user curl, pointed at the deployed `api` URL instead of localhost).

**Free-tier caveats:** free Postgres expires after 30 days unless upgraded to a paid plan (back up or upgrade before then). Free web services and the worker spin down after 15 minutes of inactivity and take ~30-60s to wake on the next request — the first load after idle time will be slow, not broken.

## Reliability & Engineering Notes

Rather than claim these properties, they're measured, tested, or explicitly
documented as gaps:

- **Gateway overhead is measured, not assumed.** `gateway/loadtest/RESULTS.md` has
  real k6 numbers (p50 ~29ms / p95 ~46ms under 20 concurrent VUs) and an honest
  comparison against the original sub-10ms design target.
- **The Gemini-as-judge evaluators are validated against hand-labeled examples**, not
  trusted blindly. `libs/evaluators/eval-harness/` runs the real evaluators against a
  13-case labeled dataset and reports judge-vs-human agreement (currently 85%) — see
  `RESULTS.md` there and [ADR 0002](docs/adr/0002-llm-judge-validation.md) for what
  that number does and doesn't prove.
- **The PII/injection guardrails' bypass techniques are documented, not hidden.**
  `libs/guardrails/src/adversarial.spec.ts` is a checked-in, passing test file
  asserting the *actual* bypassed behavior against known adversarial techniques
  (spacing tricks, synonym substitution, base64 encoding). See
  [ADR 0003](docs/adr/0003-guardrail-limitations.md) for what a layered defense would
  add.
- **The horizontal-scaling gap is documented, not silently assumed away.** Rate
  limiting and circuit breaker state are currently per-instance (in-memory), which is
  correct for this project's single-instance deployment but wouldn't be for N
  replicas — see [ADR 0001](docs/adr/0001-single-instance-rate-limiting-and-circuit-breaker.md)
  for exactly what breaks and what the Redis-backed fix would look like.
- **CI** (`.github/workflows/ci.yml`) runs the full test suite and builds all four
  Docker images on every push/PR; the judge-validation harness runs as a separate,
  informational (non-blocking) job since it costs real API tokens.

## Compliance

LLM Sentinel's audit log schema is designed to satisfy **EU AI Act Article 12** requirements:
- Automatic logging of all events relevant to identifying risks
- Tamper-evident append-only logs with hash chaining
- Minimum 6-month retention support
- Exportable structured evidence for regulators

## License

MIT
