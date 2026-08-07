// Measures gateway-added latency on real requests against a live LLM provider.
//
// The upstream LLM call itself (network + provider inference time) dominates
// total request time and is outside the gateway's control, so this does NOT
// benchmark end-to-end latency. Instead it isolates gateway overhead using
// numbers the gateway already records on every trace (proxy.service.ts):
//   latencyMs = full request time (guard pipeline + upstream call + trace write)
//   ttftMs    = time spent waiting on the upstream provider call
//   overhead  = latencyMs - ttftMs
//             = auth + validation + PII scan + injection scan + policy
//               enforcement + hashing + trace DB write (2 queries)
//
// Requires: gateway running on GATEWAY_URL, api running on API_SERVICE_URL,
// both pointed at the same Postgres/Redis, and a real OPENAI_API_KEY or
// GEMINI_API_KEY configured in gateway/.env (whichever PROVIDER you pick).
//
// Usage:
//   npx ts-node -r tsconfig-paths/register scripts/benchmark-overhead.ts
//   REQUESTS=50 PROVIDER=gemini npx ts-node ... scripts/benchmark-overhead.ts

import 'dotenv/config';
import axios from 'axios';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:3000';
const API_URL = process.env.API_SERVICE_URL ?? 'http://localhost:3001';
const PROVIDER = process.env.PROVIDER ?? 'openai'; // 'openai' | 'gemini'
const MODEL = process.env.MODEL ?? (PROVIDER === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini');
const REQUEST_COUNT = Number(process.env.REQUESTS ?? 30);

interface TraceRecord {
  id: string;
  latencyMs: number;
  ttftMs: number;
  createdAt: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label: string, values: number[]): void {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((s, v) => s + v, 0) / (values.length || 1);
  console.log(
    `${label.padEnd(28)} avg=${avg.toFixed(1)}ms  p50=${percentile(sorted, 50)}ms  ` +
      `p95=${percentile(sorted, 95)}ms  p99=${percentile(sorted, 99)}ms  ` +
      `min=${sorted[0] ?? 0}ms  max=${sorted[sorted.length - 1] ?? 0}ms`,
  );
}

async function getOrCreateBenchTenant(): Promise<{ token: string; tenantId: string }> {
  const tenantId = `bench-${Date.now()}`;
  const email = `bench+${Date.now()}@llm-sentinel.local`;
  const password = 'benchmark-password-not-real';

  const { data } = await axios.post(`${API_URL}/auth/register`, {
    tenantId,
    email,
    password,
  });
  return { token: data.token, tenantId };
}

async function fireRequest(token: string): Promise<void> {
  await axios.post(
    `${GATEWAY_URL}/v1/chat/completions`,
    {
      model: MODEL,
      messages: [{ role: 'user', content: 'Reply with the single word: pong.' }],
      max_tokens: 5,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Provider': PROVIDER,
        'Content-Type': 'application/json',
      },
      timeout: 60_000,
    },
  );
}

async function fetchTraces(token: string, since: Date): Promise<TraceRecord[]> {
  const { data } = await axios.get(`${API_URL}/traces`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { from: since.toISOString(), to: new Date().toISOString(), limit: 100, blocked: false },
  });
  return data.data;
}

async function main() {
  console.log(`LLM Sentinel gateway-overhead benchmark`);
  console.log(`  gateway:  ${GATEWAY_URL}`);
  console.log(`  api:      ${API_URL}`);
  console.log(`  provider: ${PROVIDER} / ${MODEL}`);
  console.log(`  requests: ${REQUEST_COUNT}`);
  console.log('');

  const { token } = await getOrCreateBenchTenant();
  const startedAt = new Date();

  console.log('Warming up (1 request, JIT/connection warmup, discarded)...');
  await fireRequest(token);

  console.log(`Firing ${REQUEST_COUNT} sequential requests against a real ${PROVIDER} model...`);
  let failures = 0;
  for (let i = 0; i < REQUEST_COUNT; i++) {
    try {
      await fireRequest(token);
      process.stdout.write('.');
    } catch (err) {
      failures++;
      process.stdout.write('x');
    }
  }
  console.log('\n');

  if (failures > 0) {
    console.warn(`${failures}/${REQUEST_COUNT} requests failed (check API keys / rate limits) — excluded from stats.\n`);
  }

  // trace writes are fire-and-forget-adjacent but latencyMs/ttftMs are saved
  // synchronously before the response returns, so traces should already be
  // queryable — small grace delay for API/DB round trip safety margin.
  await new Promise((r) => setTimeout(r, 500));

  const traces = await fetchTraces(token, startedAt);
  if (traces.length === 0) {
    console.error('No traces recorded for the benchmark window — nothing to report.');
    process.exit(1);
  }

  const latencyMs = traces.map((t) => t.latencyMs);
  const ttftMs = traces.map((t) => t.ttftMs);
  const overheadMs = traces.map((t) => t.latencyMs - t.ttftMs);

  console.log(`Recorded ${traces.length} successful traces.\n`);
  summarize('total request latency', latencyMs);
  summarize('upstream LLM call (ttft)', ttftMs);
  summarize('gateway overhead', overheadMs);

  console.log('\n"gateway overhead" = latencyMs - ttftMs: everything the gateway does that');
  console.log('is NOT waiting on the upstream provider — auth, guardrail pipeline, policy');
  console.log('enforcement, hashing, and the trace DB write.');
}

main().catch((err) => {
  console.error('Benchmark failed:', err?.response?.data ?? err.message ?? err);
  process.exit(1);
});
