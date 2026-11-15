import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SendPasswordResetEmailParams {
  toEmail: string;
  recipientName?: string;
  resetUrl: string;
  expiresMinutes: number;
}

export interface EmailDispatchResult {
  success: boolean;
  messageId?: string;
  reason?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Dispatches a branded password reset email via Resend REST API.
   * Uses native fetch with zero external npm dependencies.
   */
  async sendPasswordResetEmail(
    params: SendPasswordResetEmailParams,
  ): Promise<EmailDispatchResult> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const maskedEmail = this.maskEmail(params.toEmail);

    if (!apiKey) {
      this.logger.warn(
        `[EmailService] RESEND_API_KEY is not configured. Password reset email to ${maskedEmail} was skipped.`,
      );
      return {
        success: false,
        reason: 'RESEND_API_KEY_NOT_CONFIGURED',
      };
    }

    const fromAddress =
      this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ||
      'SME Financial Intelligence <onboarding@resend.dev>';

    const subject = 'Reset Your SME Financial Intelligence Password';
    const htmlBody = this.buildResetPasswordHtml(params);
    const textBody = this.buildResetPasswordText(params);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [params.toEmail],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `[EmailService] Failed to dispatch password reset email to ${maskedEmail}: HTTP ${response.status} - ${errorText}`,
        );
        return {
          success: false,
          reason: `RESEND_HTTP_${response.status}`,
        };
      }

      const data = (await response.json()) as { id?: string };
      this.logger.log(
        `[EmailService] Password reset email successfully dispatched to ${maskedEmail} (Message ID: ${data.id ?? 'unknown'}).`,
      );

      return {
        success: true,
        messageId: data.id,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[EmailService] Unexpected network failure dispatching email to ${maskedEmail}: ${msg}`,
      );
      return {
        success: false,
        reason: msg,
      };
    }
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***@***';
    const name = parts[0];
    const domain = parts[1];
    const visibleName = name.length > 2 ? `${name.slice(0, 2)}***` : '***';
    return `${visibleName}@${domain}`;
  }

  private buildResetPasswordHtml(params: SendPasswordResetEmailParams): string {
    const greeting = params.recipientName
      ? `Hello ${escapeHtml(params.recipientName)},`
      : 'Hello,';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
    .container { max-width: 580px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.025em; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 36px 32px; font-size: 15px; line-height: 1.6; color: #334155; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #0284c7; color: #ffffff !important; text-decoration: none; font-size: 15px; font-weight: 600; padding: 13px 32px; border-radius: 8px; box-shadow: 0 2px 4px rgba(2, 132, 199, 0.25); }
    .footnote { margin-top: 30px; padding-top: 20px; border-top: 1px solid #f1f5f9; font-size: 13px; color: #64748b; line-height: 1.5; }
    .footnote a { color: #0284c7; word-break: break-all; }
    .footer { background-color: #f8fafc; padding: 20px 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SME Financial Intelligence</h1>
      <p>Secure Identity & Risk Management Platform</p>
    </div>
    <div class="content">
      <p>${greeting}</p>
      <p>We received a request to reset the password for your SME Financial Intelligence account. Click the button below to choose a new secure password:</p>
      
      <div class="btn-container">
        <a href="${params.resetUrl}" class="btn" target="_blank" rel="noopener noreferrer">Reset My Password</a>
      </div>

      <p style="font-size: 14px; color: #64748b;">
        This password reset link is valid for <strong>${params.expiresMinutes} minutes</strong> and can only be used once.
      </p>

      <div class="footnote">
        <p>If the button above does not work, copy and paste the following URL into your web browser:</p>
        <p><a href="${params.resetUrl}" target="_blank" rel="noopener noreferrer">${params.resetUrl}</a></p>
        <p>If you did not request a password reset, no action is needed. Your account remains secure and your current password will not change.</p>
      </div>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} SME Financial Intelligence Platform. All rights reserved.
    </div>
  </div>
</body>
</html>`;
  }

  private buildResetPasswordText(params: SendPasswordResetEmailParams): string {
    const greeting = params.recipientName
      ? `Hello ${params.recipientName},`
      : 'Hello,';

    return `${greeting}

We received a request to reset your password for SME Financial Intelligence & Risk Management Platform.

Use the link below to set your new password:
${params.resetUrl}

This link is valid for ${params.expiresMinutes} minutes and can only be used once.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

--
SME Financial Intelligence Platform`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
