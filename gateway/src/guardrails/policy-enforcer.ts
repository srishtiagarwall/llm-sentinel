import { PiiScanResult } from './pii-detector';
import { InjectionScanResult } from './injection-scanner';

export interface PolicyContext {
  tenantId: string;
  provider: string;
  pii: PiiScanResult;
  injection: InjectionScanResult;
}

export interface PolicyResult {
  allowed: boolean;
  violations: string[];
}

export function enforcePolicy(ctx: PolicyContext): PolicyResult {
  const violations: string[] = [];

  // Block PII being sent to external providers
  if (ctx.pii.detected && ctx.provider !== 'internal') {
    violations.push(`PII_TO_EXTERNAL_PROVIDER:${ctx.pii.types.join(',')}`);
  }

  // Always block prompt injection attempts
  if (ctx.injection.detected) {
    violations.push(`PROMPT_INJECTION:${ctx.injection.pattern}`);
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}
