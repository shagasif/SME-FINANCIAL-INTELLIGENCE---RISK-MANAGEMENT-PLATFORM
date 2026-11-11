import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { apiPost, authStorage, ApiClientError } from '../../services/apiClient';
import { type AuthSessionPayload } from '../../types/auth.types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';

const COUNTRIES = [
  { value: 'Pakistan', label: 'Pakistan (PKR)' },
  { value: 'United States', label: 'United States (USD)' },
  { value: 'United Kingdom', label: 'United Kingdom (GBP)' },
  { value: 'European Union', label: 'European Union (EUR)' },
  { value: 'United Arab Emirates', label: 'United Arab Emirates (AED)' },
  { value: 'Canada', label: 'Canada (CAD)' },
  { value: 'Australia', label: 'Australia (AUD)' },
  { value: 'Saudi Arabia', label: 'Saudi Arabia (SAR)' },
  { value: 'Singapore', label: 'Singapore (SGD)' },
  { value: 'Other', label: 'Other Country / Region' },
];

const CURRENCIES = [
  { value: 'PKR', label: 'PKR - Pakistani Rupee (₨ / Rs)' },
  { value: 'USD', label: 'USD - United States Dollar ($)' },
  { value: 'EUR', label: 'EUR - Euro (€)' },
  { value: 'GBP', label: 'GBP - British Pound (£)' },
  { value: 'AED', label: 'AED - UAE Dirham (AED)' },
  { value: 'CAD', label: 'CAD - Canadian Dollar ($)' },
  { value: 'AUD', label: 'AUD - Australian Dollar ($)' },
  { value: 'SAR', label: 'SAR - Saudi Riyal (SAR)' },
  { value: 'JPY', label: 'JPY - Japanese Yen (¥)' },
  { value: 'SGD', label: 'SGD - Singapore Dollar ($)' },
];

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  Pakistan: 'PKR',
  'United States': 'USD',
  'United Kingdom': 'GBP',
  'European Union': 'EUR',
  'United Arab Emirates': 'AED',
  Canada: 'CAD',
  Australia: 'AUD',
  'Saudi Arabia': 'SAR',
  Singapore: 'SGD',
};

export function RegisterPage() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [organizationName, setOrganizationName] = useState('');
  const [country, setCountry] = useState('Pakistan');
  const [baseCurrency, setBaseCurrency] = useState('PKR');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCountryChange = (selectedCountry: string) => {
    setCountry(selectedCountry);
    const matchedCurrency = COUNTRY_TO_CURRENCY[selectedCountry];
    if (matchedCurrency) {
      setBaseCurrency(matchedCurrency);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !password || !confirmPassword || !organizationName) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please ensure both passwords match.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const session = await apiPost<AuthSessionPayload>('/v1/auth/register', {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        organizationName: organizationName.trim(),
        country,
        baseCurrency,
      });

      // Save token and navigate
      authStorage.setToken(session.accessToken, true);
      if (session.organization?.id) {
        authStorage.setActiveOrgId(session.organization.id);
      }
      navigate('/overview', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message || 'Registration failed. Please try a different email.');
      } else {
        setError('Network error: unable to reach the platform service.');
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
          Create SME Workspace
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          Autonomous multi-agent financial risk monitoring & intelligence engine
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl px-4 sm:px-0">
        <div className="bg-[var(--surface-card)] py-8 px-6 sm:px-10 shadow-lg rounded-2xl border border-[var(--border-subtle)]">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="fullName"
                label="Full Name"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
              />

              <Input
                id="email"
                label="Work Email Address"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="password"
                label="Password (min 8 characters)"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                helperText="Min. 8 characters"
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

              <Input
                id="confirmPassword"
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                helperText="Must match password"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors focus:outline-none p-1 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </div>

            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Organization Profile
              </h2>

              <Input
                id="orgName"
                label="Company / Legal Entity Name"
                type="text"
                required
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Apex Manufacturing Ltd."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  id="country"
                  label="Country / Jurisdiction"
                  value={country}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  options={COUNTRIES}
                  helperText="Determines regional regulatory & default currency"
                />

                <Select
                  id="currency"
                  label="Base Reporting Currency"
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  options={CURRENCIES}
                  helperText="Primary currency for ledger entries and runway metrics"
                />
              </div>
            </div>

            <div className="pt-3">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full justify-center"
                isLoading={isSubmitting}
              >
                Create Workspace & Sign In
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </form>

          <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-[var(--accent-teal)] hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
