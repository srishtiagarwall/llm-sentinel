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

  it('blocks the baseline prompt-injection rule', async () => {
    const enforcer = new PolicyEnforcer(makeCache([]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: false, types: [], redacted: '' },
      injection: { detected: true, pattern: 'role_override' },
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('PROMPT_INJECTION:role_override');
  });

  it('does not fire the baseline PII violation when the provider is internal', async () => {
    const enforcer = new PolicyEnforcer(makeCache([]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'internal',
      model: 'gpt-4o',
      pii: { detected: true, types: ['EMAIL'], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('does not apply a policy scoped to a different userId', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy({ userId: 'user-1' })]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      userId: 'user-2',
      pii: { detected: true, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).not.toContain('POLICY:block-pii-external');
  });

  it('applies a policy scoped to a userId when it matches', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy({ userId: 'user-1' })]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      userId: 'user-1',
      pii: { detected: true, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).toContain('POLICY:block-pii-external');
  });

  it('records a violation without an alert for a BLOCK policy with alert=false', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy({ alert: false })]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: true, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).toContain('POLICY:block-pii-external');
    expect(result.alerts).not.toContain('POLICY:block-pii-external');
  });

  it('accumulates violations from both the baseline guard and a CRUD policy in the same call', async () => {
    const enforcer = new PolicyEnforcer(makeCache([makePolicy({ name: 'extra-block' })]));
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      pii: { detected: true, types: ['EMAIL'], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).toEqual(
      expect.arrayContaining(['PII_TO_EXTERNAL_PROVIDER:EMAIL', 'POLICY:extra-block']),
    );
    expect(result.allowed).toBe(false);
  });

  it('evaluates multiple policies independently — one BLOCK and one ALERT-only', async () => {
    const enforcer = new PolicyEnforcer(
      makeCache([
        makePolicy({ name: 'blocker', condition: "provider == 'openai'", alert: false }),
        makePolicy({ name: 'alerter', action: 'ALERT', condition: "provider == 'openai'", alert: true }),
      ]),
    );
    const result = await enforcer.enforce({
      tenantId: 't1',
      provider: 'openai',
      model: 'gpt-4o',
      // no PII/injection here — isolating the CRUD-policy interaction from the baseline guards
      pii: { detected: false, types: [], redacted: '' },
      injection: { detected: false, pattern: null },
    });
    expect(result.violations).toEqual(['POLICY:blocker']);
    expect(result.alerts).toEqual(['POLICY:alerter']);
    expect(result.allowed).toBe(false);
  });
});
