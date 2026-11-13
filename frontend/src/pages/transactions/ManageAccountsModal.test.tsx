import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClient from '../../services/apiClient';
import { ManageAccountsModal } from './ManageAccountsModal';
import type { FinancialAccount } from '../../types/financial.types';

vi.mock('../../services/apiClient', () => {
  return {
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiDelete: vi.fn(),
    ApiClientError: class ApiClientError extends Error {
      statusCode?: number;
      constructor(message: string, statusCode?: number) {
        super(message);
        this.statusCode = statusCode;
      }
    },
  };
});

const mockAccounts: FinancialAccount[] = [
  {
    id: 'acc-pkr-1',
    organizationId: 'org-pk-1',
    code: '1010',
    name: 'Primary Operating Checking',
    accountType: 'BANK',
    currency: 'PKR',
    openingBalance: '250000.0000',
    currentBalance: '1500000.0000',
    institution: 'Meezan Bank Ltd',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'acc-usd-1',
    organizationId: 'org-pk-1',
    code: '1040',
    name: 'USD Export Proceeds Account',
    accountType: 'BANK',
    currency: 'USD',
    openingBalance: '5000.0000',
    currentBalance: '35000.0000',
    institution: 'Standard Chartered Pakistan',
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('ManageAccountsModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const orgId = 'org-pk-1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all accounts and formats each account with its specific currency', () => {
    render(
      <ManageAccountsModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        defaultCurrency="PKR"
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.getByText('Financial Accounts & Chart of Accounts')).toBeInTheDocument();
    expect(screen.getByText('All Accounts (2)')).toBeInTheDocument();

    // Verify PKR account
    expect(screen.getByText('Primary Operating Checking')).toBeInTheDocument();
    expect(screen.getByText('Meezan Bank Ltd')).toBeInTheDocument();
    expect(screen.getByText('1010')).toBeInTheDocument();
    expect(screen.getAllByText('PKR').length).toBeGreaterThanOrEqual(1);

    // Verify USD account
    expect(screen.getByText('USD Export Proceeds Account')).toBeInTheDocument();
    expect(screen.getByText('Standard Chartered Pakistan')).toBeInTheDocument();
    expect(screen.getByText('1040')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('switches to create account tab and applies preset templates', () => {
    render(
      <ManageAccountsModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        defaultCurrency="PKR"
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Financial Account/i }));

    expect(screen.getByLabelText(/Account Name \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Account Type \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Account Currency \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Opening Balance \*/i)).toBeInTheDocument();

    // Default currency should be PKR for Pakistan-based organization
    const currencySelect = screen.getByLabelText(/Account Currency \*/i) as HTMLSelectElement;
    expect(currencySelect.value).toBe('PKR');

    // Click preset "+ Foreign Currency (USD)"
    const usdPresetBtn = screen.getByRole('button', { name: /\+ Foreign Currency \(USD\)/i });
    fireEvent.click(usdPresetBtn);

    const nameInput = screen.getByLabelText(/Account Name \*/i) as HTMLInputElement;
    expect(nameInput.value).toBe('USD Foreign Currency Account');
    expect(currencySelect.value).toBe('USD');
  });

  it('submits new financial account with custom details and triggers onSuccess', async () => {
    const mockPost = vi.mocked(apiClient.apiPost).mockResolvedValueOnce({
      id: 'acc-new-1',
      organizationId: orgId,
      code: '1050',
      name: 'Habib Bank Operating Account',
      type: 'BANK',
      currency: 'PKR',
      openingBalance: '50000.0000',
      currentBalance: '50000.0000',
      institution: 'Habib Bank Limited (HBL)',
      isLiquid: true,
      isArchived: false,
    });

    render(
      <ManageAccountsModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        defaultCurrency="PKR"
        onSuccess={mockOnSuccess}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Financial Account/i }));

    fireEvent.change(screen.getByLabelText(/Account Name \*/i), {
      target: { value: 'Habib Bank Operating Account' },
    });
    fireEvent.change(screen.getByLabelText(/Account Code/i), {
      target: { value: '1050' },
    });
    fireEvent.change(screen.getByLabelText(/Financial Institution/i), {
      target: { value: 'Habib Bank Limited (HBL)' },
    });
    fireEvent.change(screen.getByLabelText(/Opening Balance \*/i), {
      target: { value: '50000.00' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(`/v1/organizations/${orgId}/accounts`, {
        name: 'Habib Bank Operating Account',
        code: '1050',
        type: 'BANK',
        currency: 'PKR',
        openingBalance: '50000.0000',
        institution: 'Habib Bank Limited (HBL)',
        isLiquid: true,
      });
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('archives an account upon user confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const mockDelete = vi.mocked(apiClient.apiDelete).mockResolvedValueOnce({
      id: 'acc-pkr-1',
      isArchived: true,
    });

    render(
      <ManageAccountsModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        defaultCurrency="PKR"
        onSuccess={mockOnSuccess}
      />,
    );

    const archiveButtons = screen.getAllByTitle('Archive Account');
    fireEvent.click(archiveButtons[0]);

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith(`/v1/organizations/${orgId}/accounts/acc-pkr-1`);
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it('calls onSelectAccount and closes modal when an account row is clicked', () => {
    const mockOnSelectAccount = vi.fn();

    render(
      <ManageAccountsModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        defaultCurrency="PKR"
        onSuccess={mockOnSuccess}
        onSelectAccount={mockOnSelectAccount}
      />,
    );

    const row = screen.getByRole('button', { name: /Primary Operating Checking/i });
    fireEvent.click(row);

    expect(mockOnSelectAccount).toHaveBeenCalledWith(mockAccounts[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
