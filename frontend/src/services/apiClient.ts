import { appConfig } from '../config/env';
import type { ApiErrorPayload } from '../types/api.types';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly payload?: ApiErrorPayload;

  constructor(message: string, statusCode: number, payload?: ApiErrorPayload) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;
const TOKEN_STORAGE_KEY = 'sme_finance_auth_token';
const ORG_STORAGE_KEY = 'sme_finance_active_org_id';

let onUnauthorizedCallback: (() => void) | null = null;

export const authStorage = {
  getToken(): string | null {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
  },
  setToken(token: string, persist = false): void {
    if (persist) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  },
  clearToken(): void {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  },
  getActiveOrgId(): string | null {
    return sessionStorage.getItem(ORG_STORAGE_KEY) || localStorage.getItem(ORG_STORAGE_KEY);
  },
  setActiveOrgId(orgId: string): void {
    sessionStorage.setItem(ORG_STORAGE_KEY, orgId);
    localStorage.setItem(ORG_STORAGE_KEY, orgId);
  },
  clearActiveOrgId(): void {
    sessionStorage.removeItem(ORG_STORAGE_KEY);
    localStorage.removeItem(ORG_STORAGE_KEY);
  },
  registerUnauthorizedHandler(callback: () => void): void {
    onUnauthorizedCallback = callback;
  },
};

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${appConfig.apiBaseUrl}${normalizedPath}`;
  const method = options.method ?? 'GET';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers ?? {}),
  };

  const token = authStorage.getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  const activeOrgId = authStorage.getActiveOrgId();
  if (activeOrgId && !headers['X-Organization-Id']) {
    headers['X-Organization-Id'] = activeOrgId;
  }

  let bodyContent: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      bodyContent = options.body;
      // Do not set Content-Type header manually for FormData so boundary is preserved
      delete headers['Content-Type'];
    } else {
      headers['Content-Type'] = 'application/json';
      bodyContent = JSON.stringify(options.body);
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyContent,
      signal: controller.signal,
    });

    if (response.status === 401) {
      authStorage.clearToken();
      onUnauthorizedCallback?.();
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    const body: unknown = isJson ? await response.json() : undefined;

    if (!response.ok) {
      const errorPayload = body as ApiErrorPayload | undefined;
      const rawMessage = errorPayload?.message;
      const errorMessage = Array.isArray(rawMessage)
        ? rawMessage.join('; ')
        : typeof rawMessage === 'string'
          ? rawMessage
          : `Request failed with HTTP ${response.status}`;

      throw new ApiClientError(errorMessage, response.status, errorPayload);
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError('Request timed out or was cancelled', 0);
    }
    throw new ApiClientError(
      error instanceof Error
        ? `Unable to reach backend API (${error.message})`
        : 'Unable to reach backend API',
      0,
    );
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export function apiGet<T>(
  path: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, { method: 'GET', signal, headers });
}

export function apiPost<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, { method: 'POST', body, signal, headers });
}

export function apiPatch<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, { method: 'PATCH', body, signal, headers });
}

export function apiDelete<T>(
  path: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  return request<T>(path, { method: 'DELETE', signal, headers });
}

export async function apiDownload(path: string, filename: string): Promise<void> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${appConfig.apiBaseUrl}${normalizedPath}`;
  const headers: Record<string, string> = {};

  const token = authStorage.getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const activeOrgId = authStorage.getActiveOrgId();
  if (activeOrgId) {
    headers['X-Organization-Id'] = activeOrgId;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    let errorMsg = `Download failed with HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errorMsg;
    } catch {
      // fallback to status code
    }
    throw new ApiClientError(errorMsg, response.status);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
