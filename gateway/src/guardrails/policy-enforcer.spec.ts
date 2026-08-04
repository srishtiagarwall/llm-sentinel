import { PolicyEnforcer } from './policy-enforcer';
import { CachedPolicy, PolicyCacheService } from './policy-cache.service';

function makePolicy(overrides: Partial<CachedPolicy> = {}): CachedPolicy {
  return {
    id: 'p1',
    name: 'block-pii-external',
    condition: "pii_detected == true AND provider != 'internal'",
    action: 'BLOCK',
    alert: true,
    model: null,
    userId: null,
    ...overrides,
  };
}

function makeCache(policies: CachedPolicy[]): jest.Mocked<PolicyCacheService> {
  return {
    getEnabledPolicies: jest.fn().mockResolvedValue(policies),
  } as unknown as jest.Mocked<PolicyCacheService>;
}

describe('PolicyEnforcer', () => {
  it('blocks the baseline PII-to-external rule regardless of CRUD policies', async () => {
    const enforcer = new PolicyEnforcer(makeCache([]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: true, types: ['EMAIL'], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('PII_TO_EXTERNAL_PROVIDER:EMAIL');
  });

  it('applies a matching CRUD policy as a BLOCK violation', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy()]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: true, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).toContain('POLICY:block-pii-external');
    expect(result.alerts).toContain('POLICY:block-pii-external');
  });

  it('does not apply a policy scoped to a different model', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy({ model: 'claude-sonnet-4-6' })]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: false, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).not.toContain('POLICY:block-pii-external');
  });

  it('records ALERT-action policies as alerts without blocking', async () => {
    const enforcer = new PolicyEnforcer(
      makeCache([makePolicy({ action: 'ALERT', condition: "provider == 'openai'" })]),
    );
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: false, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.allowed).toBe(true);
    expect(result.alerts).toContain('POLICY:block-pii-external');
  });
});
