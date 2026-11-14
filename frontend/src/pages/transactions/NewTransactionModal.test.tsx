import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewTransactionModal } from './NewTransactionModal';
import type { FinancialAccount } from '../../types/financial.types';

const USD_ACCOUNT = {
  id: 'acc-usd-1010',
  code: '1010',
  name: 'USD Foreign Currency Account',
  type: 'BANK',
  currency: 'USD',
  openingBalance: '0.0000',
  currentBalance: '0.0000',
  isLiquid: true,
  isArchived: false,
} as unknown as FinancialAccount;

const PKR_ACCOUNT = {
  id: 'acc-pkr-1020',
  code: '1020',
  name: 'Business Savings Reserve',
  type: 'BANK',
  currency: 'PKR',
  openingBalance: '0.0000',
  currentBalance: '2615100.0000',
  isLiquid: true,
  isArchived: false,
} as unknown as FinancialAccount;

const noop = () => {};

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => ({ id: 'tx-new' }),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

function lastPostBody(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'POST');
  return JSON.parse(String((call?.[1] as RequestInit).body));
}

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '12.50' } });
  fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Currency test' } });
}

describe('NewTransactionModal account currency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('regression: initializes account + USD currency when accounts load after page mount', async () => {
    const fetchMock = mockFetchOk();
    const onSuccess = vi.fn();

    // Real page flow: modal is mounted while accounts are still loading ([]).
    const { rerender } = render(
      <NewTransactionModal isOpen={false} onClose={noop} accounts={[]} orgId="org-star" onSuccess={onSuccess} />,
    );
    rerender(
      <NewTransactionModal
        isOpen
        onClose={noop}
        accounts={[USD_ACCOUNT, PKR_ACCOUNT]}
        orgId="org-star"
        onSuccess={onSuccess}
      />,
    );

    const select = screen.getByLabelText(/Financial Account/i) as HTMLSelectElement;
    expect(select.value).toBe('acc-usd-1010');
    expect(screen.getByText('Monetary value denominated in USD')).toBeInTheDocument();
    expect(screen.queryByText(/denominated in PKR/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Amount (USD) *')).toBeInTheDocument();

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Record Transaction/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = lastPostBody(fetchMock);
    expect(body.accountId).toBe('acc-usd-1010');
    expect(body.currency).toBe('USD');
  });

  it('switches currency between USD and PKR accounts and submits the PKR currency', async () => {
    const fetchMock = mockFetchOk();
    const onSuccess = vi.fn();
    render(
      <NewTransactionModal
        isOpen
        onClose={noop}
        accounts={[USD_ACCOUNT, PKR_ACCOUNT]}
        orgId="org-star"
        onSuccess={onSuccess}
      />,
    );

    const select = screen.getByLabelText(/Financial Account/i);
    fireEvent.change(select, { target: { value: 'acc-pkr-1020' } });
    expect(screen.getByText('Monetary value denominated in PKR')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'acc-usd-1010' } });
    expect(screen.getByText('Monetary value denominated in USD')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'acc-pkr-1020' } });
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Record Transaction/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const body = lastPostBody(fetchMock);
    expect(body.accountId).toBe('acc-pkr-1020');
    expect(body.currency).toBe('PKR');
  });

  it('falls back to the first available account when the selected account no longer exists', () => {
    const { rerender } = render(
      <NewTransactionModal isOpen onClose={noop} accounts={[USD_ACCOUNT, PKR_ACCOUNT]} orgId="o" onSuccess={noop} />,
    );
    fireEvent.change(screen.getByLabelText(/Financial Account/i), {
      target: { value: 'acc-usd-1010' },
    });

    // USD account removed (e.g. archived) — must fall back to remaining PKR account.
    rerender(<NewTransactionModal isOpen onClose={noop} accounts={[PKR_ACCOUNT]} orgId="o" onSuccess={noop} />);
    expect((screen.getByLabelText(/Financial Account/i) as HTMLSelectElement).value).toBe('acc-pkr-1020');
    expect(screen.getByText('Monetary value denominated in PKR')).toBeInTheDocument();
  });

  it('shows no currency (never a hardcoded PKR) when no account is available', () => {
    const fetchMock = mockFetchOk();
    render(<NewTransactionModal isOpen onClose={noop} accounts={[]} orgId="o" onSuccess={noop} />);

    expect(screen.queryByText(/denominated in PKR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/denominated in USD/)).not.toBeInTheDocument();
    expect(screen.getByText('Select a financial account to determine currency')).toBeInTheDocument();
    expect(screen.getByLabelText('Amount (Positive Decimal) *')).toBeInTheDocument();

    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: /Record Transaction/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please select a financial account.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
