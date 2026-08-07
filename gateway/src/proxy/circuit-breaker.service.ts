import { Injectable, Logger, Optional, Inject } from '@nestjs/common';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface BreakerRecord {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
}

export interface CircuitBreakerConfig {
  failureThreshold: number; // consecutive failures before tripping to OPEN
  cooldownMs: number; // time OPEN before allowing a HALF_OPEN trial
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  cooldownMs: 30_000,
};

// DI token for overriding CircuitBreakerConfig via a module provider (tests
// only — the gateway app itself never registers this token, so production
// always gets DEFAULT_CONFIG). Plain constructor args aren't valid Nest
// providers on their own; @Optional()+@Inject() lets the constructor keep a
// simple `new CircuitBreakerService({...})` call for unit tests while still
// being resolvable by Nest's DI container at app boot.
export const CIRCUIT_BREAKER_CONFIG = 'CIRCUIT_BREAKER_CONFIG';

// Per-provider circuit breaker guarding the gateway from hammering a degraded
// upstream. CLOSED = calls pass through normally. Three consecutive failures
// trip it OPEN, during which calls are rejected immediately (no network call)
// so a dead provider can't add latency to every request. After `cooldownMs`
// the breaker allows exactly one HALF_OPEN trial call through; success closes
// it, failure re-opens it and restarts the cooldown.
//
// State is in-memory and per-gateway-instance — see docs/adr/0001-single-instance-rate-limiting.md
// for the same gap applied to rate limiting; a multi-instance deployment would
// need this state moved to Redis so all instances agree on provider health.
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, BreakerRecord>();
  private readonly config: CircuitBreakerConfig;

  constructor(@Optional() @Inject(CIRCUIT_BREAKER_CONFIG) config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private getOrCreate(provider: string): BreakerRecord {
    let record = this.breakers.get(provider);
    if (!record) {
      record = { state: 'CLOSED', consecutiveFailures: 0, openedAt: null };
      this.breakers.set(provider, record);
    }
    return record;
  }

  // Whether a call to `provider` should be attempted right now. Also performs
  // the OPEN -> HALF_OPEN transition when the cooldown has elapsed.
  canAttempt(provider: string): boolean {
    const record = this.getOrCreate(provider);

    if (record.state === 'OPEN') {
      const elapsed = Date.now() - (record.openedAt ?? 0);
      if (elapsed >= this.config.cooldownMs) {
        record.state = 'HALF_OPEN';
        this.logger.warn(`Circuit for "${provider}" entering HALF_OPEN after ${elapsed}ms cooldown`);
        return true;
      }
      return false;
    }

    return true;
  }

  recordSuccess(provider: string): void {
    const record = this.getOrCreate(provider);
    if (record.state !== 'CLOSED') {
      this.logger.log(`Circuit for "${provider}" closing after successful trial`);
    }
    record.state = 'CLOSED';
    record.consecutiveFailures = 0;
    record.openedAt = null;
  }

  recordFailure(provider: string): void {
    const record = this.getOrCreate(provider);
    record.consecutiveFailures += 1;

    if (record.state === 'HALF_OPEN') {
      record.state = 'OPEN';
      record.openedAt = Date.now();
      this.logger.warn(`Circuit for "${provider}" re-opening — HALF_OPEN trial failed`);
      return;
    }

    if (record.consecutiveFailures >= this.config.failureThreshold) {
      record.state = 'OPEN';
      record.openedAt = Date.now();
      this.logger.warn(
        `Circuit for "${provider}" tripped OPEN after ${record.consecutiveFailures} consecutive failures`,
      );
    }
  }

  getState(provider: string): CircuitState {
    return this.getOrCreate(provider).state;
  }

  // Test/ops hook — not called in the request path.
  reset(provider: string): void {
    this.breakers.set(provider, { state: 'CLOSED', consecutiveFailures: 0, openedAt: null });
  }
}
