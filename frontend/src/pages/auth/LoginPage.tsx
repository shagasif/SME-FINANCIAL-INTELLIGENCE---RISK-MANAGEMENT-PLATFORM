import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Moon, Sun } from '../../components/ui/MaterialSymbol';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { AuthPageBackground } from '../../components/auth/AuthPageBackground';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { SmeLogo } from '../../components/ui/SmeLogo';
import { ApiClientError } from '../../services/apiClient';

interface LocationState {
  from?: { pathname: string };
  registeredEmail?: string;
  successMessage?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const locationState = location.state as LocationState | undefined;
  const [email, setEmail] = useState(locationState?.registeredEmail || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [persist, setPersist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(
    locationState?.successMessage || null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      await login({ email: email.trim(), password }, persist);
      const state = location.state as LocationState | undefined;
      const destination = state?.from?.pathname || '/overview';
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setError('Invalid email or password. Please verify your credentials.');
        } else if (err.statusCode === 429) {
          setError('Too many login attempts. Please wait a moment before trying again.');
        } else {
          setError(err.message || 'Authentication failed. Please try again.');
        }
      } else {
        setError('Network error: unable to connect to the authentication service.');
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
        to="/"
        className="absolute left-4 top-4 z-20 text-xs font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-white/60 dark:hover:text-white sm:left-6 sm:top-6"
      >
        ← Back to Home
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

      <div className="relative z-10 text-center sm:mx-auto sm:w-full sm:max-w-md">
        <div className="inline-flex items-center justify-center mb-4">
          <SmeLogo className="h-[42px] w-auto drop-shadow-xl" />
        </div>
        <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
          Clarity &amp; Risk Platform
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-600 dark:text-white/60">
          Sign in to your financial intelligence &amp; risk workspace.
        </p>
      </div>

      <div className="relative z-10 mt-8 px-4 sm:mx-auto sm:w-full sm:max-w-xl sm:px-0">
        <div className="rounded-2xl border border-slate-200/90 bg-white/85 px-6 py-8 shadow-xl shadow-purple-950/5 backdrop-blur-2xl dark:border-white/15 dark:bg-white/[0.04] dark:shadow-2xl sm:px-10">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {successMessage && (
              <div
                role="status"
                className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{successMessage}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <Input
              id="email"
              label="Work Email Address"
              type="email"
              autoComplete="email"
              required
              className="auth-glass-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />

            <Input
              id="password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              className="auth-glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-slate-500 hover:text-slate-800 dark:text-[var(--text-muted)] dark:hover:text-[var(--text-primary)] transition-colors focus:outline-none p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-600 dark:text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                  className="rounded border-slate-300 dark:border-[var(--border-subtle)] text-[var(--accent-teal)] focus:ring-[var(--accent-teal)] cursor-pointer"
                />
                <span>Remember me on this device</span>
              </label>

              <Link
                to="/forgot-password"
                className="font-medium text-[var(--accent-primary)] hover:underline dark:text-[var(--accent-teal)]"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full justify-center"
              isLoading={isSubmitting}
            >
              Sign In to Workspace
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>

          <div className="mt-6 text-center text-xs text-slate-600 dark:text-[var(--text-muted)]">
            Need a new company workspace?{' '}
            <Link
              to="/register"
              className="font-semibold text-[var(--accent-primary)] hover:underline dark:text-[var(--accent-teal)]"
            >
              Register organization
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
