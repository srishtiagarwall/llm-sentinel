import 'dotenv/config';
import * as crypto from 'crypto';
import dataSource from '../data-source';
import { Trace, writeTraceWithChainHash } from '@llm-sentinel/tracing';
import { Policy } from '../policies/policy.entity';

const TENANT_ID = process.env.SEED_TENANT_ID ?? 'demo';

const MODELS: { model: string; provider: string }[] = [
  { model: 'gpt-4o', provider: 'openai' },
  { model: 'gpt-4o-mini', provider: 'openai' },
  { model: 'gemini-2.5-flash', provider: 'gemini' },
  { model: 'gemini-2.5-pro', provider: 'gemini' },
  { model: 'claude-sonnet-5', provider: 'claude' },
];

function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

// Spreads N traces across `hoursBack` hours, oldest first, so the dashboard's
// hourly hallucination trend and the audit report's date-range filters both
// have something realistic to show rather than a single instant.
function timestampFor(index: number, total: number, hoursBack: number): Date {
  const spanMs = hoursBack * 60 * 60 * 1000;
  const jitterMs = randomBetween(-5, 5) * 60 * 1000;
  const offsetMs = (index / total) * spanMs + jitterMs;
  return new Date(Date.now() - spanMs + offsetMs);
}

interface SeedTraceSpec {
  blocked?: boolean;
  piiDetectedInput?: boolean;
  piiTypes?: string[];
  injectionDetected?: boolean;
  policyViolations?: string[];
  blockReason?: string;
  hallucinationScore?: number;
  toxicityScore?: number;
  faithfulnessScore?: number;
  costUsd?: number;
}

// A mix weighted toward "clean" traffic with a deliberate handful of flagged
// cases, so every guardrail badge and every ALERT_RULES threshold in
// alerts.service.ts gets exercised at least once by the seeded data.
function buildTraceSpecs(count: number): SeedTraceSpec[] {
  const specs: SeedTraceSpec[] = [];

  for (let i = 0; i < count; i++) {
    const roll = Math.random();

    if (roll < 0.6) {
      // Clean traffic, scored well
      specs.push({
        hallucinationScore: randomBetween(0.75, 0.98),
        toxicityScore: randomBetween(0.85, 0.99),
        faithfulnessScore: randomBetween(0.8, 0.98),
        costUsd: randomBetween(0.0002, 0.02),
      });
    } else if (roll < 0.72) {
      // PII caught pre-LLM, alerted but not blocked
      specs.push({
        piiDetectedInput: true,
        piiTypes: pick([['EMAIL'], ['PHONE'], ['EMAIL', 'SSN'], ['CREDIT_CARD']]),
        policyViolations: ['PII detected in prompt'],
        hallucinationScore: randomBetween(0.7, 0.95),
        toxicityScore: randomBetween(0.85, 0.99),
        faithfulnessScore: randomBetween(0.75, 0.95),
        costUsd: randomBetween(0.0002, 0.015),
      });
    } else if (roll < 0.8) {
      // Blocked outright — prompt injection caught pre-LLM
      specs.push({
        blocked: true,
        injectionDetected: true,
        policyViolations: ['Prompt injection detected'],
        blockReason: 'Prompt injection detected',
        costUsd: 0,
      });
    } else if (roll < 0.88) {
      // Hallucination below threshold — triggers HIGH_HALLUCINATION alert
      specs.push({
        hallucinationScore: randomBetween(0.1, 0.38),
        toxicityScore: randomBetween(0.8, 0.98),
        faithfulnessScore: randomBetween(0.15, 0.38),
        costUsd: randomBetween(0.001, 0.03),
      });
    } else if (roll < 0.94) {
      // High-cost single request — triggers HIGH_COST alert
      specs.push({
        hallucinationScore: randomBetween(0.7, 0.95),
        toxicityScore: randomBetween(0.85, 0.99),
        faithfulnessScore: randomBetween(0.75, 0.95),
        costUsd: randomBetween(0.11, 0.45),
      });
    } else {
      // Toxic output — triggers TOXIC_OUTPUT alert
      specs.push({
        hallucinationScore: randomBetween(0.6, 0.9),
        toxicityScore: randomBetween(0.05, 0.28),
        faithfulnessScore: randomBetween(0.6, 0.9),
        costUsd: randomBetween(0.001, 0.02),
      });
    }
  }

  return specs;
}

