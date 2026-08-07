# ADR 0001: Rate limiting and circuit breaker state is per-instance, not shared

## Status
Accepted (documented gap, not yet fixed)

## Context
The gateway has two pieces of in-memory state on the request hot path:

- **Rate limiting** — `ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])`
  (`gateway/src/app.module.ts`) uses `@nestjs/throttler`'s default in-memory
  storage: a `Map` keyed by client, held in that Node process's heap.
- **Circuit breaker** — `CircuitBreakerService` (`gateway/src/proxy/circuit-breaker.service.ts`)
  tracks each upstream provider's consecutive-failure count and OPEN/CLOSED/HALF_OPEN
  state in a `Map`, also held in that process's heap.

Both work correctly for a single gateway instance. Neither works correctly across
multiple instances behind a load balancer.

## The problem this causes at scale

If the gateway is horizontally scaled to N instances:

- **Rate limiting becomes N times more permissive than configured.** A client
  hitting a round-robin load balancer gets `limit` requests against each instance
  independently, i.e. effectively `limit * N` requests per `ttl` window rather than
  `limit`. Policy intent ("100 req/min per tenant") silently becomes "100 req/min per
  tenant per instance."
- **Circuit breaker state diverges per instance.** Instance A might see 3 consecutive
  OpenAI failures and trip its breaker OPEN; instance B, which happened to route
  different requests, still sees OpenAI as CLOSED and keeps sending it traffic. The
  breaker's purpose — stop hammering a degraded provider — only partially works, and
  which instance "knows" a provider is down becomes non-deterministic from the
  outside.

Neither failure mode is a crash or a data-correctness bug — it's a silent
degradation of two reliability guarantees under horizontal scale, the kind of gap
that's easy to miss until multiple instances are actually deployed.

## Why this project doesn't fix it now
This is a single-instance local/demo deployment (see root `README.md` — `docker
compose up` runs exactly one of each service). Building the shared-state version now
would be solving a scaling problem that doesn't exist yet, at the cost of adding
Redis-roundtrip latency to the hot path for every request, for a benefit no current
deployment needs.

## What the fix would look like
Both pieces of state are small counters/flags with short TTLs — the natural home is
Redis, which the gateway already depends on for `PolicyCacheService`
(`gateway/src/guardrails/policy-cache.service.ts`, same pattern: read-through cache,
fail open on Redis errors so a Redis outage degrades to "no rate limiting instead
of / no breaker instead of" rather than taking the gateway down).

- **Rate limiting**: swap `@nestjs/throttler`'s default storage for
  `@nest-lab/throttler-storage-redis` (or equivalent), using `INCR` + `EXPIRE` so the
  counter is atomic and shared across instances.
- **Circuit breaker**: replace the in-memory `Map` in `CircuitBreakerService` with
  Redis-backed reads/writes — `HINCRBY` for the failure counter, a Redis key with TTL
  for the OPEN state and cooldown timer. The public interface
  (`canAttempt`/`recordSuccess`/`recordFailure`/`getState`) wouldn't need to change,
  only the storage backing it — the call sites in `ProxyService.forwardWithFallback`
  are unaffected either way.

## Consequences
- Documented and accepted for the current single-instance deployment.
- A reviewer or interviewer asking "how would this work with 3 replicas?" has a
  concrete, already-designed answer rather than an unaddressed blind spot.
