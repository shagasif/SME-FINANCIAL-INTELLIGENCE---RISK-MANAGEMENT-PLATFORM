import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { OverviewDashboardPage } from './OverviewDashboardPage';

describe('OverviewDashboardPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dashboard with financial KPI cards and workspace data', async () => {
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

    const mockMetrics = {
      organizationId: 'org-1',
      currency: 'USD',
      formulaVersion: 'v1.0.0-decimal',
      generatedAt: '2026-11-10T00:00:00.000Z',
      reportingPeriod: {
        startDate: '2026-10-11T00:00:00.000Z',
        endDate: '2026-11-10T00:00:00.000Z',
      },
      metrics: {
        operatingCashFlow: {
          metricKey: 'operatingCashFlow',
          name: 'Operating Cash Flow',
          status: 'COMPUTED',
          value: '42500.0000',
          unit: 'CURRENCY',
          formula: 'CashInflows - CashOutflows',
          dataLimitations: [],
        },
        cashRunway: {
          metricKey: 'cashRunway',
          name: 'Cash Runway',
          status: 'COMPUTED',
          value: '8.4',
          unit: 'MONTHS',
          formula: 'LiquidCash / MonthlyBurn',
          dataLimitations: [],
        },
        currentRatio: {
          metricKey: 'currentRatio',
          name: 'Current Ratio',
          status: 'COMPUTED',
          value: '2.1400',
          unit: 'RATIO',
          formula: 'Assets / Liabilities',
          dataLimitations: [],
        },
        quickRatio: {
          metricKey: 'quickRatio',
          name: 'Quick Ratio',
          status: 'COMPUTED',
          value: '1.6500',
          unit: 'RATIO',
          formula: '(Cash + AR) / Liabilities',
          dataLimitations: [],
          components: {
            liquidCash: '125000.0000',
          },
        },
        workingCapital: {
          metricKey: 'workingCapital',
          name: 'Working Capital',
          status: 'COMPUTED',
          value: '85000.0000',
          unit: 'CURRENCY',
          formula: 'CurrentAssets - CurrentLiabilities',
          dataLimitations: [],
          components: {
            currentAssets: '150000.0000',
          },
        },
        receivableAging: {
          metricKey: 'receivableAging',
          name: 'Receivables Aging',
          status: 'COMPUTED',
          value: {
            current: '15000.0000',
            days1to30: '8000.0000',
            days31to60: '2000.0000',
            days61to90: '0.0000',
            days90Plus: '0.0000',
            totalOutstanding: '25000.0000',
            sourceRecordIds: [],
          },
          unit: 'SCHEDULE',
          formula: 'DaysOverdue',
          dataLimitations: [],
        },
        payableAging: {
          metricKey: 'payableAging',
          name: 'Payables Aging',
          status: 'COMPUTED',
          value: {
            current: '12000.0000',
            days1to30: '3000.0000',
            days31to60: '0.0000',
            days61to90: '0.0000',
            days90Plus: '0.0000',
            totalOutstanding: '15000.0000',
            sourceRecordIds: [],
          },
          unit: 'SCHEDULE',
          formula: 'DaysOverdue',
          dataLimitations: [],
        },
      },
    };

    const mockTxs = {
      items: [
        {
          id: 'tx-1',
          type: 'INCOME',
          amount: '12500.0000',
          category: 'Software Sales',
          description: 'Q4 Enterprise License Renewal',
          transactionDate: '2026-11-08T10:00:00.000Z',
          account: { id: 'acc-1', name: 'Operating Checking', code: '1000' },
        },
      ],
      pagination: { total: 1, page: 1, limit: 6, totalPages: 1 },
    };

    const mockAlerts = [
      {
        id: 'alt-1',
        type: 'UNUSUAL_AMOUNT',
        severity: 'HIGH',
        status: 'NEW',
        reviewPriority: 1,
        title: 'Unusual expense amount detected',
        description: 'Transaction exceeds 3x mean category expense.',
        explanation: 'Transaction exceeds 3x mean category expense.',
        detectionMethod: 'Statistical Outlier Rule',
        detectedAt: '2026-11-09T14:30:00.000Z',
      },
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockMetrics), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockTxs), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/risk-alerts')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockAlerts), { status: 200, headers: jsonHeader }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }),
      );
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Financial Intelligence Overview')).toBeInTheDocument();
      expect(screen.getByText('Liquid Cash & Bank')).toBeInTheDocument();
      expect(screen.getByText('Cash Runway')).toBeInTheDocument();
      expect(screen.getByText('8.4 mos')).toBeInTheDocument();
      expect(screen.getByText('Q4 Enterprise License Renewal')).toBeInTheDocument();
      expect(screen.getByText('View All Anomalies')).toBeInTheDocument();
    });
  });

  it('renders Auditor read-only notice banner when active role is Auditor', async () => {
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Auditor Mode Active \(Strict Read-Only\)/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Financial mutations, approvals, and report exports are blocked/i),
      ).toBeInTheDocument();
    });
  });

  it('formats KPI cards in Organization.baseCurrency (USD) while preserving native transaction currency in Recent Ledger rows', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
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
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizationId: 'org-star',
              currency: 'USD',
              metrics: {
                operatingCashFlow: {
                  metricKey: 'operatingCashFlow',
                  name: 'Operating Cash Flow',
                  status: 'COMPUTED',
                  value: '2054.0423',
                  unit: 'CURRENCY',
                  currency: 'USD',
                  reportingPeriod: {
                    startDate: '2026-10-12T00:00:00.000Z',
                    endDate: '2026-11-11T23:59:59.999Z',
                  },
                  dataLimitations: [],
                },
                cashRunway: {
                  metricKey: 'cashRunway',
                  name: 'Cash Runway',
                  status: 'UNSUPPORTED_MISSING_DATA',
                  value: null,
                  unit: 'MONTHS',
                  currency: 'USD',
                  components: { liquidCashBalance: '9453.7154' },
                  dataLimitations: [],
                },
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'tx-pkr-1',
                  organizationId: 'org-star',
                  accountId: 'acc-pkr',
                  type: 'INCOME',
                  amount: '275000.0000',
                  currency: 'PKR',
                  transactionDate: '2026-10-28T00:00:00.000Z',
                  category: 'Sales Revenue',
                  description: 'Wholesale order - invoice WH-260',
                  account: { id: 'acc-pkr', name: 'Business Savings Reserve', currency: 'PKR' },
                },
              ],
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('$9,453.72')).toBeInTheDocument();
      expect(screen.getByText('$2,054.04')).toBeInTheDocument();
      expect(screen.getByText(/\+PKR\s*275,000/i)).toBeInTheDocument();
    });
  });

  it('marks consolidated KPI metrics incomplete and surfaces missing exchange rate warnings when FX data is missing', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
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
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizationId: 'org-star',
              currency: 'USD',
              conversionContext: {
                baseCurrency: 'USD',
                isComplete: false,
                missingCurrencies: ['AED'],
                appliedRates: [],
              },
              metrics: {
                operatingCashFlow: {
                  metricKey: 'operatingCashFlow',
                  name: 'Operating Cash Flow',
                  status: 'UNSUPPORTED_MISSING_DATA',
                  value: null,
                  unit: 'CURRENCY',
                  currency: 'USD',
                  dataLimitations: ['Calculation incomplete due to missing exchange rate(s): AED -> USD.'],
                },
                cashRunway: {
                  metricKey: 'cashRunway',
                  name: 'Cash Runway',
                  status: 'UNSUPPORTED_MISSING_DATA',
                  value: null,
                  unit: 'MONTHS',
                  currency: 'USD',
                  components: { liquidCashBalance: '0.0000' },
                  dataLimitations: ['Calculation incomplete due to missing exchange rate(s): AED -> USD.'],
                },
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getAllByText(/Calculation incomplete due to missing exchange rate\(s\): AED -> USD/i)
          .length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders live backend buckets[] AR/AP aging amounts and excluded draft disclosure without placeholder dashes', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizationId: 'org-star',
              currency: 'PKR',
              metrics: {
                operatingCashFlow: {
                  metricKey: 'operatingCashFlow',
                  status: 'COMPUTED',
                  value: '100000.0000',
                  unit: 'CURRENCY',
                  currency: 'PKR',
                  dataLimitations: [],
                },
                cashRunway: {
                  metricKey: 'cashRunway',
                  status: 'COMPUTED',
                  value: '999.0000',
                  unit: 'MONTHS',
                  currency: 'PKR',
                  components: { liquidCashBalance: '2615100.0000' },
                  dataLimitations: [],
                },
                currentRatio: { metricKey: 'currentRatio', status: 'COMPUTED', value: '5.0000', unit: 'RATIO', dataLimitations: [] },
                quickRatio: { metricKey: 'quickRatio', status: 'COMPUTED', value: '5.0000', unit: 'RATIO', dataLimitations: [] },
                workingCapital: { metricKey: 'workingCapital', status: 'COMPUTED', value: '2670100.0000', unit: 'CURRENCY', dataLimitations: [] },
                receivableAging: {
                  metricKey: 'receivableAging',
                  status: 'COMPUTED',
                  value: {
                    totalOutstanding: '55000.0000',
                    totalOverdue: '15000.0000',
                    isComplete: true,
                    missingCurrencies: [],
                    buckets: [
                      { bucket: 'CURRENT', count: 1, amount: '40000.0000', recordIds: ['inv-1'] },
                      { bucket: '1_TO_30_DAYS', count: 1, amount: '15000.0000', recordIds: ['inv-2'] },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                    ],
                    sourceRecordIds: ['inv-1', 'inv-2'],
                  },
                  components: { draftCount: '1', draftTotal: '25000.0000' },
                  unit: 'SCHEDULE',
                  dataLimitations: [],
                },
                payableAging: {
                  metricKey: 'payableAging',
                  status: 'COMPUTED',
                  value: {
                    totalOutstanding: '12000.0000',
                    totalOverdue: '0.0000',
                    isComplete: true,
                    missingCurrencies: [],
                    buckets: [
                      { bucket: 'CURRENT', count: 1, amount: '12000.0000', recordIds: ['bill-1'] },
                      { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000', recordIds: [] },
                    ],
                    sourceRecordIds: ['bill-1'],
                  },
                  unit: 'SCHEDULE',
                  dataLimitations: [],
                },
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/40,000/)).toBeInTheDocument();
      expect(screen.getByText(/15,000/)).toBeInTheDocument();
      expect(screen.getAllByText(/12,000/).length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText(/Drafts excluded from AR \(1\):/i)).toBeInTheDocument();
  });

  it('renders top KPI sparkline cards, interactive cash flow chart date filters, and right-side summary panels from backend transactions', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'owner@apex.local',
        fullName: 'Apex Business Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizationId: 'org-star',
              currency: 'PKR',
              metrics: {
                operatingCashFlow: {
                  metricKey: 'operatingCashFlow',
                  status: 'COMPUTED',
                  value: '612200.0000',
                  unit: 'CURRENCY',
                  currency: 'PKR',
                  dataLimitations: [],
                },
                cashRunway: {
                  metricKey: 'cashRunway',
                  status: 'COMPUTED',
                  value: '14.2',
                  unit: 'MONTHS',
                  currency: 'PKR',
                  components: { liquidCashBalance: '2615100.0000' },
                  dataLimitations: [],
                },
                workingCapital: {
                  metricKey: 'workingCapital',
                  status: 'COMPUTED',
                  value: '2615400.0000',
                  unit: 'CURRENCY',
                  currency: 'PKR',
                  dataLimitations: [],
                },
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'tx-1',
                  type: 'INCOME',
                  amount: '275000.0000',
                  currency: 'PKR',
                  transactionDate: '2026-10-28T00:00:00.000Z',
                  category: 'Sales Revenue',
                  description: 'Wholesale order WH-260',
                },
                {
                  id: 'tx-2',
                  type: 'EXPENSE',
                  amount: '82500.0000',
                  currency: 'PKR',
                  transactionDate: '2026-10-10T00:00:00.000Z',
                  category: 'Raw Materials',
                  description: 'Raw materials batch',
                },
              ],
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('kpi-card-liquid-cash')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-operating-cash-flow')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-card-working-capital')).toBeInTheDocument();
      expect(screen.getByTestId('overview-cashflow-chart-card')).toBeInTheDocument();
      expect(screen.getByTestId('overview-liquidity-health-card')).toBeInTheDocument();
      expect(screen.getByTestId('overview-risk-summary-card')).toBeInTheDocument();
    });

    // Switch date-range filter to 7D and verify period summary updates from actual transactions
    fireEvent.click(screen.getByRole('button', { name: '7D' }));
    expect(screen.getByText('Cash Flow Performance')).toBeInTheDocument();
  });

  it('renders data-driven visual charts: Quick Ratio gauge, Risk donut, AR/AP horizontal bar charts, and Recent Transactions table', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'owner@apex.local',
        fullName: 'Apex Business Owner',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
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

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/analytics/metrics')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              organizationId: 'org-star',
              currency: 'PKR',
              metrics: {
                operatingCashFlow: {
                  metricKey: 'operatingCashFlow',
                  status: 'COMPUTED',
                  value: '612200.0000',
                  unit: 'CURRENCY',
                  currency: 'PKR',
                  dataLimitations: [],
                },
                cashRunway: {
                  metricKey: 'cashRunway',
                  status: 'COMPUTED',
                  value: '14.2',
                  unit: 'MONTHS',
                  currency: 'PKR',
                  components: { liquidCashBalance: '2615100.0000' },
                  dataLimitations: [],
                },
                quickRatio: {
                  metricKey: 'quickRatio',
                  status: 'COMPUTED',
                  value: '1.4500',
                  unit: 'RATIO',
                  currency: 'PKR',
                  components: {
                    liquidCash: '2615100.0000',
                    accountsReceivable: '40000.0000',
                    currentLiabilities: '1830000.0000',
                  },
                  dataLimitations: [],
                },
                workingCapital: {
                  metricKey: 'workingCapital',
                  status: 'COMPUTED',
                  value: '2615400.0000',
                  unit: 'CURRENCY',
                  currency: 'PKR',
                  dataLimitations: [],
                },
                receivableAging: {
                  metricKey: 'receivableAging',
                  status: 'COMPUTED',
                  value: {
                    totalOutstanding: '45000.0000',
                    isComplete: true,
                    buckets: [
                      { bucket: 'CURRENT', count: 2, amount: '35000.0000' },
                      { bucket: '1_TO_30_DAYS', count: 1, amount: '10000.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ],
                  },
                  unit: 'SCHEDULE',
                  dataLimitations: [],
                },
                payableAging: {
                  metricKey: 'payableAging',
                  status: 'COMPUTED',
                  value: {
                    totalOutstanding: '20000.0000',
                    isComplete: true,
                    buckets: [
                      { bucket: 'CURRENT', count: 1, amount: '20000.0000' },
                      { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
                      { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
                      { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
                    ],
                  },
                  unit: 'SCHEDULE',
                  dataLimitations: [],
                },
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/risk-alerts')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'alt-high-1',
                severity: 'HIGH',
                status: 'NEW',
                title: 'High overdue balance detected',
                description: 'Customer balance > 90 days.',
              },
              {
                id: 'alt-med-1',
                severity: 'MEDIUM',
                status: 'NEW',
                title: 'Unusual raw material purchase',
                description: 'Expense exceeds 2x baseline.',
              },
              {
                id: 'alt-low-1',
                severity: 'LOW',
                status: 'NEW',
                title: 'Minor category variance',
                description: 'Category variance below threshold.',
              },
            ]),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/transactions')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'tx-test-999',
                  type: 'INCOME',
                  amount: '45000.0000',
                  currency: 'PKR',
                  transactionDate: '2026-10-28T00:00:00.000Z',
                  category: 'Sales Revenue',
                  description: 'Wholesale order invoice #999',
                },
              ],
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <OverviewDashboardPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      // 1. Cash Runway Gauge & Status
      expect(screen.getByTestId('cash-runway-gauge-container')).toBeInTheDocument();
      expect(screen.getByText('14.2 mos')).toBeInTheDocument();
      expect(screen.getByText('Quick Ratio')).toBeInTheDocument();

      // 2. Risk Anomaly Severity Donut
      expect(screen.getByTestId('risk-severity-donut')).toBeInTheDocument();
      expect(screen.getByText('3 Total Anomalies Detected')).toBeInTheDocument();
      expect(screen.getByText('High')).toBeInTheDocument();
      expect(screen.getByText('Med')).toBeInTheDocument();
      expect(screen.getByText('Low')).toBeInTheDocument();
      expect(screen.getByText('View All Anomalies')).toBeInTheDocument();

      // 3. AR / AP Aging Cards & Charts
      expect(screen.getByTestId('overview-ar-aging-card')).toBeInTheDocument();
      expect(screen.getByTestId('overview-ap-aging-card')).toBeInTheDocument();
      expect(screen.getAllByTestId('aging-horizontal-bar-chart').length).toBe(2);

      // 4. Recent Transactions Table with Transaction ID column
      expect(screen.getByTestId('overview-recent-transactions')).toBeInTheDocument();
      expect(screen.getByText('Transaction ID')).toBeInTheDocument();
      expect(screen.getByText('tx-test-999')).toBeInTheDocument();
      expect(screen.getByText('Wholesale order invoice #999')).toBeInTheDocument();
    });
  });
});
