import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ApiClientError } from '../../services/apiClient';

interface LocationState {
  from?: { pathname: string };
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [persist, setPersist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please provide both email and password.');
      return;
    }

    setError(null);
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
    <div className="min-h-screen bg-[var(--surface-canvas)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xl shadow-lg mb-4">
          SME
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Financial Intelligence &amp; Risk Platform
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Autonomous AI Multi-Agent Risk Monitoring &amp; Executive Decision Engine
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        <div className="bg-[var(--surface-card)] py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-[var(--border-subtle)]">
          <form className="space-y-5" onSubmit={handleSubmit}>
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none p-1 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={persist}
                  onChange={(e) => setPersist(e.target.checked)}
                  className="rounded border-[var(--border-subtle)] text-[var(--accent-teal)] focus:ring-[var(--accent-teal)] cursor-pointer"
                />
                <span>Remember me on this device</span>
              </label>

              <Link
                to="/forgot-password"
                className="font-medium text-[var(--accent-teal)] hover:underline"
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

          <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Need a new company workspace?{' '}
            <Link
              to="/register"
              className="font-semibold text-[var(--accent-teal)] hover:underline"
            >
              Register organization
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
