import { useState } from 'react';
import { policiesApi, type Policy, ApiError } from '../lib/api';
import { POLICY_TEMPLATES } from '../lib/policy-templates';

// Toggling a template on/off maps it to a real policy record for the tenant,
// matched by name. Off means either "not created yet" or "created but
// disabled" — both render as an off toggle; turning it on creates or
// re-enables as appropriate, so it stays a plain reflection of `policies`
// rather than tracked local state that can drift from the backend.
export function PolicyTemplates({
  policies,
  onChanged,
}: {
  policies: Policy[];
  onChanged: (updated: Policy[]) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byName = new Map(policies.map((p) => [p.name, p]));

  async function toggle(templateName: string) {
    const template = POLICY_TEMPLATES.find((t) => t.name === templateName);
    if (!template) return;
    const existing = byName.get(templateName);

    setBusy(templateName);
    setError(null);
    try {
      if (existing) {
        const saved = await policiesApi.update(existing.id, { enabled: !existing.enabled });
        onChanged(policies.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        const saved = await policiesApi.create({
          name: template.name,
          condition: template.condition,
          action: template.action,
          alert: template.alert,
          enabled: true,
        });
        onChanged([saved, ...policies]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update policy template');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel panel--flush policy-templates">
      <div style={{ padding: '14px 16px 0' }}>
        <h2 style={{ border: 'none', padding: 0, margin: 0 }}>Policy templates</h2>
        <p className="form-hint" style={{ margin: '4px 0 12px' }}>
          Common rules, off by default — flip one on to enable it for this tenant as-is, or use{' '}
          <strong>New policy</strong> above to write a fully custom one.
        </p>
      </div>

      {error && <p className="form-error" style={{ padding: '0 16px' }}>{error}</p>}

      <div className="policy-templates__grid">
        {POLICY_TEMPLATES.map((template) => {
          const existing = byName.get(template.name);
          const on = existing?.enabled ?? false;
          return (
            <div key={template.name} className="policy-templates__card">
              <div className="policy-templates__card-header">
                <span className="policy-templates__card-title">{template.name}</span>
                <button
                  type="button"
                  className={`toggle ${on ? 'toggle--on' : ''}`}
                  disabled={busy === template.name}
                  onClick={() => toggle(template.name)}
                  aria-pressed={on}
                  aria-label={on ? `Disable ${template.name}` : `Enable ${template.name}`}
                >
                  <span className="toggle__thumb" />
                </button>
              </div>
              <p className="policy-templates__card-description">{template.description}</p>
              <div className="badge-row">
                <span className={`badge ${template.action === 'BLOCK' ? 'badge--blocked' : 'badge--alert'}`}>
                  {template.action}
                </span>
                <span className="mono policy-templates__condition" title={template.condition}>
                  {template.condition}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
