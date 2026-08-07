import { CircuitBreakerService } from './circuit-breaker.service';

describe('CircuitBreakerService', () => {
  it('starts CLOSED and allows attempts', () => {
    const breaker = new CircuitBreakerService();
    expect(breaker.getState('openai')).toBe('CLOSED');
    expect(breaker.canAttempt('openai')).toBe(true);
  });

  it('trips OPEN after reaching the failure threshold', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 3 });
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('CLOSED');

    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('OPEN');
    expect(breaker.canAttempt('openai')).toBe(false);
  });

  it('resets the failure count on success before threshold is reached', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 3 });
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    breaker.recordSuccess('openai');
    breaker.recordFailure('openai');
    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('CLOSED');
  });

  it('moves OPEN -> HALF_OPEN after the cooldown elapses, then CLOSED on success', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 1, cooldownMs: 10 });
    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('OPEN');
    expect(breaker.canAttempt('openai')).toBe(false);

    const openedAt = Date.now();
    while (Date.now() - openedAt < 15) {
      /* busy-wait past the cooldown — deterministic, no fake timers needed for 10ms */
    }

    expect(breaker.canAttempt('openai')).toBe(true);
    expect(breaker.getState('openai')).toBe('HALF_OPEN');

    breaker.recordSuccess('openai');
    expect(breaker.getState('openai')).toBe('CLOSED');
  });

  it('re-opens immediately if the HALF_OPEN trial call fails', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 1, cooldownMs: 10 });
    breaker.recordFailure('openai');

    const openedAt = Date.now();
    while (Date.now() - openedAt < 15) {
      /* wait past cooldown */
    }
    breaker.canAttempt('openai'); // triggers OPEN -> HALF_OPEN transition
    expect(breaker.getState('openai')).toBe('HALF_OPEN');

    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('OPEN');
    expect(breaker.canAttempt('openai')).toBe(false);
  });

  it('tracks providers independently', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 1 });
    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('OPEN');
    expect(breaker.getState('gemini')).toBe('CLOSED');
    expect(breaker.canAttempt('gemini')).toBe(true);
  });

  it('reset() forces a provider back to a clean CLOSED state', () => {
    const breaker = new CircuitBreakerService({ failureThreshold: 1 });
    breaker.recordFailure('openai');
    expect(breaker.getState('openai')).toBe('OPEN');
    breaker.reset('openai');
    expect(breaker.getState('openai')).toBe('CLOSED');
    expect(breaker.canAttempt('openai')).toBe(true);
  });
});
