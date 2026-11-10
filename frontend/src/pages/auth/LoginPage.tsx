import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { ApiClientError } from '../../services/apiClient';

interface LocationState {
  from?: { pathname: string };
}

const DEMO_ACCOUNTS = [
  {
    role: 'BUSINESS_OWNER',
    label: 'Business Owner',
    email: 'owner@apex.local',
    badge: 'Executive',
    desc: 'Full company oversight & approval authority',
  },
  {
    role: 'FINANCE_MANAGER',
    label: 'Finance Manager',
    email: 'finance@apex.local',
    badge: 'Controller',
    desc: 'Ledger mutations, budgets & AI workflows',
  },
  {
    role: 'ACCOUNTANT',
    label: 'Accountant',
    email: 'accountant@apex.local',
    badge: 'Accounting',
    desc: 'Invoices, bills & double-entry reconciliation',
  },
  {
    role: 'OPERATIONS_MANAGER',
    label: 'Operations Manager',
    email: 'ops@apex.local',
    badge: 'Ops',
    desc: 'Bill approvals & departmental budgets',
  },
  {
    role: 'FINANCIAL_ANALYST',
    label: 'Financial Analyst',
    email: 'analyst@apex.local',
    badge: 'Analysis',
    desc: 'Forecasts, scenarios & risk monitoring',
  },
  {
    role: 'AUDITOR',
    label: 'Auditor',
    email: 'auditor@apex.local',
    badge: 'Read-Only',
    desc: 'Read-only compliance inspection & audit logs',
  },
  {
    role: 'PLATFORM_ADMIN',
    label: 'Platform Admin',
    email: 'admin@platform.local',
    badge: 'Admin',
    desc: 'Tenant provisioning & platform settings',
  },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [persist, setPersist] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(true);

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

  const handleSelectDemoAccount = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[var(--accent-primary)] text-white font-bold text-xl shadow-lg mb-4">
          SME
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          Financial Intelligence & Risk Platform
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Autonomous AI Multi-Agent Risk Monitoring & Executive Decision Engine
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
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
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

          {/* Authorized Demo Credentials Panel */}
          <div className="mt-6 pt-6 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setShowDemoAccounts(!showDemoAccounts)}
              className="w-full flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Authorized Demo Accounts (7 RBAC Roles)</span>
              </div>
              <span className="text-[11px] text-[var(--accent-teal)]">
                {showDemoAccounts ? 'Hide' : 'Show'}
              </span>
            </button>

            {showDemoAccounts && (
              <div className="mt-3.5 space-y-2">
                <p className="text-[11px] text-[var(--text-muted)] mb-2">
                  Select an authorized demo role to autofill verified test credentials:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_ACCOUNTS.map((acc) => {
                    const isCurrent = email === acc.email;
                    return (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => handleSelectDemoAccount(acc.email)}
                        className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer ${
                          isCurrent
                            ? 'border-[var(--accent-teal)] bg-[var(--surface-elevated)] ring-1 ring-[var(--accent-teal)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-canvas)]/50 hover:bg-[var(--surface-elevated)]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {acc.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-mono uppercase bg-[var(--surface-card)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                            {acc.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--text-muted)] truncate mt-0.5">
                          {acc.email}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

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
