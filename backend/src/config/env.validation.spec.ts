import { validateEnv } from './env.validation.js';

describe('validateEnv', () => {
  const validBaseEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    FRONTEND_URL: 'http://localhost:5173',
    DATABASE_URL:
      'postgresql://postgres:postgrespassword@localhost:5432/sme_financial_intelligence_dev?schema=public',
  };

  it('accepts valid environment configuration and coerces PORT to number', () => {
    const result = validateEnv(validBaseEnv);
    expect(result).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      FRONTEND_URL: 'http://localhost:5173',
      DATABASE_URL: validBaseEnv.DATABASE_URL,
    });
  });

  it('applies safe defaults for NODE_ENV, PORT, and FRONTEND_URL when omitted', () => {
    const result = validateEnv({
      DATABASE_URL: validBaseEnv.DATABASE_URL,
    });
    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.FRONTEND_URL).toBe('http://localhost:5173');
  });

  it('throws a clear error when DATABASE_URL is missing', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL is required/);
  });

  it('throws a clear error when DATABASE_URL is not a postgresql:// URL', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        DATABASE_URL: 'mysql://localhost:3306/db',
      }),
    ).toThrow(/DATABASE_URL must be a valid postgresql:\/\//);
  });

  it('throws a clear error when PORT is out of range', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        PORT: '99999',
      }),
    ).toThrow(/PORT must be a valid integer between 1 and 65535/);
  });

  it('throws a clear error when NODE_ENV is invalid', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        NODE_ENV: 'staging',
      }),
    ).toThrow(/NODE_ENV must be one of/);
  });

  it('throws a clear error when FRONTEND_URL has an invalid protocol', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        FRONTEND_URL: 'ftp://invalid-origin',
      }),
    ).toThrow(/FRONTEND_URL must contain valid http:\/\//);
  });

  it('preserves valid AI provider and model configuration without exposing secrets', () => {
    const result = validateEnv({
      ...validBaseEnv,
      AI_PROVIDER: 'gemini',
      AI_GEMINI_API_KEY: 'test-secret-key-gemini',
      AI_MODEL_SUPERVISOR: 'gemini-3.8-flash',
      AI_BASE_URL: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      AI_TIMEOUT_MS: '60000',
    });

    expect(result.AI_PROVIDER).toBe('gemini');
    expect(result.AI_GEMINI_API_KEY).toBe('test-secret-key-gemini');
    expect(result.AI_MODEL_SUPERVISOR).toBe('gemini-3.8-flash');
    expect(result.AI_BASE_URL).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(result.AI_TIMEOUT_MS).toBe('60000');
  });

  it('throws a clear error when AI_PROVIDER is invalid and does not leak API keys in the error', () => {
    expect(() =>
      validateEnv({
        ...validBaseEnv,
        AI_PROVIDER: 'unsupported-provider',
        AI_GEMINI_API_KEY: 'secret-key-that-must-not-appear',
      }),
    ).toThrow(/AI_PROVIDER must be one of: deterministic-grounded, openai, gemini, anthropic/);

    try {
      validateEnv({
        ...validBaseEnv,
        AI_PROVIDER: 'unsupported-provider',
        AI_GEMINI_API_KEY: 'secret-key-that-must-not-appear',
      });
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain('secret-key-that-must-not-appear');
    }
  });
});
