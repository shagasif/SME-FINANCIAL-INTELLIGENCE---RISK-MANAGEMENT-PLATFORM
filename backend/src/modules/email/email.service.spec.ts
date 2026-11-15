import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service.js';

describe('EmailService', () => {
  let service: EmailService;
  let mockConfigService: Partial<ConfigService>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('skips dispatch safely when RESEND_API_KEY is not configured', async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return undefined;
        return undefined;
      }),
    };

    service = new EmailService(mockConfigService as ConfigService);
    const result = await service.sendPasswordResetEmail({
      toEmail: 'qa.test@example.com',
      recipientName: 'QA User',
      resetUrl: 'http://localhost:5173/reset-password?token=test-123',
      expiresMinutes: 30,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('RESEND_API_KEY_NOT_CONFIGURED');
  });

  it('dispatches email to Resend REST API when RESEND_API_KEY is provided', async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_mock_key';
        if (key === 'RESEND_FROM_EMAIL') return 'Acme SME <onboarding@resend.dev>';
        return undefined;
      }),
    };

    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'resend_email_id_12345' }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    service = new EmailService(mockConfigService as ConfigService);
    const result = await service.sendPasswordResetEmail({
      toEmail: 'qa.test@example.com',
      recipientName: 'QA User',
      resetUrl: 'http://localhost:5173/reset-password?token=test-123',
      expiresMinutes: 30,
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('resend_email_id_12345');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] = mockFetch.mock.calls[0];
    expect(calledUrl).toBe('https://api.resend.com/emails');
    expect(calledOptions.method).toBe('POST');
    expect(calledOptions.headers.Authorization).toBe('Bearer re_test_mock_key');

    const body = JSON.parse(calledOptions.body);
    expect(body.from).toBe('Acme SME <onboarding@resend.dev>');
    expect(body.to).toEqual(['qa.test@example.com']);
    expect(body.subject).toBe('Reset Your SME Financial Intelligence Password');
    expect(body.html).toContain('http://localhost:5173/reset-password?token=test-123');
    expect(body.text).toContain('http://localhost:5173/reset-password?token=test-123');
  });

  it('handles Resend API error responses gracefully without throwing', async () => {
    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_mock_key';
        return undefined;
      }),
    };

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Invalid API Key',
    }) as unknown as typeof fetch;

    service = new EmailService(mockConfigService as ConfigService);
    const result = await service.sendPasswordResetEmail({
      toEmail: 'qa.test@example.com',
      resetUrl: 'http://localhost:5173/reset-password?token=test-123',
      expiresMinutes: 30,
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe('RESEND_HTTP_401');
  });
});
