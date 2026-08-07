import { estimateTokens, estimateCost } from './token-estimator';

describe('estimateTokens', () => {
  it('returns 0 for an empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('rounds up to the nearest token for non-multiples of 4 characters', () => {
    expect(estimateTokens('abc')).toBe(1); // 3/4 -> ceil -> 1
    expect(estimateTokens('abcde')).toBe(2); // 5/4 -> ceil -> 2
  });

  it('divides exactly for multiples of 4 characters', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('scales for long strings', () => {
    const text = 'x'.repeat(4000);
    expect(estimateTokens(text)).toBe(1000);
  });
});

describe('estimateCost', () => {
  it('computes cost for a known model using its per-1M-token pricing', () => {
    // gpt-4o: input 2.50, output 10.00 per 1M tokens
    const cost = estimateCost('gpt-4o', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(2.5 + 10.0, 6);
  });

  it('computes cost proportionally for smaller token counts', () => {
    const cost = estimateCost('gpt-4o-mini', 1000, 500);
    // input 0.15 / 1M, output 0.60 / 1M
    expect(cost).toBeCloseTo((1000 * 0.15 + 500 * 0.6) / 1_000_000, 10);
  });

  it('returns 0 for zero tokens', () => {
    expect(estimateCost('gemini-2.5-flash', 0, 0)).toBe(0);
  });

  it('falls back to default pricing for an unknown model', () => {
    const cost = estimateCost('some-unlisted-model', 1_000_000, 1_000_000);
    expect(cost).toBeCloseTo(1.0 + 3.0, 6);
  });

  it('prices each known model distinctly', () => {
    const inputTokens = 1_000_000;
    const outputTokens = 0;
    expect(estimateCost('gemini-2.5-flash', inputTokens, outputTokens)).toBeCloseTo(0.075, 6);
    expect(estimateCost('gpt-4o', inputTokens, outputTokens)).toBeCloseTo(2.5, 6);
    expect(estimateCost('gpt-4o-mini', inputTokens, outputTokens)).toBeCloseTo(0.15, 6);
    expect(estimateCost('claude-sonnet-4-6', inputTokens, outputTokens)).toBeCloseTo(3.0, 6);
  });
});
