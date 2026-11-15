import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail, KeyRound } from 'lucide-react';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { AuthPageBackground } from '../../components/auth/AuthPageBackground';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<'request' | 'sent' | 'confirm'>('request');
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
      setStep('sent');
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
    <div
      data-theme="dark"
      className="auth-glass-page relative isolate min-h-screen overflow-hidden bg-[#080611] flex flex-col justify-center py-12 sm:px-6 lg:px-8"
    >
      <AuthPageBackground />

      <Link
        to="/login"
        className="absolute left-4 top-4 z-20 text-xs text-white/60 transition-colors hover:text-white sm:left-6 sm:top-6"
      >
        ← Back to Sign In
      </Link>

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xl shadow-lg mb-4">
          SME
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Password Recovery
        </h1>
        <p className="mt-1.5 text-xs text-white/60">
          Secure identity verification and credential rotation
        </p>
      </div>

      <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="rounded-2xl border border-white/15 bg-white/[0.04] px-6 py-8 shadow-2xl backdrop-blur-2xl sm:px-10">
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-xs"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{successMessage}</span>
            </div>
          )}

          {step === 'request' && (
            <form className="space-y-5" onSubmit={handleRequestSubmit}>
              <p className="text-xs text-white/70 leading-relaxed">
                Enter your registered work email address below. If an active account matches, we
                will send a secure password reset link valid for 30 minutes.
              </p>

              <Input
                id="email"
                label="Registered Work Email"
                type="email"
                required
                className="auth-glass-input"
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
                Send Reset Link
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="text-xs text-white/60 hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Already have a recovery token?
                </button>
              </div>
            </form>
          )}

          {step === 'sent' && (
            <div className="text-center py-2 space-y-4">
              <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 mx-auto flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-white">Check Your Inbox</h2>
              <p className="text-xs text-white/70 leading-relaxed">
                If an active account exists for <strong className="text-white">{email}</strong>,
                we have emailed a secure password reset link. Please check your inbox and click the
                link within <strong>30 minutes</strong>.
              </p>
              <div className="p-3 rounded-xl bg-white/[0.05] border border-white/10 text-white/70 text-xs text-left">
                <strong className="text-white">Can't find the email?</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Check your spam or junk folder.</li>
                  <li>Verify that your email address was typed correctly.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="text-xs text-[var(--accent-teal)] hover:underline cursor-pointer"
                >
                  Send to a different email address
                </button>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="text-xs text-white/60 hover:text-white cursor-pointer"
                >
                  Or enter token manually
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <form className="space-y-5" onSubmit={handleConfirmSubmit}>
              <Input
                id="token"
                label="Recovery Token"
                type="text"
                required
                className="auth-glass-input"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token received via email"
              />

              <Input
                id="newPassword"
                label="New Secure Password"
                type="password"
                required
                className="auth-glass-input"
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
                className="w-full text-center text-xs text-white/60 hover:text-white cursor-pointer"
              >
                &larr; Back to request link
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-white/10 text-center text-xs">
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
