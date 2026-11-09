/**
 * Environment Configuration & Startup Validation
 *
 * Validates all required environment variables at application bootstrap.
 * Fails fast with clear, actionable configuration error messages if any
 * required variable is missing or malformed. Never logs secret values.
 */
export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  FRONTEND_URL: string;
  DATABASE_URL: string;
}

const ALLOWED_NODE_ENVS = ['development', 'test', 'production'] as const;

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const errors: string[] = [];

  const nodeEnv = String(raw.NODE_ENV ?? 'development').trim();
  if (!ALLOWED_NODE_ENVS.includes(nodeEnv as (typeof ALLOWED_NODE_ENVS)[number])) {
    errors.push(`NODE_ENV must be one of: ${ALLOWED_NODE_ENVS.join(', ')}`);
  }

  const rawPort = raw.PORT !== undefined && raw.PORT !== '' ? Number(raw.PORT) : 3000;
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
    errors.push('PORT must be a valid integer between 1 and 65535');
  }

  // Support FRONTEND_URL (primary) or CORS_ORIGIN as fallback
  const frontendUrlRaw = raw.FRONTEND_URL ?? raw.CORS_ORIGIN ?? 'http://localhost:5173';
  const frontendUrl = String(frontendUrlRaw).trim();
  if (!frontendUrl) {
    errors.push('FRONTEND_URL must not be empty');
  } else {
    const origins = frontendUrl.split(',').map((origin) => origin.trim());
    const hasInvalidOrigin = origins.some((origin) => !/^https?:\/\/.+/.test(origin));
    if (hasInvalidOrigin) {
      errors.push(
        'FRONTEND_URL must contain valid http:// or https:// origin URL(s) (comma-separated if multiple)',
      );
    }
  }

  const databaseUrl = typeof raw.DATABASE_URL === 'string' ? raw.DATABASE_URL.trim() : '';
  if (!databaseUrl) {
    errors.push(
      'DATABASE_URL is required (copy backend/.env.example to backend/.env and configure PostgreSQL)',
    );
  } else if (!/^postgres(ql)?:\/\/.+/.test(databaseUrl)) {
    errors.push('DATABASE_URL must be a valid postgresql:// or postgres:// connection string');
  }

  if (errors.length > 0) {
    throw new Error(`Environment configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    NODE_ENV: nodeEnv as EnvConfig['NODE_ENV'],
    PORT: rawPort,
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
  };
}