async function seedTraces(traceRepo: Awaited<ReturnType<typeof dataSource.getRepository<Trace>>>) {
  const TRACE_COUNT = 60;
  const HOURS_BACK = 36;
  const specs = buildTraceSpecs(TRACE_COUNT);

  console.log(`Seeding ${TRACE_COUNT} traces for tenant "${TENANT_ID}" across the last ${HOURS_BACK}h...`);

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const { model, provider } = pick(MODELS);
    const createdAt = timestampFor(i, TRACE_COUNT, HOURS_BACK);
    const promptText = `[seed] sample prompt #${i} for ${model}`;
    const responseText = spec.blocked ? '' : `[seed] sample response #${i}`;
    const inputTokens = Math.floor(randomBetween(20, 400));
    const outputTokens = spec.blocked ? 0 : Math.floor(randomBetween(10, 600));

    // writeTraceWithChainHash reads the tenant's most recent chainHash to
    // link the next one, so this must run sequentially — not Promise.all'd.
    const trace = await writeTraceWithChainHash(traceRepo, {
      tenantId: TENANT_ID,
      userId: undefined,
      sessionId: undefined,
      model,
      provider,
      promptHash: hash(promptText),
      responseHash: spec.blocked ? undefined : hash(responseText),
      inputTokens,
      outputTokens,
      costUsd: spec.costUsd ?? 0,
      latencyMs: Math.floor(randomBetween(180, 3200)),
      ttftMs: Math.floor(randomBetween(80, 900)),
      piiDetectedInput: spec.piiDetectedInput ?? false,
      piiTypes: spec.piiTypes,
      injectionDetected: spec.injectionDetected ?? false,
      hallucinationScore: spec.hallucinationScore,
      toxicityScore: spec.toxicityScore,
      faithfulnessScore: spec.faithfulnessScore,
      policyViolations: spec.policyViolations,
      blocked: spec.blocked ?? false,
      blockReason: spec.blockReason,
    });

    // writeTraceWithChainHash uses CreateDateColumn's default (now()) on
    // insert — backdate it afterward so seeded traces span the window above
    // instead of clustering at "now".
    await traceRepo.update(trace.id, { createdAt });
  }

  console.log(`Seeded ${TRACE_COUNT} traces.`);
}

async function seedPolicies(policyRepo: Awaited<ReturnType<typeof dataSource.getRepository<Policy>>>) {
  const existing = await policyRepo.count({ where: { tenantId: TENANT_ID } });
  if (existing > 0) {
    console.log(`Tenant "${TENANT_ID}" already has ${existing} polic${existing === 1 ? 'y' : 'ies'} — skipping policy seed.`);
    return;
  }

  const policies: Partial<Policy>[] = [
    {
      tenantId: TENANT_ID,
      name: 'Block PII to external providers',
      condition: "pii_detected == true AND provider != 'internal'",
      action: 'BLOCK',
      alert: true,
      enabled: true,
    },
    {
      tenantId: TENANT_ID,
      name: 'Alert on prompt injection',
      condition: 'injection_detected == true',
      action: 'ALERT',
      alert: true,
      enabled: true,
    },
    {
      tenantId: TENANT_ID,
      name: 'Flag high-cost gpt-4o requests',
      condition: "model == 'gpt-4o'",
      action: 'ALERT',
      alert: true,
      enabled: false,
    },
  ];

  await policyRepo.insert(policies);
  console.log(`Seeded ${policies.length} policies.`);
}

async function main() {
  await dataSource.initialize();

  try {
    const traceRepo = dataSource.getRepository(Trace);
    const policyRepo = dataSource.getRepository(Policy);

    const existingTraces = await traceRepo.count({ where: { tenantId: TENANT_ID } });
    if (existingTraces > 1) {
      console.log(
        `Tenant "${TENANT_ID}" already has ${existingTraces} traces — skipping trace seed to avoid duplicating demo data. ` +
          `Delete existing traces first, or set SEED_TENANT_ID to seed a different tenant.`,
      );
    } else {
      await seedTraces(traceRepo);
    }

    await seedPolicies(policyRepo);

    console.log('Seed complete.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
