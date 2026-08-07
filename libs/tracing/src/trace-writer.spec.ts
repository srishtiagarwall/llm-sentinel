import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Trace } from './trace.entity';
import { writeTraceWithChainHash, verifyHashChain } from './trace-writer';

function chainHashFor(prevHash: string, promptHash: string, responseHash: string, createdAt: Date): string {
  const input = `${prevHash}:${promptHash}:${responseHash}:${createdAt.toISOString()}`;
  return crypto.createHash('sha256').update(input).digest('hex');
}

function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    id: 't1',
    tenantId: 'tenant-a',
    userId: null as unknown as string,
    sessionId: null as unknown as string,
    model: 'gpt-4o',
    provider: 'openai',
    promptHash: 'prompt-hash',
    responseHash: 'response-hash',
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
    chainHash: 'irrelevant',
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeRepo(findOneResult: Trace | null): jest.Mocked<Repository<Trace>> {
  return {
    findOne: jest.fn().mockResolvedValue(findOneResult),
    create: jest.fn((dto: Partial<Trace>) => dto as Trace),
    save: jest.fn((trace: Trace) => Promise.resolve(trace)),
  } as unknown as jest.Mocked<Repository<Trace>>;
}

describe('writeTraceWithChainHash', () => {
  it('uses prevHash "0" for the first trace of a tenant', async () => {
    const repo = makeRepo(null);
    const trace = await writeTraceWithChainHash(repo, {
      tenantId: 'tenant-a',
      promptHash: 'p1',
      responseHash: 'r1',
    });

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a' },
      order: { createdAt: 'DESC' },
    });
    expect(trace.chainHash).toBe(chainHashFor('0', 'p1', 'r1', trace.createdAt));
  });

  it('chains off the tenant\'s last chainHash when a prior trace exists', async () => {
    const repo = makeRepo(makeTrace({ chainHash: 'prev-hash-abc' }));
    const trace = await writeTraceWithChainHash(repo, {
      tenantId: 'tenant-a',
      promptHash: 'p2',
      responseHash: 'r2',
    });

    expect(trace.chainHash).toBe(chainHashFor('prev-hash-abc', 'p2', 'r2', trace.createdAt));
  });

  it('defaults responseHash to empty string when the request was blocked', async () => {
    const repo = makeRepo(null);
    const trace = await writeTraceWithChainHash(repo, {
      tenantId: 'tenant-a',
      promptHash: 'p3',
      // no responseHash — blocked-request path
    });

    expect(trace.chainHash).toBe(chainHashFor('0', 'p3', '', trace.createdAt));
  });

  it('sets createdAt itself so the hash is reproducible from persisted columns', async () => {
    const repo = makeRepo(null);
    const trace = await writeTraceWithChainHash(repo, { tenantId: 'tenant-a', promptHash: 'p1' });
    expect(trace.createdAt).toBeInstanceOf(Date);
  });
});

describe('verifyHashChain', () => {
  it('verifies an empty chain vacuously', () => {
    expect(verifyHashChain([])).toEqual({ verified: true, totalTraces: 0, brokenAt: null });
  });

  it('verifies a correctly linked chain of traces', () => {
    const createdAt1 = new Date('2026-08-01T00:00:00.000Z');
    const createdAt2 = new Date('2026-08-01T00:01:00.000Z');
    const hash1 = chainHashFor('0', 'p1', 'r1', createdAt1);
    const hash2 = chainHashFor(hash1, 'p2', 'r2', createdAt2);

    const traces = [
      makeTrace({ id: 't1', promptHash: 'p1', responseHash: 'r1', createdAt: createdAt1, chainHash: hash1 }),
      makeTrace({ id: 't2', promptHash: 'p2', responseHash: 'r2', createdAt: createdAt2, chainHash: hash2 }),
    ];

    expect(verifyHashChain(traces)).toEqual({ verified: true, totalTraces: 2, brokenAt: null });
  });

  it('detects a tampered chainHash even when non-empty', () => {
    const createdAt1 = new Date('2026-08-01T00:00:00.000Z');
    const traces = [
      makeTrace({ id: 't1', promptHash: 'p1', responseHash: 'r1', createdAt: createdAt1, chainHash: 'not-a-real-hash' }),
    ];

    const result = verifyHashChain(traces);
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe('t1');
  });

  it('detects a tampered trace in the middle of the chain and reports its id', () => {
    const createdAt1 = new Date('2026-08-01T00:00:00.000Z');
    const createdAt2 = new Date('2026-08-01T00:01:00.000Z');
    const createdAt3 = new Date('2026-08-01T00:02:00.000Z');
    const hash1 = chainHashFor('0', 'p1', 'r1', createdAt1);
    const hash2 = chainHashFor(hash1, 'p2', 'r2', createdAt2);
    const hash3 = chainHashFor(hash2, 'p3', 'r3', createdAt3);

    const traces = [
      makeTrace({ id: 't1', promptHash: 'p1', responseHash: 'r1', createdAt: createdAt1, chainHash: hash1 }),
      // tampered: promptHash changed after the fact, chainHash left stale
      makeTrace({ id: 't2', promptHash: 'p2-tampered', responseHash: 'r2', createdAt: createdAt2, chainHash: hash2 }),
      makeTrace({ id: 't3', promptHash: 'p3', responseHash: 'r3', createdAt: createdAt3, chainHash: hash3 }),
    ];

    const result = verifyHashChain(traces);
    expect(result.verified).toBe(false);
    expect(result.brokenAt).toBe('t2');
  });

  it('detects reordered traces as a broken chain', () => {
    const createdAt1 = new Date('2026-08-01T00:00:00.000Z');
    const createdAt2 = new Date('2026-08-01T00:01:00.000Z');
    const hash1 = chainHashFor('0', 'p1', 'r1', createdAt1);
    const hash2 = chainHashFor(hash1, 'p2', 'r2', createdAt2);

    // swapped order relative to how they were written
    const traces = [
      makeTrace({ id: 't2', promptHash: 'p2', responseHash: 'r2', createdAt: createdAt2, chainHash: hash2 }),
      makeTrace({ id: 't1', promptHash: 'p1', responseHash: 'r1', createdAt: createdAt1, chainHash: hash1 }),
    ];

    expect(verifyHashChain(traces).verified).toBe(false);
  });
});
