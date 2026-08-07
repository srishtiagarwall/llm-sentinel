import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { generateAuditReport } from './report-generator';

function chainHashFor(prevHash: string, promptHash: string, responseHash: string, createdAt: Date): string {
  const input = `${prevHash}:${promptHash}:${responseHash}:${createdAt.toISOString()}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    id: 'trace-1',
    tenantId: 't1',
    userId: null as unknown as string,
    sessionId: null as unknown as string,
    model: 'gpt-4o',
    provider: 'openai',
    promptHash: 'p',
    responseHash: 'r',
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
    latencyMs: 100,
    ttftMs: 50,
    piiDetectedInput: false,
    piiTypes: null as unknown as string[],
    injectionDetected: false,
    hallucinationScore: null as unknown as number,
    toxicityScore: null as unknown as number,
    faithfulnessScore: null as unknown as number,
    policyViolations: null as unknown as string[],
    blocked: false,
    blockReason: null as unknown as string,
    chainHash: 'x',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRepo(traces: Trace[]): jest.Mocked<Repository<Trace>> {
  return {
    find: jest.fn().mockResolvedValue(traces),
  } as unknown as jest.Mocked<Repository<Trace>>;
}

const FROM = new Date('2026-07-01T00:00:00.000Z');
const TO = new Date('2026-08-01T00:00:00.000Z');

describe('generateAuditReport', () => {
  it('handles an empty trace set without dividing by zero', async () => {
    const repo = makeRepo([]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    expect(report.summary.totalRequests).toBe(0);
    expect(report.summary.avgLatencyMs).toBe(0);
    expect(report.summary.avgHallucinationScore).toBe(0);
    expect(report.summary.avgToxicityScore).toBe(0);
    expect(report.summary.avgFaithfulnessScore).toBe(0);
    expect(report.hashChainIntegrity).toEqual({ verified: true, totalTraces: 0, brokenAt: null });
    expect(report.traces).toEqual([]);
    expect(report.policyViolations).toEqual([]);
  });

  it('includes traces exactly at the from/to boundaries (inclusive range)', async () => {
    const repo = makeRepo([
      makeTrace({ id: 'at-from', createdAt: FROM }),
      makeTrace({ id: 'at-to', createdAt: TO }),
      makeTrace({ id: 'before', createdAt: new Date(FROM.getTime() - 1) }),
      makeTrace({ id: 'after', createdAt: new Date(TO.getTime() + 1) }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    const ids = report.traces.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['at-from', 'at-to']));
    expect(ids).not.toContain('before');
    expect(ids).not.toContain('after');
    expect(report.summary.totalRequests).toBe(2);
  });

  it('excludes traces with a null hallucinationScore from the score averages', async () => {
    const inRangeCreatedAt = new Date('2026-07-15T00:00:00.000Z');
    const repo = makeRepo([
      makeTrace({ id: 'scored', createdAt: inRangeCreatedAt, hallucinationScore: 0.8, toxicityScore: 0.9, faithfulnessScore: 0.7 }),
      makeTrace({ id: 'unscored', createdAt: inRangeCreatedAt, hallucinationScore: null as unknown as number }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    expect(report.summary.avgHallucinationScore).toBeCloseTo(0.8, 3);
    expect(report.summary.avgToxicityScore).toBeCloseTo(0.9, 3);
    expect(report.summary.avgFaithfulnessScore).toBeCloseTo(0.7, 3);
  });

  it('tallies policyViolations across traces, defaulting missing arrays to empty', async () => {
    const createdAt = new Date('2026-07-15T00:00:00.000Z');
    const repo = makeRepo([
      makeTrace({ id: 't1', createdAt, policyViolations: ['PII_TO_EXTERNAL_PROVIDER:EMAIL'] }),
      makeTrace({ id: 't2', createdAt, policyViolations: ['PII_TO_EXTERNAL_PROVIDER:EMAIL', 'POLICY:x'] }),
      makeTrace({ id: 't3', createdAt, policyViolations: null as unknown as string[] }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    expect(report.policyViolations).toEqual(
      expect.arrayContaining([
        { violation: 'PII_TO_EXTERNAL_PROVIDER:EMAIL', count: 2 },
        { violation: 'POLICY:x', count: 1 },
      ]),
    );
  });

  it('computes hashChainIntegrity over the full tenant history, not just the report window', async () => {
    const outOfRangeCreatedAt = new Date('2026-01-01T00:00:00.000Z');
    const inRangeCreatedAt = new Date('2026-07-15T00:00:00.000Z');
    const hash1 = chainHashFor('0', 'p1', 'r1', outOfRangeCreatedAt);
    const hash2 = chainHashFor(hash1, 'p2', 'r2', inRangeCreatedAt);

    const repo = makeRepo([
      makeTrace({ id: 'old', createdAt: outOfRangeCreatedAt, promptHash: 'p1', responseHash: 'r1', chainHash: hash1 }),
      makeTrace({ id: 'recent', createdAt: inRangeCreatedAt, promptHash: 'p2', responseHash: 'r2', chainHash: hash2 }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    // report window only includes 'recent', but the chain check spans both traces
    expect(report.summary.totalRequests).toBe(1);
    expect(report.hashChainIntegrity).toEqual({ verified: true, totalTraces: 2, brokenAt: null });
  });

  it('flags a tampered trace anywhere in the tenant history as an integrity failure', async () => {
    const createdAt1 = new Date('2026-07-15T00:00:00.000Z');
    const createdAt2 = new Date('2026-07-16T00:00:00.000Z');
    const repo = makeRepo([
      makeTrace({ id: 't1', createdAt: createdAt1, promptHash: 'p1', responseHash: 'r1', chainHash: 'tampered' }),
      makeTrace({ id: 't2', createdAt: createdAt2, promptHash: 'p2', responseHash: 'r2', chainHash: 'also-tampered' }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    expect(report.hashChainIntegrity.verified).toBe(false);
    expect(report.hashChainIntegrity.brokenAt).toBe('t1');
  });

  it('rounds cost, latency, and score fields to their documented precisions', async () => {
    const createdAt = new Date('2026-07-15T00:00:00.000Z');
    const repo = makeRepo([
      makeTrace({ id: 't1', createdAt, costUsd: 0.0012345, latencyMs: 123, hallucinationScore: 0.12345 }),
    ]);
    const report = await generateAuditReport(repo, 't1', FROM, TO);

    expect(report.summary.totalCostUsd).toBe(0.001235); // 6 decimal places
    expect(report.summary.avgLatencyMs).toBe(123); // integer
    expect(report.summary.avgHallucinationScore).toBe(0.123); // 3 decimal places
  });
});
