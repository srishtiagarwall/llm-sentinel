# Gateway Overhead — Load Test Results

Run: `k6 run -e TOKEN=<jwt> gateway/loadtest/gateway-overhead.js` (see script header for the full setup).
Method: `FORCE_PROVIDER_FAILURE=openai,gemini` so every request runs the full guardrail
pipeline (PII scan, injection scan, policy enforcement, token estimation), attempts
both providers in the fallback chain, fails fast on each with no real network call, and
writes a blocked/failed trace — isolating the gateway's own overhead from LLM provider
latency, which this repo doesn't control.

## Latest run (2026-08-08)

20 concurrent VUs, 30s steady load, local machine (gateway + Postgres + Redis all on
the same host — no network hop between them).

| Metric | Value |
|---|---|
| Total requests | 19,301 |
| Throughput | 643 req/s |
| Success rate (expected 502) | 100% |
| avg | 30.91ms |
| p50 (median) | 28.72ms |
| p90 | 40.64ms |
| p95 | 45.94ms |
| max | 174.13ms |

## Honest comparison to the README's claim

The architecture doc and README both describe a "sub-10ms gateway overhead" target.
This run's p50 is ~29ms, roughly 3x that target. That target described the *proxy hot
path only* (auth check, guard checks, forward) before this project's guardrail
pipeline, hash-chain trace write, and fallback/circuit-breaker logic existed as real
code — it was an architectural aspiration, not a measurement, and this is now the
actual measured number superseding it.

What's actually contributing to the ~29ms median (not yet broken down further —
worth profiling as a follow-up):
- PII + injection regex scans (`libs/guardrails`) — should be sub-millisecond
- Policy enforcement, including a per-tenant policy cache lookup (`policy-cache.service.ts`)
- Synchronous trace write with hash-chain computation, which does a DB round-trip to
  fetch the tenant's last `chainHash` before computing and inserting the new row
  (`writeTraceWithChainHash` in `libs/tracing`) — this is the most likely single
  largest contributor, since it's the only step doing a database round-trip on
  every request
- Two upstream attempt overheads in this specific test (both providers in the
  fallback chain get tried) — a normal successful single-provider call skips the
  second attempt

The trace-write DB round-trip is the natural next thing to measure in isolation (e.g.
by comparing this same test with trace writing stubbed out) if someone wants to push
p50 back down toward single-digit milliseconds.

## What this does and doesn't measure

- Does measure: gateway-added latency (guardrails + policy + trace write + fallback
  routing), independent of LLM response time.
- Does not measure: end-to-end user-perceived latency for a real chat completion —
  that number is dominated by whichever LLM provider is called and isn't something
  the gateway controls.
- Single-instance, single-machine — no network latency between gateway and
  Postgres/Redis, which a real deployment would have. Numbers would be worse across a
  real network hop to a managed Postgres instance.
