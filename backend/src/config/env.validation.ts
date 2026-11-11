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
  JWT_SECRET?: string;
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_OPENAI_API_KEY?: string;
  AI_GEMINI_API_KEY?: string;
  AI_ANTHROPIC_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL_SUPERVISOR?: string;
  AI_MODEL_SPECIALIST?: string;
  AI_MODEL_VERIFIER?: string;
  AI_TIMEOUT_MS?: string;
  AI_MAX_RETRIES?: string;
  AI_RATE_LIMIT_PER_MIN?: string;
  MCP_EXTERNAL_SERVER_URL?: string;
}

const ALLOWED_NODE_ENVS = ['development', 'test', 'production'] as const;
const ALLOWED_AI_PROVIDERS = ['deterministic-grounded', 'openai', 'gemini', 'anthropic'] as const;

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

  type OptionalEnvKey = Exclude<
    keyof EnvConfig,
    'NODE_ENV' | 'PORT' | 'FRONTEND_URL' | 'DATABASE_URL'
  >;
  const optionalConfig: Partial<Record<OptionalEnvKey, string>> = {};

  if (raw.AI_PROVIDER !== undefined && raw.AI_PROVIDER !== '') {
    const aiProvider = String(raw.AI_PROVIDER).trim().toLowerCase();
    if (!ALLOWED_AI_PROVIDERS.includes(aiProvider as (typeof ALLOWED_AI_PROVIDERS)[number])) {
      errors.push(`AI_PROVIDER must be one of: ${ALLOWED_AI_PROVIDERS.join(', ')}`);
    } else {
      optionalConfig.AI_PROVIDER = aiProvider;
    }
  }

  const knownOptionalKeys: OptionalEnvKey[] = [
    'JWT_SECRET',
    'AI_API_KEY',
    'AI_OPENAI_API_KEY',
    'AI_GEMINI_API_KEY',
    'AI_ANTHROPIC_API_KEY',
    'AI_BASE_URL',
    'AI_MODEL_SUPERVISOR',
    'AI_MODEL_SPECIALIST',
    'AI_MODEL_VERIFIER',
    'AI_TIMEOUT_MS',
    'AI_MAX_RETRIES',
    'AI_RATE_LIMIT_PER_MIN',
    'MCP_EXTERNAL_SERVER_URL',
  ];

  for (const key of knownOptionalKeys) {
    if (typeof raw[key] === 'string' && (raw[key] as string).trim() !== '') {
      optionalConfig[key] = (raw[key] as string).trim();
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment configuration validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    NODE_ENV: nodeEnv as EnvConfig['NODE_ENV'],
    PORT: rawPort,
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
    ...optionalConfig,
  };
}
