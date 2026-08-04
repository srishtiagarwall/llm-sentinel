import { evaluateCondition } from './condition-evaluator';

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
});
