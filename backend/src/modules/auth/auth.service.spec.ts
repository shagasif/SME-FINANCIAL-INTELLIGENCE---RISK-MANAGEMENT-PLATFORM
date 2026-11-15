import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { EmailService } from '../email/email.service.js';
import { AuthService } from './auth.service.js';

describe('AuthService - Password Reset', () => {
  let authService: AuthService;
  let prismaMock: any;
  let configMock: any;
  let auditMock: any;
  let emailMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      passwordResetToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      session: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((promises) => Promise.all(promises)),
    };

    configMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:5173';
        if (key === 'NODE_ENV') return 'production';
        return undefined;
      }),
    };

    auditMock = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    emailMock = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
    };

    authService = new AuthService(
      prismaMock as unknown as PrismaService,
      configMock as unknown as ConfigService,
      auditMock as unknown as AuditService,
      emailMock as unknown as EmailService,
    );
  });

  describe('requestPasswordReset', () => {
    it('returns uniform message and does not send email if user not found (enumeration protection)', async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      const res = await authService.requestPasswordReset({ email: 'unknown@example.com' });

      expect(res.status).toBe('accepted');
      expect(res.message).toContain('If an active account exists');
      expect((res as any).resetTokenForDevOrTest).toBeUndefined();
      expect(emailMock.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('creates token and dispatches reset email when active user exists', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'alice@example.com',
        fullName: 'Alice Smith',
        isActive: true,
      });

      const res = await authService.requestPasswordReset({ email: 'alice@example.com' });

      expect(res.status).toBe('accepted');
      expect((res as any).resetTokenForDevOrTest).toBeUndefined(); // Token never exposed in API response
      expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1);
      expect(emailMock.sendPasswordResetEmail).toHaveBeenCalledTimes(1);

      const emailCall = emailMock.sendPasswordResetEmail.mock.calls[0][0];
      expect(emailCall.toEmail).toBe('alice@example.com');
      expect(emailCall.recipientName).toBe('Alice Smith');
      expect(emailCall.resetUrl).toMatch(/^http:\/\/localhost:5173\/reset-password\?token=[a-f0-9]{64}$/);
      expect(emailCall.expiresMinutes).toBe(30);
    });
  });

  describe('confirmPasswordReset', () => {
    it('throws BadRequestException for invalid or expired token', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        authService.confirmPasswordReset({
          token: 'invalid-token',
          newPassword: 'NewSecurePassword123!',
        }),
      ).rejects.toThrow('Invalid or expired password reset token');
    });

    it('successfully rotates password, marks token used, and revokes sessions', async () => {
      prismaMock.passwordResetToken.findUnique.mockResolvedValue({
        id: 'token-rec-1',
        userId: 'user-123',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 15), // valid 15 more mins
      });

      const res = await authService.confirmPasswordReset({
        token: 'valid-token',
        newPassword: 'NewSecurePassword123!',
      });

      expect(res.status).toBe('password_updated');
      expect(prismaMock.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-123' },
        }),
      );
      expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-rec-1' },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
      expect(prismaMock.session.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-123', revokedAt: null },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
