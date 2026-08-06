import { useEffect, useState, useCallback } from 'react';
import { dashboardApi, type DashboardOverview, type TraceSummary, type AlertItem } from '../lib/api';
import { connectDashboardSocket } from '../lib/socket';
import { useAuth } from '../lib/auth-context';
import { StatTile } from '../components/StatTile';

const MAX_FEED_ITEMS = 50;

function formatCost(usd: number): string {
  return `$${Number(usd).toFixed(4)}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString();
}

export function DashboardPage() {
  const { logout } = useAuth();
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [traces, setTraces] = useState<TraceSummary[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const upsertTrace = useCallback((trace: TraceSummary) => {
    setTraces((prev) => {
      const withoutDupe = prev.filter((t) => t.id !== trace.id);
      return [trace, ...withoutDupe].slice(0, MAX_FEED_ITEMS);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    Promise.all([dashboardApi.getOverview(), dashboardApi.getAlerts(24)])
      .then(([overviewData, alertsData]) => {
        if (cancelled) return;
        setOverview(overviewData);
        setTraces(overviewData.recentTraces);
        setAlerts(alertsData);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const socket = connectDashboardSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onTrace = (trace: TraceSummary) => upsertTrace(trace);
    const onAlert = (alert: AlertItem) => setAlerts((prev) => [alert, ...prev].slice(0, MAX_FEED_ITEMS));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('trace', onTrace);
    socket.on('alert', onAlert);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('trace', onTrace);
      socket.off('alert', onAlert);
    };
  }, [upsertTrace]);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1>LLM Sentinel</h1>
        <div className="dashboard__header-right">
          <span className={`live-indicator ${connected ? 'live-indicator--on' : ''}`}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {loadError && <div className="banner banner--error">{loadError}</div>}

      <section className="stat-row">
        <StatTile label="Requests today" value={overview?.totalToday ?? '—'} />
        <StatTile label="Blocked today" value={overview?.blockedToday ?? '—'} tone={overview?.blockedToday ? 'warning' : 'default'} />
        <StatTile label="Cost burn (24h)" value={overview ? formatCost(overview.costBurn24h) : '—'} />
        <StatTile label="Active alerts (24h)" value={alerts.length} tone={alerts.length > 0 ? 'warning' : 'default'} />
      </section>

      <section className="panel-row">
        <div className="panel">
          <h2>Live Trace Feed</h2>
          <div className="trace-list">
            {traces.length === 0 && <p className="empty-state">No traces yet.</p>}
            {traces.map((t) => (
              <div key={t.id} className={`trace-row ${t.blocked ? 'trace-row--blocked' : ''}`}>
                <span className="trace-row__time">{formatTime(t.createdAt)}</span>
                <span className="trace-row__model">{t.model}</span>
                <span className="trace-row__provider">{t.provider}</span>
                {t.blocked && <span className="badge badge--blocked">BLOCKED</span>}
                {t.piiDetectedInput && <span className="badge badge--warning">PII</span>}
                {t.injectionDetected && <span className="badge badge--warning">INJECTION</span>}
                <span className="trace-row__cost">{formatCost(t.costUsd)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Alert Timeline</h2>
          <div className="alert-list">
            {alerts.length === 0 && <p className="empty-state">No alerts in the last 24h.</p>}
            {alerts.map((a, i) => (
              <div key={`${a.traceId}-${a.rule}-${i}`} className="alert-row">
                <span className="alert-row__time">{formatTime(a.createdAt)}</span>
                <span className="badge badge--alert">{a.rule}</span>
                <span className="alert-row__message">{a.message}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
