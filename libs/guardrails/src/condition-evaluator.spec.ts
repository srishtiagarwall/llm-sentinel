import { evaluateCondition, parseCondition } from './condition-evaluator';

describe('evaluateCondition', () => {
  const condition = "pii_detected == true AND provider != 'internal'";

  it('matches when PII detected and provider is external', () => {
    expect(evaluateCondition(condition, { pii_detected: true, provider: 'openai' })).toBe(true);
  });

  it('does not match when provider is internal', () => {
    expect(evaluateCondition(condition, { pii_detected: true, provider: 'internal' })).toBe(false);
  });

  it('does not match when no PII detected', () => {
    expect(evaluateCondition(condition, { pii_detected: false, provider: 'openai' })).toBe(false);
  });

  it('returns false for an empty condition', () => {
    expect(evaluateCondition('', { pii_detected: true })).toBe(false);
  });

  it('returns false for a condition string with no parseable clauses', () => {
    expect(evaluateCondition('this is not a valid condition', { pii_detected: true })).toBe(false);
  });

  it('evaluates numeric literal clauses', () => {
    expect(evaluateCondition('latency_ms == 500', { latency_ms: 500 })).toBe(true);
    expect(evaluateCondition('latency_ms == 500', { latency_ms: 501 })).toBe(false);
    expect(evaluateCondition('score != 0.5', { score: 0.75 })).toBe(true);
    expect(evaluateCondition('score != 0.5', { score: 0.5 })).toBe(false);
  });

  it('evaluates double-quoted string clauses the same as single-quoted', () => {
    expect(evaluateCondition('provider == "internal"', { provider: 'internal' })).toBe(true);
    expect(evaluateCondition('provider == "internal"', { provider: 'openai' })).toBe(false);
  });

  it('treats a field missing from the context as not matching an == clause', () => {
    expect(evaluateCondition('provider == "openai"', {})).toBe(false);
  });

  it('requires ALL clauses to match — there is no OR support, "OR" in the string is ignored as noise', () => {
    // Written to look like an OR condition; actual semantics are AND across both clauses.
    const orLookingCondition = "pii_detected == true OR injection_detected == true";
    expect(evaluateCondition(orLookingCondition, { pii_detected: true, injection_detected: false })).toBe(false);
    expect(evaluateCondition(orLookingCondition, { pii_detected: true, injection_detected: true })).toBe(true);
  });

  it('supports 3+ ANDed clauses, all of which must match', () => {
    const condition3 = "pii_detected == true AND provider != 'internal' AND model == 'gpt-4o'";
    expect(
      evaluateCondition(condition3, { pii_detected: true, provider: 'openai', model: 'gpt-4o' }),
    ).toBe(true);
    expect(
      evaluateCondition(condition3, { pii_detected: true, provider: 'openai', model: 'gpt-4o-mini' }),
    ).toBe(false);
  });

  it('fails closed on strict type mismatch (string "true" does not equal boolean true)', () => {
    expect(evaluateCondition('pii_detected == true', { pii_detected: 'true' as unknown as boolean })).toBe(false);
  });
});

describe('parseCondition', () => {
  it('parses a single clause into field/op/value', () => {
    expect(parseCondition("provider != 'internal'")).toEqual([
      { field: 'provider', op: '!=', value: 'internal' },
    ]);
  });

  it('parses multiple ANDed clauses in order', () => {
    expect(parseCondition("pii_detected == true AND provider != 'internal'")).toEqual([
      { field: 'pii_detected', op: '==', value: true },
      { field: 'provider', op: '!=', value: 'internal' },
    ]);
  });

  it('parses numeric values as numbers, not strings', () => {
    expect(parseCondition('latency_ms == 500')).toEqual([{ field: 'latency_ms', op: '==', value: 500 }]);
  });

  it('returns an empty array for text with no matching clauses', () => {
    expect(parseCondition('not a condition at all')).toEqual([]);
  });

  it('returns an empty array for an empty string', () => {
    expect(parseCondition('')).toEqual([]);
  });
});
