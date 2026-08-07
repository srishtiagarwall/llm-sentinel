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

| Layer | Technology |
|---|---|
| Gateway / API | NestJS (TypeScript) |
| Async Workers | NestJS + AWS SQS consumers |
| LLM Evaluation | Google Gemini 2.5 Flash (as-Judge) |
| PII Detection | Microsoft Presidio |
| Queue | AWS SQS |
| Database | PostgreSQL |
| Cache / Rate Limiting | Redis |
| Blob Storage | AWS S3 |
| IaC | Pulumi |
| Containerization | Docker |
| Report Generation | PDF + JSON |

## Getting Started

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- AWS account (for SQS + S3)

### Run Locally

This is an npm workspace monorepo — install once at the root, then run each service.

```bash
# Clone the repo
git clone https://github.com/srishtiagarwall/llm-sentinel.git
cd llm-sentinel

# Start infrastructure (PostgreSQL, Redis)
docker-compose up -d postgres redis

# Install all workspace dependencies
npm install

# Build shared libs (gateway/api/eval-service depend on these)
npm run build:libs

# Apply database migrations
cd api && npm run migration:run && cd ..

# Start each service in its own terminal
cd gateway && npm run start:dev        # :3000
cd api && npm run start:dev            # :3001
cd eval-service && npm run start:dev
cd dashboard && npm run dev            # :5173 — the React frontend
```

Open the dashboard, register a tenant, and log in — `POST /auth/register` on `api` creates the tenant's first user.

### Environment Variables

Copy `.env.example` to `.env` in each app directory (`gateway`, `api`, `eval-service`, `dashboard`) and fill in your values. `JWT_SECRET` must match across `gateway`, `api`, and `eval-service` — they validate/sign the same tokens for cross-service calls.

```env
# gateway/.env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/llm_sentinel
REDIS_URL=redis://localhost:6379
AWS_SQS_TRACE_QUEUE_URL=
AWS_REGION=ap-south-1
GEMINI_API_KEY=
JWT_SECRET=
API_SERVICE_URL=http://localhost:3001
```

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
