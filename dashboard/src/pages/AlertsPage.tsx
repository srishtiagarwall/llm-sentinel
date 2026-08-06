import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi, type AlertItem, ApiError } from '../lib/api';
import { Spinner, ErrorBanner, EmptyState } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';

const RANGE_OPTIONS = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
];

const RULE_LABELS: Record<string, string> = {
  HIGH_HALLUCINATION: 'High hallucination',
  TOXIC_OUTPUT: 'Toxic output',
  LOW_FAITHFULNESS: 'Low faithfulness',
  PII_DETECTED: 'PII detected',
  PROMPT_INJECTION: 'Prompt injection',
  HIGH_COST: 'High cost',
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function ruleTone(rule: string): 'blocked' | 'warning' | 'alert' {
  if (rule === 'PROMPT_INJECTION' || rule === 'PII_DETECTED') return 'blocked';
  if (rule.startsWith('POLICY:')) return 'alert';
  return 'warning';
}

export function AlertsPage() {
  const [hours, setHours] = useState(24);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    dashboardApi
      .getAlerts(hours)
      .then(setAlerts)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load alerts'))
      .finally(() => setLoading(false));
  }, [hours]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <PageHeader title="Alerts" subtitle="Threshold breaches and policy triggers raised by the alert engine." />

      <div className="filter-bar">
        <div className="segmented">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.hours}
              type="button"
              className={`segmented__item ${hours === opt.hours ? 'segmented__item--active' : ''}`}
              onClick={() => setHours(opt.hours)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="filter-bar__count">{alerts.length} alert{alerts.length === 1 ? '' : 's'}</span>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="panel panel--flush">
        {loading ? (
          <Spinner label="Loading alerts…" />
        ) : alerts.length === 0 ? (
          <EmptyState title="No alerts in this window" hint="Widen the time range, or check back after more traffic flows through." />
        ) : (
          <div className="alert-feed">
            {alerts.map((a, i) => {
              const tone = ruleTone(a.rule);
              return (
                <div key={`${a.traceId}-${a.rule}-${i}`} className={`alert-card alert-card--${tone}`}>
                  <div className="alert-card__top">
                    <span className={`badge badge--${tone === 'blocked' ? 'blocked' : tone === 'alert' ? 'alert' : 'warning'}`}>
                      {RULE_LABELS[a.rule] ?? a.rule}
                    </span>
                    <span className="alert-card__time mono">{fmtTime(a.createdAt)}</span>
                  </div>
                  <p className="alert-card__message">{a.message}</p>
                  <button
                    type="button"
                    className="btn-ghost alert-card__link"
                    onClick={() => navigate(`/traces/${a.traceId}`)}
                  >
                    View trace {a.traceId.slice(0, 8)}…
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
