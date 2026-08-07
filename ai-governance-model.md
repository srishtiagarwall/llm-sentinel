# AI Governance & Model Audit Platform — Architecture

## What It Is
A transparent proxy that sits between any application and any LLM, enforcing policies, logging everything, and generating compliance-grade audit reports. Think "Datadog but for your LLM calls."

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPS                              │
│           (your app, curl, SDK — anything calling an LLM)       │
└───────────────────────────┬─────────────────────────────────────┘
                            │  HTTP (drop-in OpenAI-compatible API)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI GATEWAY (NestJS Proxy)                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Auth/RBAC   │  │ Rate Limiter │  │  Request Enrichment  │  │
│  │  (JWT+API    │  │  (Redis)     │  │  (tenant, model,     │  │
│  │   keys)      │  │              │  │   user tagging)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              PRE-LLM GUARDRAIL PIPELINE                  │   │
│  │  [PII Detector] → [Prompt Injection Scanner] →           │   │
│  │  [Policy Enforcer] → [Token Cost Estimator]              │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Forward (or block)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│              UPSTREAM LLM  (Gemini / OpenAI / Claude)           │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Response
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   AI GATEWAY (response path)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │             POST-LLM EVALUATION PIPELINE                 │   │
│  │  [Hallucination Scorer] → [Toxicity Filter] →            │   │
│  │  [Output PII Scrubber] → [Faithfulness Scorer]           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    TRACE EMITTER                         │   │
│  │   Async emit full span → SQS → Trace Ingestion Service   │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │  Response returned to client
                            ▼
                       CLIENT APP

┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND SERVICES (NestJS)                      │
│                                                                 │
│  ┌──────────────────┐   ┌────────────────┐   ┌──────────────┐  │
│  │  Trace Ingestion │   │  Eval Service  │   │  Audit Report│  │
│  │  Service         │   │  (Gemini-as-   │   │  Generator   │  │
│  │  (SQS consumer)  │   │   Judge)       │   │  (PDF/JSON)  │  │
│  └──────────────────┘   └────────────────┘   └──────────────┘  │
│                                                                 │
│  ┌──────────────────┐   ┌────────────────┐   ┌──────────────┐  │
│  │  Alert Engine    │   │  Policy CRUD   │   │  Dashboard   │  │
│  │  (threshold      │   │  Service       │   │  API (REST   │  │
│  │   rules+webhooks)│   │                │   │  + WS)       │  │
│  └──────────────────┘   └────────────────┘   └──────────────┘  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
               ┌─────────────────┼─────────────────┐
               ▼                 ▼                  ▼
        PostgreSQL             Redis              AWS S3
     (traces, evals,      (rate limits,       (raw request/
      policies, users)     cache, sessions)   response blobs)
```

---

## Core Components — Detailed

### 1. AI Gateway (The Heart)
A **drop-in OpenAI-compatible proxy** in NestJS. Any app that calls `/v1/chat/completions` hits your gateway instead — zero code change on the client side.

```
Request Flow:
client → Gateway → [pre-guards] → LLM → [post-guards] → async trace emit → client
```

Key design decisions:
- **Streaming support** via SSE passthrough — don't buffer the whole response, pipe it while scoring async
- **Sub-10ms overhead** on the hot path — all heavy eval runs async via SQS after response is returned
- **Multi-provider** — route to Gemini, OpenAI, Claude based on policy rules (cost, capability, data residency)

---

### 2. Pre-LLM Guardrail Pipeline

| Guard | What it does | How |
|---|---|---|
| PII Detector | Finds names, emails, phone, SSN, card numbers in prompt | Regex + presidio-style NER |
| Prompt Injection Scanner | Detects jailbreak patterns, role override attempts | Pattern matching + lightweight classifier |
| Policy Enforcer | Blocks requests violating org policies (e.g., "no PII to external models") | Rule engine against request metadata |
| Token Estimator | Estimates cost before forwarding | tiktoken-equivalent counting |

---

### 3. Post-LLM Evaluation Pipeline (Async — runs after response returned)

| Evaluator | Metric | Method |
|---|---|---|
| Hallucination Scorer | 0–1 faithfulness score | Gemini-as-Judge: compare response against retrieved context |
| Toxicity Filter | Safety classification | Gemini safety API |
| Output PII Scrubber | PII present in response | Same NER as pre-guard |
| Latency + Cost Tracker | Tokens in/out, time-to-first-token | Measured at proxy layer |
| Answer Relevance | Is response on-topic? | Embedding similarity between query and response |

All scores attach to the **trace span** in PostgreSQL.

---

### 4. Trace Schema (PostgreSQL)

```sql
traces
  id, tenant_id, user_id, session_id
  model, provider
  prompt_hash, response_hash          -- hash for dedup, raw in S3
  input_tokens, output_tokens, cost_usd
  latency_ms, ttft_ms
  pii_detected_input (bool), pii_types[]
  injection_detected (bool)
  hallucination_score (float)
  toxicity_score (float)
  faithfulness_score (float)
  policy_violations[]
  created_at
  -- EU AI Act Article 12: tamper-evident via append-only + hash chain
