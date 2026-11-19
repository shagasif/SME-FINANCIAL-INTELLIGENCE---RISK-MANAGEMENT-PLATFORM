import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Eye, EyeOff, Moon, Sun } from '../../components/ui/MaterialSymbol';
import { apiPost, ApiClientError } from '../../services/apiClient';
import { useTheme } from '../../hooks/useTheme';
import { AuthPageBackground } from '../../components/auth/AuthPageBackground';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SmeLogo } from '../../components/ui/SmeLogo';

export function ResetPasswordPage() {
  const { theme, toggleTheme } = useTheme();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token')?.trim() || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const effectiveToken = token.trim();

    if (!effectiveToken) {
      setError('Please provide a valid password reset token.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('The passwords do not match. Please ensure both fields are identical.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await apiPost('/v1/auth/password-reset/confirm', {
        token: effectiveToken,
        newPassword,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(
          err.message ||
            'This password reset link is invalid or has expired. Please request a new one.',
        );
      } else {
        setError('Network error: unable to update password. Please check your connection.');
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
          Set New Password
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-white/60">
          Choose a secure password for your SME Financial Intelligence account
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
              <div className="flex-1">
                <span className="leading-relaxed">{error}</span>
                <div className="mt-2">
                  <Link
                    to="/forgot-password"
                    className="font-semibold underline hover:no-underline text-red-600 dark:text-red-300"
                  >
                    Request a new password reset link &rarr;
                  </Link>
                </div>
              </div>
            </div>
          )}

          {isSuccess ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Password Successfully Reset
              </h2>
              <p className="text-xs text-slate-600 dark:text-white/70 leading-relaxed mb-6">
                Your credentials have been securely updated and all previous sessions have been
                revoked. You can now sign in with your new password.
              </p>
              <Link to="/login">
                <Button variant="primary" size="lg" className="w-full justify-center">
                  Sign In to Your Account
                </Button>
              </Link>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {!tokenFromUrl && (
                <Input
                  id="token"
                  label="Reset Token"
                  type="text"
                  required
                  className="auth-glass-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste token from email link"
                  helperText="Enter the verification token provided in your reset email"
                />
              )}

              <div className="relative">
                <Input
                  id="newPassword"
                  label="New Secure Password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  className="auth-glass-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••••"
                  helperText="Must be at least 8 characters long"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-8 text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <Input
                id="confirmPassword"
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                required
                className="auth-glass-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                helperText="Re-enter the same password to confirm"
              />

              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full justify-center"
                  isLoading={isSubmitting}
                >
                  <Lock className="w-4 h-4 mr-1.5" />
                  Save New Password
                </Button>
              </div>
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
