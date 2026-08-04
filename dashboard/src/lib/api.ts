const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
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

export { API_URL };
