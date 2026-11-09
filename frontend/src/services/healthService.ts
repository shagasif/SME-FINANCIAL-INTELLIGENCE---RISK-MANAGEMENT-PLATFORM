import type { HealthCheckResponse, ReadinessCheckResponse } from '../types/health.types';
import { ApiClientError, apiGet } from './apiClient';

/**
 * Fetches the application liveness probe from GET /api/health.
 */
export async function fetchApiHealth(signal?: AbortSignal): Promise<HealthCheckResponse> {
  return apiGet<HealthCheckResponse>('/health', signal);
}

/**
 * Fetches the PostgreSQL readiness probe from GET /api/health/ready.
 * Translates HTTP 503 responses into a structured not_ready state rather than
 * treating database unavailability as an unhandled crash.
 */
export async function fetchDatabaseReadiness(
  signal?: AbortSignal,
): Promise<ReadinessCheckResponse> {
  try {
    return await apiGet<ReadinessCheckResponse>('/health/ready', signal);
  } catch (error) {
    if (error instanceof ApiClientError && error.statusCode === 503) {
      return {
        status: 'not_ready',
        service: 'SME Financial Intelligence API',
        database: {
          status: 'disconnected',
        },
        timestamp: error.payload?.timestamp ?? new Date().toISOString(),
      };
    }
    throw error;
  }
}
