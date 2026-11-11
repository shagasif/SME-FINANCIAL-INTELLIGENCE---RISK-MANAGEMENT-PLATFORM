import { useState, type FormEvent } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { apiPost, ApiClientError } from '../../services/apiClient';
import type { FinancialAccount } from '../../types/financial.types';

interface NewTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: FinancialAccount[];
  orgId: string;
  onSuccess: () => void;
}

const TRANSACTION_TYPES = [
  { value: 'EXPENSE', label: 'Expense (Debit cash)' },
  { value: 'INCOME', label: 'Income (Credit cash)' },
  { value: 'TRANSFER', label: 'Account Transfer' },
];

const COMMON_CATEGORIES = [
  { value: 'Operating Expense', label: 'Operating Expense' },
  { value: 'Sales Revenue', label: 'Sales Revenue' },
  { value: 'Cloud & IT Infrastructure', label: 'Cloud & IT Infrastructure' },
  { value: 'Payroll & Compensation', label: 'Payroll & Compensation' },
  { value: 'Marketing & Advertising', label: 'Marketing & Advertising' },
  { value: 'Legal & Professional Services', label: 'Legal & Professional Services' },
  { value: 'Facilities & Rent', label: 'Facilities & Rent' },
  { value: 'Office Supplies', label: 'Office Supplies' },
  { value: 'Taxes & Regulatory', label: 'Taxes & Regulatory' },
  { value: 'Cost of Goods Sold (COGS)', label: 'Cost of Goods Sold (COGS)' },
];

export function NewTransactionModal({
  isOpen,
  onClose,
  accounts,
  orgId,
  onSuccess,
}: NewTransactionModalProps) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [type, setType] = useState('EXPENSE');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(
    () => new Date().toISOString().split('T')[0],
  );
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Operating Expense');
  const [department, setDepartment] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [reference, setReference] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setDepartment('');
    setCounterparty('');
    setReference('');
    setError(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const accountCurrency = selectedAccount?.currency || 'PKR';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accountId || !amount || !description || !transactionDate) {
      setError('Please fill in all required fields.');
      return;
    }

    const numAmount = Number.parseFloat(amount);
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      setError('Amount must be a positive decimal number greater than 0.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/organizations/${orgId}/transactions`, {
        accountId,
        type,
        amount: numAmount.toFixed(4),
        currency: accountCurrency,
        transactionDate: new Date(transactionDate).toISOString(),
        description: description.trim(),
        category,
        ...(department ? { department: department.trim() } : {}),
        ...(counterparty ? { counterparty: counterparty.trim() } : {}),
        ...(reference ? { reference: reference.trim() } : {}),
      });

      handleClose();
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError('Failed to create financial transaction.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: `${a.name} (${a.currency})`,
  }));

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Record New Transaction" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          <Select
            id="modalAccount"
            label="Financial Account *"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            options={accountOptions}
          />

          <Select
            id="modalType"
            label="Transaction Type *"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={TRANSACTION_TYPES}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="modalAmount"
            label={selectedAccount ? `Amount (${accountCurrency}) *` : 'Amount (Positive Decimal) *'}
            type="number"
            step="0.01"
            min="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            helperText={`Monetary value denominated in ${accountCurrency}`}
          />

          <Input
            id="modalDate"
            label="Transaction Date *"
            type="date"
            required
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
          />
        </div>

        <Input
          id="modalDesc"
          label="Description / Memo *"
          type="text"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Monthly cloud server hosting bill"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            id="modalCat"
            label="Category *"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={COMMON_CATEGORIES}
          />

          <Input
            id="modalCounterparty"
            label="Counterparty / Payee"
            type="text"
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="e.g. AWS, Stripe, Vendor Inc."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            id="modalDept"
            label="Department (Optional)"
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Engineering, Sales, Ops"
          />

          <Input
            id="modalRef"
            label="Reference Number (Optional)"
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. INV-1092, CHK-8801"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-subtle)]">
          <Button variant="ghost" type="button" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" isLoading={isLoading}>
            <Plus className="w-4 h-4 mr-1.5" />
            Record Transaction
          </Button>
        </div>
      </form>
    </Modal>
  );
}
