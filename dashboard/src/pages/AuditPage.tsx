import { useState, type FormEvent } from 'react';
import { auditApi, type AuditReport, ApiError } from '../lib/api';
import { Spinner, ErrorBanner, EmptyState } from '../components/Feedback';
import { PageHeader } from '../components/PageHeader';
import { StatTile } from '../components/StatTile';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

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

export function AuditPage() {
  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<AuditReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<'json' | 'pdf' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  function toRangeIso(dateStr: string, endOfDay: boolean): string {
    return new Date(`${dateStr}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`).toISOString();
  }

  function runGenerate() {
    setLoading(true);
    setError(null);
    setDownloadError(null);
    auditApi
      .getReport(toRangeIso(from, false), toRangeIso(to, true))
      .then(setReport)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to generate report'))
      .finally(() => setLoading(false));
  }

  function generate(e: FormEvent) {
    e.preventDefault();
    runGenerate();
  }

  async function download(format: 'json' | 'pdf') {
    if (!report) return;
    setDownloading(format);
    setDownloadError(null);
    try {
      const fromIso = toRangeIso(from, false);
      const toIso = toRangeIso(to, true);
      if (format === 'json') {
        await auditApi.downloadJson(fromIso, toIso, report.meta.tenantId);
      } else {
        await auditApi.downloadPdf(fromIso, toIso, report.meta.tenantId);
      }
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : `Failed to download ${format.toUpperCase()} report`);
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Compliance"
        subtitle="EU AI Act Article 12 audit reports — tamper-evident trace log with hash-chain verification."
      />

      <form className="filter-bar" onSubmit={generate}>
        <label className="filter-field">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to} required />
        </label>
        <label className="filter-field">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from} max={todayIso()} required />
        </label>
        <div className="filter-bar__actions">
          <button type="submit" disabled={loading}>
            {loading ? 'Generating…' : 'Generate report'}
          </button>
        </div>
      </form>

      {error && <ErrorBanner message={error} onRetry={runGenerate} />}

      {loading && (
        <div className="panel">
          <Spinner label="Generating audit report…" />
        </div>
      )}

      {!loading && !report && !error && (
        <div className="panel">
          <EmptyState
            title="No report generated yet"
            hint="Choose a date range above and generate a report to see compliance summary stats and download options."
          />
        </div>
      )}

      {!loading && report && (
        <>
          <section className="stat-row">
            <StatTile label="Total requests" value={report.summary.totalRequests} />
            <StatTile
              label="Blocked requests"
              value={report.summary.blockedRequests}
              tone={report.summary.blockedRequests > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="PII incidents"
              value={report.summary.piiIncidents}
              tone={report.summary.piiIncidents > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="Injection attempts"
              value={report.summary.injectionAttempts}
              tone={report.summary.injectionAttempts > 0 ? 'warning' : 'default'}
            />
            <StatTile label="Total cost" value={money(report.summary.totalCostUsd)} />
            <StatTile label="Avg latency" value={`${Math.round(report.summary.avgLatencyMs)}ms`} />
            <StatTile label="Avg hallucination" value={score(report.summary.avgHallucinationScore)} />
            <StatTile label="Avg faithfulness" value={score(report.summary.avgFaithfulnessScore)} />
          </section>

          <section className="panel-row">
            <div className="panel">
              <div className="panel__header">
                <h2>Hash-chain integrity</h2>
              </div>
              <div className="integrity-block">
                <span className={`badge ${report.hashChainIntegrity.verified ? 'badge--ok' : 'badge--blocked'}`}>
                  {report.hashChainIntegrity.verified ? 'VERIFIED' : 'INTEGRITY FAILURE'}
                </span>
                <p className="integrity-block__detail">
                  {report.hashChainIntegrity.totalTraces} trace{report.hashChainIntegrity.totalTraces === 1 ? '' : 's'} in
                  the tamper-evident chain across the tenant's full history.
                </p>
              </div>
            </div>

            <div className="panel">
              <div className="panel__header">
                <h2>Policy violations</h2>
              </div>
              {report.policyViolations.length === 0 ? (
                <EmptyState title="No policy violations in range" />
              ) : (
                <div className="violation-list">
                  {report.policyViolations.map((v) => (
                    <div key={v.violation} className="violation-row">
                      <span className="mono">{v.violation}</span>
                      <span className="badge badge--warning">{v.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel__header">
              <h2>Download</h2>
            </div>
            {downloadError && <ErrorBanner message={downloadError} />}
            <div className="download-row">
              <button type="button" onClick={() => download('json')} disabled={downloading !== null}>
                {downloading === 'json' ? 'Preparing…' : 'Download JSON'}
              </button>
              <button type="button" onClick={() => download('pdf')} disabled={downloading !== null}>
                {downloading === 'pdf' ? 'Preparing…' : 'Download PDF'}
              </button>
            </div>
            <p className="modal__note">
              Report generated {fmtTime(report.meta.generatedAt)} for period {fmtTime(report.meta.period.from)} –{' '}
              {fmtTime(report.meta.period.to)} · standard: {report.meta.standard}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
