import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { tracesApi, type TraceDetail, type TraceListParams, ApiError } from '../lib/api';
import { Spinner, ErrorBanner, EmptyState } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';

const PAGE_SIZE = 25;

function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(4)}` : '—';
}

function score(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(3) : '—';
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function TracesPage() {
  const { traceId } = useParams<{ traceId?: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<TraceDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TraceDetail | null>(null);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);

  const [modelFilter, setModelFilter] = useState('');
  const [blockedFilter, setBlockedFilter] = useState<'all' | 'true' | 'false'>('all');
  const [fromFilter, setFromFilter] = useState('');
  const [toFilter, setToFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params: TraceListParams = {
      page,
      limit: PAGE_SIZE,
      model: modelFilter || undefined,
      blocked: blockedFilter === 'all' ? undefined : blockedFilter === 'true',
      from: fromFilter ? new Date(fromFilter).toISOString() : undefined,
      to: toFilter ? new Date(toFilter).toISOString() : undefined,
    };
    tracesApi
      .list(params)
      .then((res) => {
        setItems(res.data);
        setTotal(res.total);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load traces'))
      .finally(() => setLoading(false));
  }, [page, modelFilter, blockedFilter, fromFilter, toFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!traceId) {
      setDeepLinkError(null);
      return;
    }
    setDeepLinkError(null);
    tracesApi
      .get(traceId)
      .then(setSelected)
      .catch((err) => setDeepLinkError(err instanceof ApiError ? err.message : 'Trace not found'));
  }, [traceId]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load();
  }

  function resetFilters() {
    setModelFilter('');
    setBlockedFilter('all');
    setFromFilter('');
    setToFilter('');
    setPage(1);
  }

  return (
    <div className="page">
      <PageHeader title="Traces" subtitle="Every request that passed through the gateway, with guardrail and scoring detail." />

      <form className="filter-bar" onSubmit={applyFilters}>
        <label className="filter-field">
          <span>Model</span>
          <input
            placeholder="e.g. gpt-4o"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
          />
        </label>
        <label className="filter-field">
          <span>Status</span>
          <select value={blockedFilter} onChange={(e) => setBlockedFilter(e.target.value as 'all' | 'true' | 'false')}>
            <option value="all">All</option>
            <option value="true">Blocked</option>
            <option value="false">Allowed</option>
          </select>
        </label>
        <label className="filter-field">
          <span>From</span>
          <input type="datetime-local" value={fromFilter} onChange={(e) => setFromFilter(e.target.value)} />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input type="datetime-local" value={toFilter} onChange={(e) => setToFilter(e.target.value)} />
        </label>
        <div className="filter-bar__actions">
          <button type="submit">Apply</button>
          <button type="button" className="btn-ghost" onClick={resetFilters}>
            Clear
          </button>
        </div>
      </form>

      {error && <ErrorBanner message={error} onRetry={load} />}

      <div className="panel panel--flush">
        {loading ? (
          <Spinner label="Loading traces…" />
        ) : items.length === 0 ? (
          <EmptyState title="No traces found" hint="Try widening your filters, or send a request through the gateway." />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Model</th>
                  <th>Provider</th>
                  <th>Flags</th>
                  <th className="num">Hallucination</th>
                  <th className="num">Toxicity</th>
                  <th className="num">Faithfulness</th>
                  <th className="num">Latency</th>
                  <th className="num">Cost</th>
                </tr>
              </thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="data-table__row" onClick={() => setSelected(t)} tabIndex={0}>
                    <td className="mono">{fmtTime(t.createdAt)}</td>
                    <td>{t.model}</td>
                    <td>{t.provider}</td>
                    <td>
                      {t.blocked && <span className="badge badge--blocked">BLOCKED</span>}
                      {t.piiDetectedInput && <span className="badge badge--warning">PII</span>}
                      {t.injectionDetected && <span className="badge badge--warning">INJECTION</span>}
                      {!t.blocked && !t.piiDetectedInput && !t.injectionDetected && (
                        <span className="badge badge--ok">CLEAN</span>
                      )}
                    </td>
                    <td className="num mono">{score(t.hallucinationScore)}</td>
                    <td className="num mono">{score(t.toxicityScore)}</td>
                    <td className="num mono">{score(t.faithfulnessScore)}</td>
                    <td className="num mono">{t.latencyMs != null ? `${Number(t.latencyMs)}ms` : '—'}</td>
                    <td className="num mono">{money(t.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && items.length > 0 && (
          <div className="pagination">
            <span className="pagination__summary">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="pagination__controls">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {deepLinkError && <ErrorBanner message={`Could not open linked trace: ${deepLinkError}`} />}

      {selected && (
        <TraceDetailModal
          trace={selected}
          onClose={() => {
            setSelected(null);
            if (traceId) navigate('/traces', { replace: true });
          }}
        />
      )}
    </div>
  );
}

function TraceDetailModal({ trace, onClose }: { trace: TraceDetail; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Trace detail</h2>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="modal__body">
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item__label">ID</span>
              <span className="detail-item__value mono" title={trace.id}>
                {trace.id}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Created</span>
              <span className="detail-item__value">{fmtTime(trace.createdAt)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Model / provider</span>
              <span className="detail-item__value">
                {trace.model} · {trace.provider}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">User</span>
              <span className="detail-item__value mono">{trace.userId ?? '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Session</span>
              <span className="detail-item__value mono">{trace.sessionId ?? '—'}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Tokens (in / out)</span>
              <span className="detail-item__value mono">
                {trace.inputTokens} / {trace.outputTokens}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Cost</span>
              <span className="detail-item__value mono">{money(trace.costUsd)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Latency / TTFT</span>
              <span className="detail-item__value mono">
                {trace.latencyMs}ms / {trace.ttftMs}ms
              </span>
            </div>
          </div>

          <h3 className="modal__section-title">Guardrails</h3>
          <div className="badge-row">
            {trace.blocked && <span className="badge badge--blocked">BLOCKED{trace.blockReason ? `: ${trace.blockReason}` : ''}</span>}
            {trace.piiDetectedInput && (
              <span className="badge badge--warning">PII: {(trace.piiTypes ?? []).join(', ') || 'detected'}</span>
            )}
            {trace.injectionDetected && <span className="badge badge--warning">PROMPT INJECTION</span>}
            {!trace.blocked && !trace.piiDetectedInput && !trace.injectionDetected && (
              <span className="badge badge--ok">No guardrail flags</span>
            )}
          </div>
          {trace.policyViolations && trace.policyViolations.length > 0 && (
            <div className="badge-row">
              {trace.policyViolations.map((v) => (
                <span key={v} className="badge badge--alert">
                  {v}
                </span>
              ))}
            </div>
          )}

          <h3 className="modal__section-title">Evaluation scores</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item__label">Hallucination</span>
              <span className="detail-item__value mono">{score(trace.hallucinationScore)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Toxicity</span>
              <span className="detail-item__value mono">{score(trace.toxicityScore)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Faithfulness</span>
              <span className="detail-item__value mono">{score(trace.faithfulnessScore)}</span>
            </div>
          </div>

          <h3 className="modal__section-title">Integrity</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <span className="detail-item__label">Prompt hash</span>
              <span className="detail-item__value mono" title={trace.promptHash}>
                {trace.promptHash}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Response hash</span>
              <span className="detail-item__value mono" title={trace.responseHash ?? ''}>
                {trace.responseHash ?? '—'}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-item__label">Chain hash</span>
              <span className="detail-item__value mono" title={trace.chainHash ?? ''}>
                {trace.chainHash ?? '—'}
              </span>
            </div>
          </div>

          <p className="modal__note">
            Raw prompt/response text is not persisted server-side (only content hashes) — this view shows every field the
            API exposes for this trace.
          </p>
        </div>
      </div>
    </div>
  );
}
