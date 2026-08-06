// api's NestJS app applies a global 'api' prefix (see api/src/main.ts) to every
// REST route except the /dashboard WebSocket namespace, which is unprefixed.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const API_URL = `${API_BASE}/api`;
const TOKEN_KEY = 'llm-sentinel-token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export interface AuthResponse {
  token: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (tenantId: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ tenantId, email, password }),
    }),
};

export interface DashboardOverview {
  totalToday: number;
  blockedToday: number;
  costBurn24h: number;
  recentTraces: TraceSummary[];
  hallucinationTrend: { hour: string; avgScore: string }[];
}

export interface TraceSummary {
  id: string;
  createdAt: string;
  model: string;
  provider: string;
  blocked: boolean;
  piiDetectedInput: boolean;
  injectionDetected: boolean;
  hallucinationScore: number | null;
  toxicityScore: number | null;
  faithfulnessScore: number | null;
  costUsd: number;
}

export interface AlertItem {
  traceId: string;
  tenantId: string;
  rule: string;
  message: string;
  createdAt: string;
}

export const dashboardApi = {
  getOverview: () => request<DashboardOverview>('/dashboard/overview'),
  getAlerts: (hours = 24) => request<AlertItem[]>(`/alerts?hours=${hours}`),
};

// --- Policies ---

export type PolicyAction = 'BLOCK' | 'ALERT';

export interface Policy {
  id: string;
  tenantId: string;
  name: string;
  condition: string;
  action: PolicyAction;
  alert: boolean;
  enabled: boolean;
  model: string | null;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePolicyInput {
  name: string;
  condition: string;
  action: PolicyAction;
  alert?: boolean;
  enabled?: boolean;
  model?: string;
  userId?: string;
}

export type UpdatePolicyInput = Partial<CreatePolicyInput>;

export const policiesApi = {
  list: () => request<Policy[]>('/policies'),
  get: (id: string) => request<Policy>(`/policies/${id}`),
  create: (dto: CreatePolicyInput) =>
    request<Policy>('/policies', { method: 'POST', body: JSON.stringify(dto) }),
  update: (id: string, dto: UpdatePolicyInput) =>
    request<Policy>(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(dto) }),
  remove: (id: string) => request<void>(`/policies/${id}`, { method: 'DELETE' }),
};

// --- Traces ---

export interface TraceDetail {
  id: string;
  tenantId: string;
  userId: string | null;
  sessionId: string | null;
  model: string;
  provider: string;
  promptHash: string;
  responseHash: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  ttftMs: number;
  piiDetectedInput: boolean;
  piiTypes: string[] | null;
  injectionDetected: boolean;
  hallucinationScore: number | null;
  toxicityScore: number | null;
  faithfulnessScore: number | null;
  policyViolations: string[] | null;
  blocked: boolean;
  blockReason: string | null;
  chainHash: string | null;
  createdAt: string;
}

export interface TraceListResult {
  data: TraceDetail[];
  total: number;
}

export interface TraceListParams {
  from?: string;
  to?: string;
  model?: string;
  blocked?: boolean;
  page?: number;
  limit?: number;
}

export interface TraceStats {
  total: string;
  totalCost: string | null;
  avgLatency: string | null;
  avgHallucination: string | null;
  avgToxicity: string | null;
  avgFaithfulness: string | null;
  blockedCount: string;
  piiCount: string;
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') usp.set(k, String(v));
  });
  const qs = usp.toString();
  return qs ? `?${qs}` : '';
}

export const tracesApi = {
  list: (params: TraceListParams = {}) =>
    request<TraceListResult>(`/traces${buildQuery(params)}`),
  get: (id: string) => request<TraceDetail>(`/traces/${id}`),
  getStats: (from: string, to: string) =>
    request<TraceStats>(`/traces/stats${buildQuery({ from, to })}`),
};

// --- Audit ---

export interface AuditReport {
  meta: {
    tenantId: string;
    generatedAt: string;
    period: { from: string; to: string };
    standard: string;
  };
  summary: {
    totalRequests: number;
    blockedRequests: number;
    piiIncidents: number;
    injectionAttempts: number;
    totalCostUsd: number;
    avgLatencyMs: number;
    avgHallucinationScore: number;
    avgToxicityScore: number;
    avgFaithfulnessScore: number;
  };
  policyViolations: { violation: string; count: number }[];
  hashChainIntegrity: { verified: boolean; totalTraces: number };
  traces: {
    id: string;
    createdAt: string;
    model: string;
    provider: string;
    blocked: boolean;
    piiDetected: boolean;
    injectionDetected: boolean;
    hallucinationScore: number | null;
    toxicityScore: number | null;
    faithfulnessScore: number | null;
    costUsd: number;
    chainHash: string;
  }[];
}

async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const auditApi = {
  getReport: (from: string, to: string) =>
    request<AuditReport>(`/audit/report${buildQuery({ from, to })}`),
  downloadJson: (from: string, to: string, tenantId: string) =>
    downloadFile(
      `/audit/report/download${buildQuery({ from, to, format: 'json' })}`,
      `audit-report-${tenantId}-${from}-${to}.json`,
    ),
  downloadPdf: (from: string, to: string, tenantId: string) =>
    downloadFile(
      `/audit/report/download${buildQuery({ from, to, format: 'pdf' })}`,
      `audit-report-${tenantId}-${from}-${to}.pdf`,
    ),
};

export { API_URL, API_BASE };
