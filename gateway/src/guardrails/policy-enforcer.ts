import { Injectable } from '@nestjs/common';
import {
  PiiScanResult,
  InjectionScanResult,
  ConditionContext,
  evaluateCondition,
} from '@llm-sentinel/guardrails';
import { PolicyCacheService, CachedPolicy } from './policy-cache.service';

export interface PolicyContext {
  tenantId: string;
  provider: string;
  model: string;
  userId?: string;
  pii: PiiScanResult;
  injection: InjectionScanResult;
}

export interface PolicyResult {
  allowed: boolean;
  violations: string[];
  alerts: string[];
}

@Injectable()
export class PolicyEnforcer {
  constructor(private readonly policyCache: PolicyCacheService) {}

  async enforce(ctx: PolicyContext): Promise<PolicyResult> {
    const violations: string[] = [];
    const alerts: string[] = [];

    // Baseline guards — always on, not configurable via the policy CRUD API.
    if (ctx.pii.detected && ctx.provider !== 'internal') {
      violations.push(`PII_TO_EXTERNAL_PROVIDER:${ctx.pii.types.join(',')}`);
    }
    if (ctx.injection.detected) {
      violations.push(`PROMPT_INJECTION:${ctx.injection.pattern}`);
    }

    // Org-defined policies from the CRUD API, cached per tenant.
    const policies = await this.policyCache.getEnabledPolicies(ctx.tenantId);
    const conditionCtx: ConditionContext = {
      pii_detected: ctx.pii.detected,
      injection_detected: ctx.injection.detected,
      provider: ctx.provider,
      model: ctx.model,
      user_id: ctx.userId ?? null,
    };

    for (const policy of policies) {
      if (!this.appliesToScope(policy, ctx)) continue;
      if (!evaluateCondition(policy.condition, conditionCtx)) continue;

      if (policy.action === 'BLOCK') {
        violations.push(`POLICY:${policy.name}`);
      }
      if (policy.alert) {
        alerts.push(`POLICY:${policy.name}`);
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      alerts,
    };
  }

  private appliesToScope(policy: CachedPolicy, ctx: PolicyContext): boolean {
    if (policy.model && policy.model !== ctx.model) return false;
    if (policy.userId && policy.userId !== ctx.userId) return false;
    return true;
  }
}
