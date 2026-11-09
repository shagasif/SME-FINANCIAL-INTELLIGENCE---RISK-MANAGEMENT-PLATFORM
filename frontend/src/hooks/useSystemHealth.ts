import { useCallback, useEffect, useState } from 'react';
import { fetchApiHealth, fetchDatabaseReadiness } from '../services/healthService';
import type { SystemConnectivityState } from '../types/health.types';

const INITIAL_STATE: SystemConnectivityState = {
  apiStatus: 'loading',
  databaseStatus: 'loading',
  serviceName: null,
  timestamp: null,
  databaseLatencyMs: null,
  errorMessage: null,
};

/**
 * Hook that verifies live connectivity with the NestJS backend (/api/health)
 * and PostgreSQL database readiness (/api/health/ready).
 */
export function useSystemHealth(): {
  state: SystemConnectivityState;
  refresh: () => void;
} {
  const [state, setState] = useState<SystemConnectivityState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);

  const refresh = useCallback(() => {
    setState((prev) => ({
      ...prev,
      apiStatus: 'loading',
      databaseStatus: 'loading',
      errorMessage: null,
    }));
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function runVerification(): Promise<void> {
      try {
        const health = await fetchApiHealth(controller.signal);

        let dbStatus: SystemConnectivityState['databaseStatus'] = 'unverified';
        let latencyMs: number | null = null;

        try {
          const readiness = await fetchDatabaseReadiness(controller.signal);
          dbStatus = readiness.database.status === 'connected' ? 'connected' : 'disconnected';
          latencyMs = readiness.database.latencyMs ?? null;
        } catch {
          dbStatus = 'unverified';
        }

        if (!controller.signal.aborted) {
          setState({
            apiStatus: health.status === 'ok' ? 'online' : 'offline',
            databaseStatus: dbStatus,
            serviceName: health.service,
            timestamp: health.timestamp,
            databaseLatencyMs: latencyMs,
            errorMessage: null,
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState({
            apiStatus: 'offline',
            databaseStatus: 'unverified',
            serviceName: null,
            timestamp: null,
            databaseLatencyMs: null,
            errorMessage:
              error instanceof Error ? error.message : 'Could not communicate with the backend API',
          });
        }
      }
    }

    void runVerification();

    return () => {
      controller.abort();
    };
  }, [attempt]);

  return { state, refresh };
}
