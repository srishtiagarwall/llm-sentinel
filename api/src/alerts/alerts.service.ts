import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace } from '../trace/trace.entity';

export interface AlertRule {
  name: string;
  check: (trace: Trace) => boolean;
  message: (trace: Trace) => string;
}

export interface Alert {
  traceId: string;
  tenantId: string;
  rule: string;
  message: string;
  createdAt: Date;
}

// Threshold-based alert rules — extend this list to add new alert types
const ALERT_RULES: AlertRule[] = [
  {
    name: 'HIGH_HALLUCINATION',
    check: (t) => t.hallucinationScore !== null && t.hallucinationScore < 0.4,
    message: (t) => `Hallucination score ${t.hallucinationScore} below threshold for trace ${t.id}`,
  },
  {
    name: 'TOXIC_OUTPUT',
    check: (t) => t.toxicityScore !== null && t.toxicityScore < 0.3,
    message: (t) => `Toxicity score ${t.toxicityScore} below threshold for trace ${t.id}`,
  },
  {
    name: 'LOW_FAITHFULNESS',
    check: (t) => t.faithfulnessScore !== null && t.faithfulnessScore < 0.4,
    message: (t) => `Faithfulness score ${t.faithfulnessScore} below threshold for trace ${t.id}`,
  },
  {
    name: 'PII_DETECTED',
    check: (t) => t.piiDetectedInput === true,
    message: (t) => `PII detected in prompt (types: ${t.piiTypes?.join(', ')}) for trace ${t.id}`,
  },
  {
    name: 'PROMPT_INJECTION',
    check: (t) => t.injectionDetected === true,
    message: (t) => `Prompt injection attempt detected for trace ${t.id}`,
  },
  {
    name: 'HIGH_COST',
    check: (t) => Number(t.costUsd) > 0.10,
    message: (t) => `Single request cost $${t.costUsd} exceeded threshold for trace ${t.id}`,
  },
];

@Injectable()
export class AlertsService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  evaluateTrace(trace: Trace): Alert[] {
    return ALERT_RULES
      .filter((rule) => rule.check(trace))
      .map((rule) => ({
        traceId: trace.id,
        tenantId: trace.tenantId,
        rule: rule.name,
        message: rule.message(trace),
        createdAt: new Date(),
      }));
  }

  async getRecentAlerts(tenantId: string, hours = 24): Promise<Alert[]> {
    const from = new Date(Date.now() - hours * 60 * 60 * 1000);

    const traces = await this.repo
      .createQueryBuilder('t')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.created_at >= :from', { from })
      .getMany();

    return traces.flatMap((trace) => this.evaluateTrace(trace));
  }
}
