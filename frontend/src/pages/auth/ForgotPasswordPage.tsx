import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Mail, KeyRound, Moon, Sun } from '../../components/ui/MaterialSymbol';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { useTheme } from '../../hooks/useTheme';
import { AuthPageBackground } from '../../components/auth/AuthPageBackground';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SmeLogo } from '../../components/ui/SmeLogo';

export function ForgotPasswordPage() {
  const { theme, toggleTheme } = useTheme();
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
      className="auth-glass-page relative isolate min-h-screen overflow-hidden bg-[#faf9fc] text-slate-900 transition-colors duration-200 dark:bg-[#080611] dark:text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8"
    >
      <AuthPageBackground />

      <Link
        to="/login"
        className="absolute left-4 top-4 z-20 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white sm:left-6 sm:top-6"
      >
        ← Back to Sign In
      </Link>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white/80 text-slate-600 shadow-xs backdrop-blur-md transition-all hover:border-purple-300 hover:text-purple-700 dark:border-white/15 dark:bg-white/10 dark:text-white/80 dark:hover:bg-white/20 dark:hover:text-white sm:right-6 sm:top-6 cursor-pointer"
      >
        {theme === 'dark' ? (
          <Sun className="h-4 w-4 text-amber-400" />
        ) : (
          <Moon className="h-4 w-4 text-slate-700" />
        )}
      </button>

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center mb-4">
          <SmeLogo className="h-[42px] w-auto drop-shadow-xl" />
        </div>
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
          Password Recovery
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-white/60">
          Secure identity verification and credential rotation
        </p>
      </div>

      <div className="relative z-10 mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="rounded-2xl border border-slate-200/90 bg-white/85 px-6 py-8 shadow-xl shadow-purple-950/5 backdrop-blur-2xl dark:border-white/15 dark:bg-white/[0.04] dark:shadow-2xl sm:px-10">
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

          {step === 'request' && (
            <form className="space-y-5" onSubmit={handleRequestSubmit}>
              <p className="text-xs text-slate-600 dark:text-white/70 leading-relaxed">
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
                  className="text-xs text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Already have a recovery token?
                </button>
              </div>
            </form>
          )}

          {step === 'sent' && (
            <div className="text-center py-2 space-y-4">
              <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-400 mx-auto flex items-center justify-center">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Check Your Inbox</h2>
              <p className="text-xs text-slate-600 dark:text-white/70 leading-relaxed">
                If an active account exists for <strong className="text-slate-900 dark:text-white">{email}</strong>,
                we have emailed a secure password reset link. Please check your inbox and click the
                link within <strong>30 minutes</strong>.
              </p>
              <div className="p-3 rounded-xl bg-slate-100/80 border border-slate-200/80 text-slate-700 dark:bg-white/[0.05] dark:border-white/10 dark:text-white/70 text-xs text-left">
                <strong className="text-slate-900 dark:text-white">Can't find the email?</strong>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  <li>Check your spam or junk folder.</li>
                  <li>Verify that your email address was typed correctly.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setStep('request')}
                  className="text-xs text-[var(--accent-primary)] hover:underline dark:text-[var(--accent-teal)] cursor-pointer"
                >
                  Send to a different email address
                </button>
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="text-xs text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white cursor-pointer"
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
                className="w-full text-center text-xs text-slate-600 hover:text-slate-900 dark:text-white/60 dark:hover:text-white cursor-pointer"
              >
                &larr; Back to request link
              </button>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200/80 dark:border-white/10 text-center text-xs">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-primary)] hover:underline dark:text-[var(--accent-teal)]"
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
