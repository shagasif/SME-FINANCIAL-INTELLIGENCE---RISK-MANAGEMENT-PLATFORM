import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRequestSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide your account email address.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      await apiPost('/v1/auth/password-reset/request', { email: email.trim().toLowerCase() });
      setSuccessMessage(
        'If an account exists with this email, a reset token has been issued. Please check your email or proceed below to enter your recovery token.',
      );
      setStep('confirm');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Network error: unable to send password recovery request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !newPassword) {
      setError('Please provide both the reset token and your new password.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await apiPost('/v1/auth/password-reset/confirm', { token: token.trim(), newPassword });
      setSuccessMessage(
        'Your password has been successfully reset. You may now sign in with your new credentials.',
      );
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message || 'Invalid or expired recovery token.');
      } else {
        setError('Network error: unable to confirm password reset.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xl shadow-lg mb-4">
          SME
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Password Recovery
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Secure identity verification and credential rotation
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-[var(--surface-card)] py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-[var(--border-subtle)]">
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMessage}</span>
            </div>
          )}

          {step === 'request' ? (
            <form className="space-y-5" onSubmit={handleRequestSubmit}>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Enter your registered work email address below to receive an authorized security
                token for resetting your password.
              </p>

              <Input
                id="email"
                label="Registered Work Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center"
                isLoading={isSubmitting}
              >
                Request Recovery Token
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleConfirmSubmit}>
              <Input
                id="token"
                label="Recovery Token"
                type="text"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token received via email/admin"
              />

              <Input
                id="newPassword"
                label="New Secure Password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                helperText="Minimum 8 characters"
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center"
                isLoading={isSubmitting}
              >
                Update Password & Invalidate Sessions
              </Button>

              <button
                type="button"
                onClick={() => setStep('request')}
                className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Did not receive a token? Try another email
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-[var(--border-subtle)] text-center text-xs">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-teal)] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
