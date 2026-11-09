export interface HealthCheckResponse {
  status: 'ok';
  service: string;
  timestamp: string;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready';
  service: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs?: number;
  };
  timestamp: string;
}

export interface SystemConnectivityState {
  apiStatus: 'loading' | 'online' | 'offline';
  databaseStatus: 'loading' | 'connected' | 'disconnected' | 'unverified';
  serviceName: string | null;
  timestamp: string | null;
  databaseLatencyMs: number | null;
  errorMessage: string | null;
}

export interface PlatformCapabilityPillar {
  id: string;
  title: string;
  summary: string;
  architecturalBoundary: string;
}

export interface FutureAgentBoundaryItem {
  name: string;
  role: string;
  accessBoundary: string;
}
