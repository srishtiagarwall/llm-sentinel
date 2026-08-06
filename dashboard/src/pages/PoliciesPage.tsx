import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { policiesApi, type Policy, type CreatePolicyInput, ApiError } from '../lib/api';
import { Spinner, ErrorBanner, EmptyState } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';

const CONDITION_EXAMPLE = "pii_detected == true AND provider != 'internal'";
const CONDITION_FIELDS = ['pii_detected', 'injection_detected', 'provider', 'model', 'user_id'];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function validateCondition(condition: string): string | null {
  if (!condition.trim()) return 'Condition is required.';
  const CLAUSE_PATTERN = /(\w+)\s*(==|!=)\s*('[^']*'|"[^"]*"|true|false|-?\d+(?:\.\d+)?)/g;
  const matches = [...condition.matchAll(CLAUSE_PATTERN)];
  if (matches.length === 0) {
    return `No valid clauses found. Use the form: field == value AND field != value (e.g. ${CONDITION_EXAMPLE})`;
  }
  return null;
}

interface FormState {
  name: string;
  condition: string;
  action: 'BLOCK' | 'ALERT';
  alert: boolean;
  enabled: boolean;
  model: string;
  userId: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  condition: '',
  action: 'ALERT',
  alert: true,
  enabled: true,
  model: '',
  userId: '',
};

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Policy | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    policiesApi
      .list()
      .then(setPolicies)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load policies'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleEnabled(policy: Policy) {
    setRowBusy(policy.id);
    const prev = policies;
    setPolicies((ps) => ps.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p)));
    try {
      await policiesApi.update(policy.id, { enabled: !policy.enabled });
    } catch (err) {
      setPolicies(prev);
      setError(err instanceof ApiError ? err.message : 'Failed to update policy');
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDelete(policy: Policy) {
    setRowBusy(policy.id);
    try {
      await policiesApi.remove(policy.id);
      setPolicies((ps) => ps.filter((p) => p.id !== policy.id));
      setPendingDelete(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete policy');
    } finally {
      setRowBusy(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Policies"
        subtitle="Rules the gateway evaluates on every request to block or alert on risky traffic."
        actions={
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
          >
            New policy
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="panel panel--flush">
        {loading ? (
          <Spinner label="Loading policies…" />
        ) : policies.length === 0 ? (
          <EmptyState
            title="No policies yet"
            hint="Create your first policy to start blocking or alerting on risky requests."
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Condition</th>
                  <th>Action</th>
                  <th>Scope</th>
                  <th>Updated</th>
                  <th>Enabled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="mono truncate" title={p.condition} style={{ maxWidth: 280 }}>
                      {p.condition}
                    </td>
                    <td>
                      <span className={`badge ${p.action === 'BLOCK' ? 'badge--blocked' : 'badge--alert'}`}>
                        {p.action}
                      </span>
                    </td>
                    <td className="mono">
                      {p.model || p.userId ? [p.model, p.userId].filter(Boolean).join(' · ') : 'All traffic'}
                    </td>
                    <td className="mono">{fmtTime(p.updatedAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={`toggle ${p.enabled ? 'toggle--on' : ''}`}
                        disabled={rowBusy === p.id}
                        onClick={() => toggleEnabled(p)}
                        aria-pressed={p.enabled}
                        aria-label={p.enabled ? 'Disable policy' : 'Enable policy'}
                      >
                        <span className="toggle__thumb" />
                      </button>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setEditing(p);
                          setShowForm(true);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn-ghost btn-danger" onClick={() => setPendingDelete(p)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <PolicyFormModal
          initial={editing}
          onClose={() => setShowForm(false)}
          onSaved={(saved) => {
            setPolicies((ps) => {
              const exists = ps.some((p) => p.id === saved.id);
              return exists ? ps.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...ps];
            });
            setShowForm(false);
          }}
        />
      )}

      {pendingDelete && (
        <div className="modal-overlay" onClick={() => setPendingDelete(null)}>
          <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Delete policy</h2>
            </div>
            <div className="modal__body">
              <p>
                Delete <strong>{pendingDelete.name}</strong>? This cannot be undone — the gateway will stop enforcing it
                immediately.
              </p>
            </div>
            <div className="modal__footer">
              <button type="button" className="btn-ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger-solid"
                disabled={rowBusy === pendingDelete.id}
                onClick={() => handleDelete(pendingDelete)}
              >
                {rowBusy === pendingDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Policy | null;
  onClose: () => void;
  onSaved: (p: Policy) => void;
}) {
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          condition: initial.condition,
          action: initial.action,
          alert: initial.alert,
          enabled: initial.enabled,
          model: initial.model ?? '',
          userId: initial.userId ?? '',
        }
      : EMPTY_FORM,
  );
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameError = touched && !form.name.trim() ? 'Name is required.' : null;
  const conditionError = touched ? validateCondition(form.condition) : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!form.name.trim() || validateCondition(form.condition)) return;

    setSubmitting(true);
    setSubmitError(null);
    const dto: CreatePolicyInput = {
      name: form.name.trim(),
      condition: form.condition.trim(),
      action: form.action,
      alert: form.alert,
      enabled: form.enabled,
      model: form.model.trim() || undefined,
      userId: form.userId.trim() || undefined,
    };

    try {
      const saved = initial ? await policiesApi.update(initial.id, dto) : await policiesApi.create(dto);
      onSaved(saved);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Failed to save policy');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal__header">
          <h2>{initial ? 'Edit policy' : 'New policy'}</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal__body form-grid">
          <label className="form-field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              onBlur={() => setTouched(true)}
              placeholder="Block PII to external providers"
            />
            {nameError && <span className="form-error">{nameError}</span>}
          </label>

          <label className="form-field">
            <span>Condition</span>
            <textarea
              className="mono"
              rows={3}
              value={form.condition}
              onChange={(e) => setForm((f) => ({ ...f, condition: e.target.value }))}
              onBlur={() => setTouched(true)}
              placeholder={CONDITION_EXAMPLE}
            />
            {conditionError ? (
              <span className="form-error">{conditionError}</span>
            ) : (
              <span className="form-hint">
                Clauses are ANDed together, e.g. <code>{CONDITION_EXAMPLE}</code>. Available fields:{' '}
                {CONDITION_FIELDS.map((f) => (
                  <code key={f}>{f}</code>
                ))}
              </span>
            )}
          </label>

          <div className="form-row">
            <label className="form-field">
              <span>Action</span>
              <select
                value={form.action}
                onChange={(e) => setForm((f) => ({ ...f, action: e.target.value as 'BLOCK' | 'ALERT' }))}
              >
                <option value="ALERT">ALERT — log and notify</option>
                <option value="BLOCK">BLOCK — reject the request</option>
              </select>
            </label>

            <label className="form-field form-field--checkbox">
              <input
                type="checkbox"
                checked={form.alert}
                onChange={(e) => setForm((f) => ({ ...f, alert: e.target.checked }))}
              />
              <span>Also raise an alert</span>
            </label>

            <label className="form-field form-field--checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span>Enabled</span>
            </label>
          </div>

          <div className="form-row">
            <label className="form-field">
              <span>Model (optional scope)</span>
              <input
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="e.g. gpt-4o — leave blank for all models"
              />
            </label>
            <label className="form-field">
              <span>User ID (optional scope)</span>
              <input
                value={form.userId}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                placeholder="Leave blank for all users"
              />
            </label>
          </div>

          {submitError && <ErrorBanner message={submitError} />}
        </div>

        <div className="modal__footer">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create policy'}
          </button>
        </div>
      </form>
    </div>
  );
}
