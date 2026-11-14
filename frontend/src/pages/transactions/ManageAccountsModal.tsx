import { useState, type FormEvent } from 'react';
import {
  AlertCircle,
  Archive,
  Building2,
  CheckCircle2,
  Plus,
  Wallet,
} from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { apiDelete, apiPost, ApiClientError } from '../../services/apiClient';
import { formatCurrency } from '../../utils/formatters';
import type { FinancialAccount } from '../../types/financial.types';

interface ManageAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: FinancialAccount[];
  orgId: string;
  defaultCurrency?: string;
  onSuccess: () => void;
  onSelectAccount?: (account: FinancialAccount) => void;
}

const ACCOUNT_TYPES = [
  { value: 'BANK', label: 'Bank Account (Checking / Deposit / Reserve)' },
  { value: 'CASH', label: 'Cash / Petty Cash' },
  { value: 'CREDIT_CARD', label: 'Credit Card / Revolving Credit' },
  { value: 'ACCOUNTS_RECEIVABLE', label: 'Accounts Receivable (AR Asset)' },
  { value: 'ACCOUNTS_PAYABLE', label: 'Accounts Payable (AP Liability)' },
  { value: 'SHORT_TERM_DEBT', label: 'Short-Term Debt / Line of Credit' },
];

const CURRENCIES = [
  { value: 'PKR', label: 'PKR - Pakistani Rupee (₨)' },
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

interface AccountPreset {
  label: string;
  name: string;
  type: string;
  currency?: string;
}

export function ManageAccountsModal({
  isOpen,
  onClose,
  accounts,
  orgId,
  defaultCurrency = 'PKR',
  onSuccess,
  onSelectAccount,
}: ManageAccountsModalProps) {
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE'>('LIST');

  // New Account Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState('BANK');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [openingBalance, setOpeningBalance] = useState('0.00');
  const [institution, setInstitution] = useState('');
  const [isLiquid, setIsLiquid] = useState(true);

  // Status & Feedback
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const presets: AccountPreset[] = [
    { label: 'Operating Account', name: 'Primary Operating Account', type: 'BANK' },
    { label: 'Payroll Reserve', name: 'Payroll Reserve', type: 'BANK' },
    { label: 'Savings Account', name: 'Business Savings Reserve', type: 'BANK' },
    { label: 'Petty Cash', name: 'Petty Cash / Cash on Hand', type: 'CASH' },
    {
      label: 'Foreign Currency (USD)',
      name: 'USD Foreign Currency Account',
      type: 'BANK',
      currency: 'USD',
    },
    {
      label: 'Foreign Currency (GBP)',
      name: 'GBP Foreign Currency Account',
      type: 'BANK',
      currency: 'GBP',
    },
  ];

  const applyPreset = (preset: AccountPreset) => {
    setName(preset.name);
    setType(preset.type);
    if (preset.currency) {
      setCurrency(preset.currency);
    }
  };

  const resetForm = () => {
    setName('');
    setCode('');
    setType('BANK');
    setCurrency(defaultCurrency);
    setOpeningBalance('0.00');
    setInstitution('');
    setIsLiquid(true);
    setError(null);
  };

  const handleCreateAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Account name is strictly required.');
      return;
    }

    const numBalance = Number.parseFloat(openingBalance);
    if (Number.isNaN(numBalance)) {
      setError('Opening balance must be a valid numeric amount.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/organizations/${orgId}/accounts`, {
        name: name.trim(),
        ...(code.trim() ? { code: code.trim() } : {}),
        type,
        currency,
        openingBalance: numBalance.toFixed(4),
        ...(institution.trim() ? { institution: institution.trim() } : {}),
        isLiquid,
      });

      setSuccessNotice(`Financial account "${name.trim()}" successfully created.`);
      resetForm();
      setActiveTab('LIST');
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to create financial account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchiveAccount = async (accountId: string, accountName: string) => {
    if (
      !window.confirm(
        `Are you sure you want to archive "${accountName}"? Historical transactions will remain preserved.`,
      )
    ) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiDelete(`/v1/organizations/${orgId}/accounts/${accountId}`);
      setSuccessNotice(`Account "${accountName}" archived successfully.`);
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to archive financial account.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    setSuccessNotice(null);
    setActiveTab('LIST');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Financial Accounts & Chart of Accounts"
      size="xl"
    >
      <div className="space-y-5">
        {/* Top Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('LIST');
                setError(null);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'LIST'
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              }`}
            >
              All Accounts ({accounts.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('CREATE');
                setError(null);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'CREATE'
                  ? 'bg-[var(--accent-primary)] text-white shadow-xs'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)]'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Financial Account
            </button>
          </div>

          <span className="text-[11px] text-[var(--text-muted)] font-mono">
            Base: {defaultCurrency}
          </span>
        </div>

        {/* Feedback Alerts */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-xs"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {successNotice && (
          <div
            role="status"
            className="flex items-start gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{successNotice}</span>
          </div>
        )}

        {/* TAB 1: ACCOUNTS LIST */}
        {activeTab === 'LIST' && (
          <div className="space-y-4">
            {accounts.length === 0 ? (
              <div className="py-12 text-center rounded-2xl border-2 border-dashed border-[var(--border-subtle)] p-6 space-y-3">
                <Wallet className="w-10 h-10 text-[var(--text-muted)] mx-auto opacity-50" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  No Financial Accounts Configured
                </h3>
                <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
                  Configure your primary operating checking, payroll reserve, savings, or cash
                  accounts to begin ledger tracking.
                </p>
                <Button variant="primary" size="sm" onClick={() => setActiveTab('CREATE')}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Create First Account
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {onSelectAccount && (
                  <p className="text-[11px] text-[var(--text-muted)] italic">
                    Tip: Click any account row to filter the ledger and KPI summary to that account.
                  </p>
                )}
                <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--surface-elevated)] text-[var(--text-muted)]">
                      <tr>
                        <th className="px-3 py-2.5">Code</th>
                        <th className="px-3 py-2.5">Account Name & Institution</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Currency</th>
                        <th className="px-3 py-2.5 text-right">Opening Balance</th>
                        <th className="px-3 py-2.5 text-right">Current Balance</th>
                        <th className="px-3 py-2.5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-card)]">
                      {accounts.map((acc) => (
                        <tr
                          key={acc.id}
                          onClick={() => {
                            if (onSelectAccount) {
                              onSelectAccount(acc);
                              handleClose();
                            }
                          }}
                          onKeyDown={(e) => {
                            if (onSelectAccount && (e.key === 'Enter' || e.key === ' ')) {
                              e.preventDefault();
                              onSelectAccount(acc);
                              handleClose();
                            }
                          }}
                          role={onSelectAccount ? 'button' : undefined}
                          tabIndex={onSelectAccount ? 0 : undefined}
                          className={`transition-colors ${
                            onSelectAccount
                              ? 'cursor-pointer hover:bg-[var(--surface-elevated)]/70 hover:border-l-4 hover:border-l-[var(--accent-teal)] focus:outline-hidden focus:bg-[var(--surface-elevated)]/70'
                              : 'hover:bg-[var(--surface-elevated)]/30'
                          }`}
                          title={onSelectAccount ? `Filter ledger by ${acc.name}` : undefined}
                        >
                          <td className="px-3 py-3 font-mono font-bold text-[var(--text-secondary)]">
                            {acc.code || '—'}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-semibold text-[var(--text-primary)]">{acc.name}</div>
                            {acc.institution && (
                              <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                                <Building2 className="w-3 h-3 opacity-70" />
                                <span>{acc.institution}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                              {acc.type || acc.accountType || 'BANK'}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono font-bold">
                            <span className="px-2 py-0.5 rounded text-[10px] bg-[var(--accent-teal)]/10 text-[var(--accent-teal)] border border-[var(--accent-teal)]/20">
                              {acc.currency}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-[var(--text-muted)]">
                            {formatCurrency(acc.openingBalance, acc.currency)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-bold text-[var(--text-primary)]">
                            {formatCurrency(acc.currentBalance, acc.currency)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveAccount(acc.id, acc.name);
                              }}
                              disabled={isLoading}
                              className="p-1 rounded-md text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Archive Account"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CREATE NEW ACCOUNT */}
        {activeTab === 'CREATE' && (
          <form onSubmit={handleCreateAccount} className="space-y-4">
            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                Quick Template Presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2.5 py-1 rounded-lg text-xs border border-[var(--border-subtle)] bg-[var(--surface-elevated)]/50 hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] transition-colors cursor-pointer"
                  >
                    + {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="accName"
                label="Account Name *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Primary Operating Checking"
                required
                helperText="Descriptive ledger name"
              />

              <Input
                id="accCode"
                label="Account Code (Optional)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Auto-generated if left blank (e.g. 1010)"
                helperText="Chart of accounts classification code"
              />

              <Select
                id="accType"
                label="Account Type *"
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={ACCOUNT_TYPES}
                helperText="Classification in financial statements"
              />

              <Select
                id="accCurrency"
                label="Account Currency *"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={CURRENCIES}
                helperText="Denominated ISO 4217 currency"
              />

              <Input
                id="accOpeningBalance"
                label="Opening Balance *"
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                required
                helperText="Initial opening balance before recorded transactions"
              />

              <Input
                id="accInstitution"
                label="Financial Institution / Bank (Optional)"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. Meezan Bank, HBL, Standard Chartered"
                helperText="Name of depository bank or cash custodian"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="accIsLiquid"
                type="checkbox"
                checked={isLiquid}
                onChange={(e) => setIsLiquid(e.target.checked)}
                className="rounded border-[var(--border-subtle)] text-[var(--accent-teal)]"
              />
              <label htmlFor="accIsLiquid" className="text-xs text-[var(--text-secondary)] cursor-pointer">
                Liquid Cash Account (included in real-time runway calculations and cash flow forecasts)
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-subtle)]">
              <Button variant="ghost" type="button" onClick={() => setActiveTab('LIST')}>
                Back to List
              </Button>
              <Button variant="primary" type="submit" isLoading={isLoading}>
                <Plus className="w-4 h-4 mr-1.5" />
                Create Account
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