```

---

### 5. Policy Engine

Org admins define rules like:
```json
{
  "rule": "block_pii_to_external",
  "condition": "pii_detected == true AND provider != 'internal'",
  "action": "BLOCK",
  "alert": true
}
```

Stored in PostgreSQL, evaluated at runtime in the gateway. Supports per-tenant, per-model, per-user policies.

---

### 6. Audit Report Generator

On-demand or scheduled generation of:
- **EU AI Act Article 12** compliant audit logs (tamper-evident, timestamped, exportable)
- **Cost & usage reports** per tenant/user/model
- **Risk summary**: PII exposure rate, hallucination trend, policy violation frequency
- **Model comparison**: quality scores across providers side-by-side

Output: PDF (WeasyPrint) + JSON API for downstream BI tools.

---

### 7. Real-Time Dashboard

WebSocket-pushed metrics:
- Live request feed with scores
- Alert timeline (policy violations, anomaly spikes)
- Cost burn rate per tenant
- Hallucination trend graph over time

---

## Folder Structure

```
ai-governance-platform/
├── apps/
│   ├── gateway/          # NestJS proxy (hot path)
│   ├── eval-service/     # Async evaluation workers (SQS consumers)
│   ├── api/              # REST API for dashboard + admin
│   └── dashboard/        # React frontend (optional)
├── libs/
│   ├── guardrails/       # PII, injection, policy engine
│   ├── evaluators/       # Hallucination, toxicity, relevance scorers
│   ├── tracing/          # Span building, S3 upload, DB write
│   └── audit/            # Report generation
├── infra/
│   └── pulumi/           # AWS SQS, S3, RDS, ECS — IaC
└── docker-compose.yml
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Gateway / API | NestJS (TypeScript) |
| Async Workers | NestJS SQS consumers |
| LLM Evaluation | Gemini 2.5 Flash (as-Judge) |
| PII Detection | Microsoft Presidio / custom NER |
| Queue | AWS SQS |
| Database | PostgreSQL (append-only traces) |
| Cache / Rate Limiting | Redis |
| Blob Storage | AWS S3 (raw prompts/responses) |
| IaC | Pulumi |
| Containerization | Docker |
| Report Generation | WeasyPrint (PDF) |

---

## Why This Is Resume-Worthy

1. **Infrastructure, not an app** — shows senior engineering thinking, not just LLM wrapping
2. **EU AI Act Article 12 compliant** — deadline August 2026, companies legally need this now
3. **Multi-tenant from day one** — directly maps to your GrowthZ architecture experience
4. **Async eval pipeline** — shows you understand not to block the hot path (sub-10ms gateway overhead)
5. **Gemini-as-Judge** — LLM evaluating LLM outputs is a cutting-edge eval pattern
6. **Open source candidate** — every company deploying AI needs this; GitHub stars will follow

---

## Build Order (4–6 Weeks)

| Week | Milestone |
|---|---|
| Week 1 | Gateway proxy + basic request/response logging |
| Week 2 | Pre-LLM guards (PII detection, prompt injection scanner) |
| Week 3 | Async eval pipeline (SQS + hallucination/toxicity scoring) |
| Week 4 | Policy engine + alert system (threshold rules + webhooks) |
| Week 5 | Audit report generation (EU AI Act Article 12 compliant PDF/JSON) |
| Week 6 | Dashboard + open source polish (README, docs, demo video) |

---

## References

- [Best AI Governance Platforms for LLM Applications 2026 - Braintrust](https://www.braintrust.dev/articles/best-ai-governance-platforms-llm-applications-2026)
- [What Is LLM Observability? A 2026 Architecture Guide - FutureAGI](https://futureagi.com/blog/what-is-llm-observability-2026/)
- [EU AI Act Article 12: What AI Teams Need to Log Before August 2026](https://aisecuritygateway.ai/blog/eu-ai-act-article-12-compliance-logging)
- [Top LLM Observability Tools in 2026 - MLflow](https://mlflow.org/articles/top-llm-observability-tools-in-2026-a-pro-guide/)
- [Top AI Governance Platforms for Agentic AI in 2026 - Arthur](https://www.arthur.ai/column/best-ai-governance-platforms-2026)
