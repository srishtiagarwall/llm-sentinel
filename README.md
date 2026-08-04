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
- **Async trace pipeline** — full span logging via SQS with sub-10ms gateway overhead
- **Policy engine** — per-tenant, per-model, per-user rules with block/alert actions
- **EU AI Act Article 12 compliant** audit logs — tamper-evident, timestamped, exportable as PDF/JSON
- **Real-time dashboard** — WebSocket-pushed metrics, cost tracking, alert timeline
- **Multi-tenant** — full tenant isolation with RBAC and JWT auth

## Architecture

```
gateway/          # NestJS proxy — hot path, <10ms overhead
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

# Apply SQL migrations (api/migrations/*.sql) against DATABASE_URL — no
# migration runner is wired up yet, so run these by hand for now.

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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/llm_sentinel
REDIS_URL=redis://localhost:6379
AWS_SQS_TRACE_QUEUE_URL=
AWS_REGION=ap-south-1
GEMINI_API_KEY=
JWT_SECRET=
API_SERVICE_URL=http://localhost:3001
```

## Compliance

LLM Sentinel's audit log schema is designed to satisfy **EU AI Act Article 12** requirements:
- Automatic logging of all events relevant to identifying risks
- Tamper-evident append-only logs with hash chaining
- Minimum 6-month retention support
- Exportable structured evidence for regulators

## License

MIT
