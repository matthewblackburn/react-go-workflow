import type { APIError } from '@/types/api';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(status: number, code: string, details?: Record<string, string>) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getToken(): string | null {
  return localStorage.getItem('jwt_token');
}

function buildQuery(params?: Record<string, string | number | boolean | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let err: APIError;
    try {
      err = await res.json();
    } catch {
      throw new ApiError(res.status, 'UNKNOWN_ERROR');
    }
    throw new ApiError(res.status, err.code, err.details);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | boolean | undefined>) =>
    request<T>('GET', `${path}${buildQuery(params)}`),
  post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
  buildQuery,
};
