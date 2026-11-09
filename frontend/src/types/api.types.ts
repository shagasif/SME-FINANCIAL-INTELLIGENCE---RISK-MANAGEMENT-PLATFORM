export interface ApiErrorPayload {
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
  database?: {
    status: 'connected' | 'disconnected';
  };
}

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
