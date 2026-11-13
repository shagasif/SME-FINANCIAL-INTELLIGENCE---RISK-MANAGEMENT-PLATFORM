import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { authStorage } from '../../services/apiClient';
import { RoleType } from '../../types/auth.types';
import { TransactionsPage } from './TransactionsPage';

describe('TransactionsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStorage.clearToken();
    authStorage.clearActiveOrgId();
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
      expect(screen.getByText(/\+PKR\s*850,000/i)).toBeInTheDocument();
      expect(screen.getByText(/\+\$12,500/i)).toBeInTheDocument();
    });
  });

  it('suppresses organization-dependent API requests and avoids DEFAULT_DEMO_ORG fallback while session hydration is incomplete', async () => {
    authStorage.setToken('auth-in-flight-token');

    // Simulate session hydration in progress (user logged in, but activeOrg is not yet confirmed)
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: null,
      activeOrg: null,
      memberships: [],
      activeRole: null,
      isAuthenticated: false,
      isLoading: true,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => false,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}')));

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    // Give microtasks time to execute
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify NO requests were fired to DEFAULT_DEMO_ORG (b6247841-e2f4-41f3-bc01-7c803af8eab0) or any accounts/transactions endpoint
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders unassigned organization notice and never falls back to DEFAULT_DEMO_ORG when authenticated user has no memberships', async () => {
    authStorage.setToken('valid-user-no-orgs');

    // User authenticated, hydration completed, but has 0 active memberships
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-no-org',
        email: 'unassigned@test.local',
        fullName: 'Unassigned User',
        isPlatformAdmin: false,
      },
      activeOrg: null,
      memberships: [],
      activeRole: null,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => false,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: false,
      canExportReports: false,
      isAuditor: false,
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response('{}')));

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('No Active Organization Membership')).toBeInTheDocument();
      expect(
        screen.getByText(/Your account currently does not belong to an active organization/i),
      ).toBeInTheDocument();
    });

    // Zero API requests against demo organization
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears stale access-denied error after subsequent successful fetch', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    let attempt = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };

      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }),
        );
      }

      if (url.includes('/transactions')) {
        attempt++;
        if (attempt === 1) {
          // First attempt fails with 403 Forbidden
          return Promise.resolve(
            new Response(
              JSON.stringify({
                statusCode: 403,
                error: 'Forbidden',
                message: 'Access denied: you do not have an active membership in this organization',
              }),
              { status: 403, headers: jsonHeader },
            ),
          );
        }
        // Second attempt succeeds
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'tx-recovered-1',
                  organizationId: 'org-star-1',
                  accountId: 'acc-1',
                  type: 'INCOME',
                  amount: '50000.0000',
                  date: '2026-11-10T00:00:00.000Z',
                  category: 'Revenue',
                  description: 'Recovered Transaction Entry',
                  isArchived: false,
                  account: { id: 'acc-1', name: 'PKR Account', currency: 'PKR' },
                },
              ],
              pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }

      return Promise.resolve(new Response('{}', { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    // Initial render displays the error banner
    await waitFor(() => {
      expect(
        screen.getByText('Access denied: you do not have an active membership in this organization'),
      ).toBeInTheDocument();
    });

    // Click "Try Again" / Refresh
    const tryAgainBtn = screen.getByRole('button', { name: /Try Again/i });
    tryAgainBtn.click();

    // After successful recovery, the error alert is cleared and recovered transaction is displayed
    await waitFor(() => {
      expect(
        screen.queryByText('Access denied: you do not have an active membership in this organization'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Recovered Transaction Entry')).toBeInTheDocument();
    });
  });

  it('never displays DEFAULT_TRANSACTIONS mock data when API request fails for authenticated org', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ statusCode: 500, message: 'Internal server error' }), {
          status: 500,
          headers: jsonHeader,
        }),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Internal server error');
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });

    // Must never display Apex demo mock records
    expect(screen.queryByText(/Northstar Tech/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Cloud Platform/i)).not.toBeInTheDocument();
  });

  it('renders 4 full-dataset Ledger Summary Cards and updates totals with filters without mixing currencies', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'acc-pkr',
                organizationId: 'org-star-1',
                name: 'Business Savings Reserve',
                type: 'BANK',
                currency: 'PKR',
                openingBalance: '0.0000',
                currentBalance: '2615100.0000',
                isArchived: false,
              },
            ]),
            { status: 200, headers: jsonHeader },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'tx-1',
                organizationId: 'org-star-1',
                accountId: 'acc-pkr',
                type: 'EXPENSE',
                amount: '5300.0000',
                currency: 'PKR',
                transactionDate: '2026-10-30T00:00:00.000Z',
                category: 'Utilities',
                description: 'Water and sanitation',
                counterparty: 'Water Services',
                isArchived: false,
              },
            ],
            pagination: { total: 51, page: 1, limit: 15, totalPages: 4 },
            summary: {
              totalTransactions: 51,
              incomeCount: 18,
              expenseCount: 33,
              transferCount: 0,
              currency: 'USD',
              isComplete: true,
              missingCurrencies: [],
              hasMixedCurrencies: true,
              totalIncome: '14149.2600',
              totalExpenses: '4715.1000',
              netCashMovement: '9434.1600',
              byCurrency: [
                {
                  currency: 'PKR',
                  totalTransactions: 51,
                  incomeCount: 18,
                  expenseCount: 33,
                  transferCount: 0,
                  totalIncome: '3922000.0000',
                  totalExpenses: '1306900.0000',
                  netCashMovement: '2615100.0000',
                },
              ],
            },
          }),
          { status: 200, headers: jsonHeader },
        ),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Total Transactions')).toBeInTheDocument();
      expect(screen.getByText('51')).toBeInTheDocument();
      expect(screen.getByText('Total Income (USD)')).toBeInTheDocument();
      expect(screen.getByText(/\$14,149\.26/)).toBeInTheDocument();
      expect(screen.getByText(/Native:\s*PKR\s*3,922,000/i)).toBeInTheDocument();
      expect(screen.getByText('Total Expenses (USD)')).toBeInTheDocument();
      expect(screen.getByText(/\$4,715\.10/)).toBeInTheDocument();
      expect(screen.getByText(/Native:\s*PKR\s*1,306,900/i)).toBeInTheDocument();
      expect(screen.getByText('Net Cash Movement (USD)')).toBeInTheDocument();
      expect(screen.getByText(/\+\$9,434\.16/)).toBeInTheDocument();
      expect(screen.getByText(/Native:\s*\+PKR\s*2,615,100/i)).toBeInTheDocument();
      // Accounts button shows count of configured accounts (account cards moved to modal)
      expect(screen.getByText(/Accounts \(1\)/i)).toBeInTheDocument();
    });
  });

  it('resets pagination to page 1 on search input and passes server-side sorting query params', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      requestedUrls.push(url);
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: {
              total: 51,
              page: url.includes('page=2') ? 2 : 1,
              limit: 15,
              totalPages: 4,
            },
          }),
          { status: 200, headers: jsonHeader },
        ),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 4/i)).toBeInTheDocument();
    });

    // Navigate to Page 2
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('page=2'))).toBe(true);
    });

    // Typing into search from Page 2 MUST reset request to page=1
    const searchInput = screen.getByPlaceholderText(/Search by description/i);
    fireEvent.change(searchInput, { target: { value: 'K-Electric' } });

    await waitFor(() => {
      expect(
        requestedUrls.some((u) => u.includes('page=1') && u.includes('search=K-Electric')),
      ).toBe(true);
    });

    // Clicking Amount header triggers server-side sortBy=amount&sortOrder=desc
    fireEvent.click(screen.getByRole('button', { name: /Amount/i }));
    await waitFor(() => {
      expect(
        requestedUrls.some((u) => u.includes('sortBy=amount') && u.includes('sortOrder=desc')),
      ).toBe(true);
    });
  });

  it('displays explicit incomplete warnings when FX rates are missing instead of showing assumed totals', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { total: 1, page: 1, limit: 15, totalPages: 1 },
            summary: {
              totalTransactions: 1,
              incomeCount: 1,
              expenseCount: 0,
              transferCount: 0,
              currency: 'USD',
              isComplete: false,
              missingCurrencies: ['AED'],
              hasMixedCurrencies: true,
              totalIncome: null,
              totalExpenses: null,
              netCashMovement: null,
              byCurrency: [
                {
                  currency: 'AED',
                  totalTransactions: 1,
                  incomeCount: 1,
                  expenseCount: 0,
                  transferCount: 0,
                  totalIncome: '1000.0000',
                  totalExpenses: '0.0000',
                  netCashMovement: '1000.0000',
                },
              ],
            },
          }),
          { status: 200, headers: jsonHeader },
        ),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Incomplete \(AED\)/i).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText(/Missing FX rate:\s*AED\s*→\s*USD/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Consolidated total unavailable without FX rate/i),
      ).toBeInTheDocument();
    });
  });

  it('filters ledger and KPI summary when account is selected in Accounts modal, displays Viewing pill, and clears on ✕ click', async () => {
    authStorage.setToken('valid-user-token');

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star-1',
        name: 'star',
        slug: 'star',
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

    const requestedUrls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      requestedUrls.push(url);
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'acc-reserve',
                name: 'Payroll Reserve Account',
                type: 'BANK',
                currency: 'PKR',
                openingBalance: '50000.0000',
                currentBalance: '50000.0000',
                isArchived: false,
              },
            ]),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            items: [],
            pagination: { total: 0, page: 1, limit: 15, totalPages: 1 },
            summary: {
              totalTransactions: 0,
              incomeCount: 0,
              expenseCount: 0,
              transferCount: 0,
              currency: 'PKR',
              isComplete: true,
              missingCurrencies: [],
              hasMixedCurrencies: false,
              totalIncome: '0.0000',
              totalExpenses: '0.0000',
              netCashMovement: '0.0000',
              byCurrency: [],
            },
          }),
          { status: 200, headers: jsonHeader },
        ),
      );
    });

    render(
      <BrowserRouter>
        <TransactionsPage />
      </BrowserRouter>,
    );

    // Initial load: no active filter pill
    await waitFor(() => {
      expect(screen.getByText('Financial Ledger & Transactions')).toBeInTheDocument();
      expect(screen.queryByText(/Viewing:/i)).not.toBeInTheDocument();
    });

    // Open Accounts modal
    fireEvent.click(screen.getByRole('button', { name: /Accounts \(1\)/i }));

    // In modal, click the account row
    await waitFor(() => {
      expect(screen.getByText('Financial Accounts & Chart of Accounts')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Payroll Reserve Account/i }));

    // Modal closes and active filter pill "Viewing: Payroll Reserve Account" appears
    await waitFor(() => {
      expect(screen.getByText(/Viewing:\s*Payroll Reserve Account/i)).toBeInTheDocument();
      expect(
        requestedUrls.some((u) => u.includes('accountId=acc-reserve')),
      ).toBe(true);
    });

    // Click ✕ to clear filter and restore all-account data
    fireEvent.click(screen.getByLabelText(/Clear filter for Payroll Reserve Account/i));

    await waitFor(() => {
      expect(screen.queryByText(/Viewing:/i)).not.toBeInTheDocument();
      // Last request should not have accountId query param
      const lastTxUrl = requestedUrls.filter((u) => u.includes('/transactions')).pop();
      expect(lastTxUrl).toBeDefined();
      expect(lastTxUrl?.includes('accountId=')).toBe(false);
    });
  });
});
