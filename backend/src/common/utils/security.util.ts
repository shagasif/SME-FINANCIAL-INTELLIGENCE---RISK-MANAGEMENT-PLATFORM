import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

export interface JwtClaims {
  sub: string;
  email: string;
  sessionId: string;
  isPlatformAdmin: boolean;
  iat: number;
  exp: number;
}

/**
 * Cryptographic, JWT, Password Hashing, Encryption & Prompt-Injection Sanitization Utility
 */
export class SecurityUtil {
  /**
   * Hashes a plaintext password using scrypt with a random 16-byte salt.
   */
  static hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = scryptSync(password, salt, 64).toString('hex');
    return `scrypt$${salt}$${derived}`;
  }

  /**
   * Timing-safe verification of a plaintext password against a stored scrypt hash.
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const [, salt, originalHex] = parts;
    const derivedBuf = scryptSync(password, salt, 64);
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derivedBuf.length !== originalBuf.length) {
      return false;
    }
    return timingSafeEqual(derivedBuf, originalBuf);
  }

  /**
   * Signs an RFC 7519 HS256 JWT token.
   */
  static signJwt(
    payload: Omit<JwtClaims, 'iat' | 'exp'>,
    secret: string,
    expiresInSeconds = 86400,
  ): string {
    const nowSec = Math.floor(Date.now() / 1000);
    const fullPayload: JwtClaims = {
      ...payload,
      iat: nowSec,
      exp: nowSec + expiresInSeconds,
    };
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
      'base64url',
    );
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
  }

  /**
   * Verifies an HS256 JWT token and checks expiration.
   */
  static verifyJwt(token: string, secret: string): JwtClaims | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    try {
      const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as JwtClaims;
      const nowSec = Math.floor(Date.now() / 1000);
      if (typeof claims.exp !== 'number' || claims.exp <= nowSec) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  static sha256(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  static generateRandomToken(byteLength = 32): string {
    return randomBytes(byteLength).toString('hex');
  }

  /**
   * AES-256-GCM authenticated encryption for sensitive payloads.
   */
  static encryptPayload(plainText: string, secretKeyMaterial: string): string {
    const key = createHash('sha256').update(secretKeyMaterial).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decryptPayload(cipherText: string, secretKeyMaterial: string): string {
    const [ivHex, tagHex, dataHex] = cipherText.split(':');
    const key = createHash('sha256').update(secretKeyMaterial).digest();
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * Sanitize imported text (CSV descriptions, counterparty names, notes, prompts)
   * against prompt-injection directives, CSV formula injection (=, +, -, @), and control characters.
   */
  static sanitizeImportedText(input: string): { sanitized: string; flaggedPatterns: string[] } {
    const flaggedPatterns: string[] = [];
    // eslint-disable-next-line no-control-regex
    let cleaned = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

    // Prevent spreadsheet formula execution (=CMD, +SUM, -EXEC, @IMPORT)
    if (/^[=+\-@]/.test(cleaned)) {
      flaggedPatterns.push('CSV_FORMULA_PREFIX_NEUTRALIZED');
      cleaned = `'${cleaned}`;
    }

    // Detect and neutralize prompt-injection patterns in imported financial text
    const injectionPatterns: Array<{ name: string; regex: RegExp }> = [
      {
        name: 'SYSTEM_OVERRIDE_DIRECTIVE',
        regex: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/gi,
      },
      {
        name: 'ROLE_HIJACK_DIRECTIVE',
        regex:
          /\b(system\s*prompt|you\s+are\s+now|act\s+as\s+root|bypass\s+sandbox|grant\s+admin)\b/gi,
      },
      {
        name: 'TOOL_INJECTION_DIRECTIVE',
        regex: /<\s*\/?\s*(tool_call|function_call|system|instruction)\s*>/gi,
      },
      {
        name: 'SQL_OR_SHELL_INJECTION_PATTERN',
        regex: /\b(DROP\s+TABLE|rm\s+-rf|child_process|execSync)\b/gi,
      },
    ];

    for (const pattern of injectionPatterns) {
      if (pattern.regex.test(cleaned)) {
        flaggedPatterns.push(pattern.name);
        cleaned = cleaned.replace(pattern.regex, '[REDACTED_UNSAFE_DIRECTIVE]');
      }
    }

    return { sanitized: cleaned, flaggedPatterns };
  }
}
