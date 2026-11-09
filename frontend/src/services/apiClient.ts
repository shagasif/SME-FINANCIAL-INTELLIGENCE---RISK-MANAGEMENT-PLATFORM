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

const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Centralized HTTP client for communicating with the SME Financial Intelligence API.
 * Uses the environment-configured VITE_API_BASE_URL and normalizes network and HTTP errors.
 */
export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${appConfig.apiBaseUrl}${normalizedPath}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  const onExternalAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

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
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
