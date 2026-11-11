import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { TransactionsPage } from './TransactionsPage';

describe('TransactionsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders transactions ledger, accounts filter, and action buttons for Business Owner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'owner@apex.local',
        fullName: 'Jane Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockAccounts = [
      {
        id: 'acc-1',
        organizationId: 'org-1',
        name: 'Operating Checking',
        accountType: 'BANK',
        currency: 'USD',
        openingBalance: '10000.0000',
        currentBalance: '50000.0000',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const mockTransactions = {
      items: [
        {
          id: 'tx-1',
          organizationId: 'org-1',
          accountId: 'acc-1',
          type: 'EXPENSE',
          amount: '4250.0000',
          date: '2026-10-15T00:00:00.000Z',
          category: 'Cloud & IT',
          description: 'AWS Server Infrastructure',
          counterparty: 'Amazon Web Services',
          isArchived: false,
          account: { id: 'acc-1', name: 'Operating Checking', currency: 'USD' },
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockAccounts), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockTransactions), { status: 200, headers: jsonHeader }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Ledger & Transactions')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /New Entry/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Import (CSV|File)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Accounts/i })).toBeInTheDocument();
      expect(screen.getByText('AWS Server Infrastructure')).toBeInTheDocument();
      expect(screen.getAllByText('Operating Checking').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('restricts transaction mutations and displays Auditor mode notice for Auditor', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-aud',
        email: 'auditor@apex.local',
        fullName: 'Independent Auditor',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.AUDITOR,
      },
      memberships: [],
      activeRole: RoleType.AUDITOR,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: (roles: RoleType[]) => roles.includes(RoleType.AUDITOR),
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: true,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Auditor Mode Active/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /New Entry/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Import (CSV|File)/i })).not.toBeInTheDocument();
    });
  });

  it('renders multi-currency accounts and transaction amounts in their respective currencies', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-pk',
        email: 'founder@karachi.pk',
        fullName: 'Kamran Ali',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-pk-10',
        name: 'Indus Logistics Ltd',
        slug: 'indus-logistics-pk',
        baseCurrency: 'PKR',
        role: RoleType.BUSINESS_OWNER,
      },
      memberships: [],
      activeRole: RoleType.BUSINESS_OWNER,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: true,
      canManageBudgets: true,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const multiCurrencyAccounts = [
      {
        id: 'acc-pkr-main',
        organizationId: 'org-pk-10',
        code: '1010',
        name: 'HBL Operating Checking',
        accountType: 'BANK',
        currency: 'PKR',
        openingBalance: '500000.0000',
        currentBalance: '1200000.0000',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'acc-usd-foreign',
        organizationId: 'org-pk-10',
        code: '1040',
        name: 'USD Foreign Currency Account',
        accountType: 'BANK',
        currency: 'USD',
        openingBalance: '10000.0000',
        currentBalance: '45000.0000',
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    const multiCurrencyTransactions = {
      items: [
        {
          id: 'tx-pkr-1',
          organizationId: 'org-pk-10',
          accountId: 'acc-pkr-main',
          type: 'INCOME',
          amount: '850000.0000',
          currency: 'PKR',
          date: '2026-10-20T00:00:00.000Z',
          category: 'Logistics Revenue',
          description: 'Karachi Port Shipment Retainer',
          counterparty: 'Sindh Industrial',
          isArchived: false,
          account: { id: 'acc-pkr-main', name: 'HBL Operating Checking', currency: 'PKR' },
          createdAt: '2026-10-20T00:00:00.000Z',
          updatedAt: '2026-10-20T00:00:00.000Z',
        },
        {
          id: 'tx-usd-2',
          organizationId: 'org-pk-10',
          accountId: 'acc-usd-foreign',
          type: 'INCOME',
          amount: '12500.0000',
          currency: 'USD',
          date: '2026-10-21T00:00:00.000Z',
          category: 'Export Revenue',
          description: 'Global SaaS License Export',
          counterparty: 'EuroTech Europe',
          isArchived: false,
          account: { id: 'acc-usd-foreign', name: 'USD Foreign Currency Account', currency: 'USD' },
          createdAt: '2026-10-21T00:00:00.000Z',
          updatedAt: '2026-10-21T00:00:00.000Z',
        },
      ],
      pagination: { total: 2, page: 1, limit: 15, totalPages: 1 },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(JSON.stringify(multiCurrencyAccounts), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(JSON.stringify(multiCurrencyTransactions), { status: 200, headers: jsonHeader }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      // Check account balances strip
      expect(screen.getAllByText('HBL Operating Checking').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('USD Foreign Currency Account').length).toBeGreaterThanOrEqual(1);

      // Check transactions
      expect(screen.getByText('Karachi Port Shipment Retainer')).toBeInTheDocument();
      expect(screen.getByText('Global SaaS License Export')).toBeInTheDocument();

      // Check formatted currencies
      expect(screen.getByText(/\+PKR\s*850,000\.00/i)).toBeInTheDocument();
      expect(screen.getByText(/\+\$12,500\.00/i)).toBeInTheDocument();
    });
  });
});
