/**
 * Centralized Frontend Environment Configuration
 *
 * Reads VITE_API_BASE_URL from Vite environment variables and normalizes
 * trailing slashes. Never contains backend credentials or DATABASE_URL.
 */
export interface FrontendConfig {
  readonly apiBaseUrl: string;
}

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured && configured.length > 0) {
    return configured.replace(/\/+$/, '');
  }
  return '/api';
}

export const appConfig: FrontendConfig = {
  apiBaseUrl: resolveApiBaseUrl(),
};
