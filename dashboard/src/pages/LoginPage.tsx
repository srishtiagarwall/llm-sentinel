import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { authApi, setToken, ApiError } from '../lib/api';

type Mode = 'login' | 'register';

export function LoginPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [tenantId, setTenantId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const { token } = await authApi.register(tenantId, email, password);
        setToken(token);
        await login(email, password);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand__mark">
          <span className="auth-brand__dot" />
          LLM SENTINEL
        </div>
        <h1 className="auth-brand__title">Every request through your LLM, watched.</h1>
        <p className="auth-brand__lede">
          A transparent proxy in front of OpenAI, Gemini, and Claude — scanning for PII and prompt
          injection before the call, scoring hallucination and toxicity after it, and writing a
          tamper-evident audit trail the whole way through.
        </p>
        <ul className="auth-brand__points">
          <li>
            <span className="auth-brand__point-label">Guardrails</span>
            PII and prompt-injection detection on every request, before it reaches the model.
          </li>
          <li>
            <span className="auth-brand__point-label">Live traces</span>
            Every call logged with guardrail flags, cost, latency, and eval scores in real time.
          </li>
          <li>
            <span className="auth-brand__point-label">Compliance</span>
            Hash-chained audit logs built for EU AI Act Article 12 reporting.
          </li>
        </ul>
      </div>

      <div className="auth-panel">
        <form className="auth-card" onSubmit={handleSubmit}>
          <h1>LLM Sentinel</h1>
          <p className="auth-subtitle">{mode === 'login' ? 'Sign in to your dashboard' : 'Create a new tenant'}</p>

          {mode === 'register' && (
            <label>
              Tenant ID
              <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} required placeholder="acme-corp" />
            </label>
          )}

          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="auth-switch"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
          >
            {mode === 'login' ? "Don't have an account? Register" : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
