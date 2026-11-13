import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { AnalyticsPage } from './AnalyticsPage';

describe('AnalyticsPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all deterministic metrics with formulas, citations, and mathematical precision banner', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-analyst',
        email: 'analyst@apex.local',
        fullName: 'Anna Analyst',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCIAL_ANALYST,
      },
      memberships: [],
      activeRole: RoleType.FINANCIAL_ANALYST,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockMetrics = {
      organizationId: 'org-1',
      reportingPeriod: {
        startDate: '2026-02-01',
        endDate: '2026-03-01',
      },
      metrics: {
        operatingCashFlow: {
          metricName: 'Operating Cash Flow',
          status: 'CALCULATED',
          value: '45000.0000',
          unit: 'USD',
          formula: 'Cash Inflows from Operations - Cash Outflows for Operations',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: '2026-02-01 to 2026-03-01',
          currency: 'USD',
          sourceRecordIds: ['tx-101', 'tx-102'],
          dataLimitations: ['Excludes non-operating capital transfers'],
        },
        cashRunway: {
          metricName: 'Cash Runway',
          status: 'CALCULATED',
          value: '8.5',
          unit: 'months',
          formula: 'Liquid Cash / Average Monthly Net Burn',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: 'Trailing 90 Days',
          currency: 'USD',
          sourceRecordIds: ['tx-103'],
          dataLimitations: [],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockMetrics,
    });

    render(<AnalyticsPage />);

    expect(screen.getByText('Financial Analytics')).toBeInTheDocument();
    expect(
      screen.queryByText(/Mathematical Precision Guarantee \(Zero AI Hallucinations\)/i),
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('Operating Cash Flow (OCF)').length).toBeGreaterThanOrEqual(1);
    });

    const firstFetchUrl = String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    const urlObj = new URL(firstFetchUrl, 'http://localhost');
    const startParam = new Date(`${urlObj.searchParams.get('startDate')}T00:00:00.000Z`);
    const endParam = new Date(`${urlObj.searchParams.get('endDate')}T00:00:00.000Z`);
    expect(Math.round((endParam.getTime() - startParam.getTime()) / (24 * 60 * 60 * 1000))).toBe(90);

    // 4 compact category accordion rows inside Financial Metrics
    expect(screen.getByRole('button', { name: /Liquidity\s*\(4 metrics\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Profitability\s*\(1 metric\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Efficiency\s*\(2 metrics\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operational\s*\(3 metrics\)/i })).toBeInTheDocument();

    // Expand Liquidity category, then expand Operating Cash Flow details and View Formula
    fireEvent.click(screen.getByRole('button', { name: /Liquidity\s*\(4 metrics\)/i }));
    expect(screen.getByText('Cash Runway')).toBeInTheDocument();
    expect(
      screen.queryByText('Cash Inflows from Operations - Cash Outflows for Operations'),
    ).not.toBeInTheDocument();
    const detailButtons = screen.getAllByRole('button', { name: /Show Details/i });
    fireEvent.click(detailButtons[0]);
    const formulaButtons = screen.getAllByRole('button', { name: /View Formula/i });
    fireEvent.click(formulaButtons[0]);
    expect(
      screen.getByText('Cash Inflows from Operations - Cash Outflows for Operations'),
    ).toBeInTheDocument();

    // Expand Efficiency category to inspect AR/AP Aging rows
    fireEvent.click(screen.getByRole('button', { name: /Efficiency\s*\(2 metrics\)/i }));
    expect(screen.getAllByText('Accounts Receivable Aging').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Accounts Payable Aging').length).toBeGreaterThanOrEqual(1);
  });

  it('renders backend COMPUTED metrics, SCHEDULE aging values, and UNSUPPORTED_MISSING_DATA incomplete FX warnings cleanly', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'shagasif83@gmail.com',
        fullName: 'Shagufta Asif',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'a46568cf-61d4-4508-b545-f07d25d32256',
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

    const backendPayload = {
      organizationId: 'a46568cf-61d4-4508-b545-f07d25d32256',
      currency: 'USD',
      reportingPeriod: {
        startDate: '2026-10-12T00:00:00.000Z',
        endDate: '2026-11-11T23:59:59.999Z',
      },
      conversionContext: {
        baseCurrency: 'USD',
        isComplete: false,
        missingCurrencies: ['EUR'],
        appliedRates: [],
      },
      metrics: {
        operatingCashFlow: {
          metricKey: 'operatingCashFlow',
          name: 'Operating Cash Flow',
          status: 'COMPUTED',
          value: '2054.0423',
          unit: 'CURRENCY',
          formula: 'OperatingCashFlow = CashInflows - CashOutflows',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: {
            startDate: '2026-10-12T00:00:00.000Z',
            endDate: '2026-11-11T23:59:59.999Z',
          },
          currency: 'USD',
          sourceRecordIds: { transactionIds: ['tx-1', 'tx-2'] },
          dataLimitations: [],
        },
        workingCapital: {
          metricKey: 'workingCapital',
          name: 'Net Working Capital',
          status: 'UNSUPPORTED_MISSING_DATA',
          value: null,
          unit: 'CURRENCY',
          formula: 'WorkingCapital = CurrentAssets - CurrentLiabilities',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: {
            startDate: '2026-10-12T00:00:00.000Z',
            endDate: '2026-11-11T23:59:59.999Z',
          },
          currency: 'USD',
          sourceRecordIds: { accountIds: ['acc-1'] },
          dataLimitations: ['Calculation incomplete due to missing exchange rate(s): EUR -> USD.'],
        },
        receivableAging: {
          metricKey: 'receivableAging',
          name: 'Accounts Receivable Aging',
          status: 'COMPUTED',
          value: {
            totalOutstanding: '1250.0000',
            totalOverdue: '0.0000',
            isComplete: true,
            missingCurrencies: [],
          },
          unit: 'SCHEDULE',
          formula: 'DaysOverdue = floor((AsOfDate - DueDate) / 1 day)',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: {
            startDate: '2026-10-12T00:00:00.000Z',
            endDate: '2026-11-11T23:59:59.999Z',
          },
          currency: 'USD',
          sourceRecordIds: { invoiceIds: ['inv-1'] },
          dataLimitations: [],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => backendPayload,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getAllByText('$2,054.04').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/AR: \$1,250/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Incomplete FX/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.getByText(/missing exchange rate\(s\) for:/i),
      ).toBeInTheDocument();
    });

    // Expand Operational category and Net Working Capital (index 0 in Operational) to verify incomplete FX limitation
    fireEvent.click(screen.getByRole('button', { name: /Operational\s*\(3 metrics\)/i }));
    const detailButtons = screen.getAllByRole('button', { name: /Show Details/i });
    fireEvent.click(detailButtons[0]);
    expect(
      screen.getByText(/Calculation incomplete due to missing exchange rate\(s\): EUR -> USD/i),
    ).toBeInTheDocument();
  });

  it('renders chart visualizations, handles missing COGS/budget empty states, and filters charts by category', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-star',
        email: 'owner@star.local',
        fullName: 'Star Owner',
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

    const mockChartMetrics = {
      organizationId: 'org-star',
      currency: 'PKR',
      reportingPeriod: { startDate: '2026-08-14T00:00:00.000Z', endDate: '2026-11-12T23:59:59.999Z' },
      charts: {
        monthlySeries: [
          {
            month: '2026-09',
            label: 'Sep 2026',
            income: '1200000.0000',
            expenses: '400000.0000',
            netCashFlow: '800000.0000',
            cogs: '0.0000',
            grossMarginPct: null,
          },
          {
            month: '2026-10',
            label: 'Oct 2026',
            income: '2130000.0000',
            expenses: '640900.0000',
            netCashFlow: '1489100.0000',
            cogs: '0.0000',
            grossMarginPct: null,
          },
        ],
        expenseBreakdown: [
          { category: 'Purchases / Raw Materials', amount: '534500.0000', percentage: '51.3498', count: 5 },
          { category: 'Salaries & Wages', amount: '238000.0000', percentage: '22.8648', count: 3 },
        ],
        profitabilityTrend: {
          isAvailable: false,
          reason: 'No expense transactions are classified as Cost of Goods Sold (isCostOfGoodsSold=true).',
        },
        budgetComparison: null,
      },
      metrics: {
        operatingCashFlow: {
          metricKey: 'operatingCashFlow',
          status: 'COMPUTED',
          value: '2289100.0000',
          unit: 'CURRENCY',
          currency: 'PKR',
          formula: 'OCF = Inflows - Outflows',
          formulaVersion: 'v1.0.0',
          dataLimitations: [],
        },
        cashRunway: {
          metricKey: 'cashRunway',
          status: 'UNSUPPORTED_MISSING_DATA',
          value: null,
          unit: 'MONTHS',
          currency: 'PKR',
          formula: 'CashRunway = LiquidCash / MonthlyNetBurn',
          formulaVersion: 'v1.0.0',
          dataLimitations: ['Organization is cash-flow positive or break-even in this period.'],
        },
        currentRatio: { metricKey: 'currentRatio', status: 'UNSUPPORTED_MISSING_DATA', value: null, unit: 'RATIO', formula: '', formulaVersion: 'v1.0.0', dataLimitations: ['Current liabilities are zero.'] },
        quickRatio: { metricKey: 'quickRatio', status: 'UNSUPPORTED_MISSING_DATA', value: null, unit: 'RATIO', formula: '', formulaVersion: 'v1.0.0', dataLimitations: ['Current liabilities are zero.'] },
        workingCapital: { metricKey: 'workingCapital', status: 'COMPUTED', value: '2615400.0000', unit: 'CURRENCY', currency: 'PKR', formula: '', formulaVersion: 'v1.0.0', dataLimitations: [] },
        grossMargin: { metricKey: 'grossMargin', status: 'UNSUPPORTED_MISSING_DATA', value: null, unit: 'PERCENTAGE', formula: '', formulaVersion: 'v1.0.0', dataLimitations: ['No expense transactions are classified as Cost of Goods Sold (isCostOfGoodsSold=true).'] },
        expenseGrowth: {
          metricKey: 'expenseGrowth',
          status: 'COMPUTED',
          value: '291.3000',
          unit: 'PERCENTAGE',
          formula: '',
          formulaVersion: 'v1.0.0',
          dataLimitations: [],
          components: {
            currentPeriodExpenses: '1040900.0000',
            priorPeriodExpenses: '266000.0000',
            priorPeriodStart: '2026-05-16',
            priorPeriodEnd: '2026-08-13',
          },
        },
        budgetVariance: { metricKey: 'budgetVariance', status: 'UNSUPPORTED_MISSING_DATA', value: null, unit: 'PERCENTAGE', formula: '', formulaVersion: 'v1.0.0', dataLimitations: ['No active budget overlaps the selected reporting period.'] },
        receivableAging: {
          metricKey: 'receivableAging',
          status: 'COMPUTED',
          value: { totalOutstanding: '300.0000', totalOverdue: '0.0000', isComplete: true, buckets: [{ bucket: 'CURRENT', count: 1, amount: '300.0000', recordIds: ['inv-1'] }] },
          unit: 'SCHEDULE',
          currency: 'PKR',
          formula: '',
          formulaVersion: 'v1.0.0',
          dataLimitations: [],
        },
        payableAging: {
          metricKey: 'payableAging',
          status: 'COMPUTED',
          value: { totalOutstanding: '0.0000', totalOverdue: '0.0000', isComplete: true, buckets: [] },
          unit: 'SCHEDULE',
          currency: 'PKR',
          formula: '',
          formulaVersion: 'v1.0.0',
          dataLimitations: ['No open supplier bills on record.'],
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockChartMetrics,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Income vs Expenses')).toBeInTheDocument();
    });

    expect(screen.getByText('Cash Flow Trend')).toBeInTheDocument();
    expect(screen.getByText('Expense Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Accounts Receivable & Payable Aging')).toBeInTheDocument();
    expect(screen.getByText('Profitability Trend')).toBeInTheDocument();
    expect(screen.getByText('Budget vs Actual')).toBeInTheDocument();
    expect(screen.getByText('Purchases / Raw Materials')).toBeInTheDocument();
    expect(screen.getByText('(51.3%)')).toBeInTheDocument();

    // Collapsed by default: prior period comparison hidden until category & metric expanded
    expect(screen.queryByText(/Prior \(2026-05-16 to 2026-08-13\):/i)).not.toBeInTheDocument();

    // Expand Operational category, then Expense Growth Rate (index 1 in Operational)
    fireEvent.click(screen.getByRole('button', { name: /Operational\s*\(3 metrics\)/i }));
    const detailButtons = screen.getAllByRole('button', { name: /Show Details/i });
    fireEvent.click(detailButtons[1]);
    expect(screen.getByText(/Prior \(2026-05-16 to 2026-08-13\):/i)).toBeInTheDocument();

    // Category filter: Profitability hides Cash Flow Trend & Budget vs Actual
    fireEvent.click(screen.getByRole('button', { name: 'Profitability' }));
    expect(screen.getByText('Profitability Trend')).toBeInTheDocument();
    expect(screen.getByText('Expense Breakdown')).toBeInTheDocument();
    expect(screen.queryByText('Cash Flow Trend')).not.toBeInTheDocument();
    expect(screen.queryByText('Budget vs Actual')).not.toBeInTheDocument();
  });

  it('renders Not Calculable badge and opens structured Audit Trace modal for Current Ratio with zero liabilities', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-analyst',
        email: 'analyst@apex.local',
        fullName: 'Anna Analyst',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-star',
        name: 'star',
        slug: 'star',
        baseCurrency: 'PKR',
        role: RoleType.FINANCIAL_ANALYST,
      },
      memberships: [],
      activeRole: RoleType.FINANCIAL_ANALYST,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      switchOrganization: vi.fn(),
      hasRole: () => true,
      canMutateLedger: false,
      canManageBudgets: false,
      canRunAiWorkflows: true,
      canExportReports: true,
      isAuditor: false,
    });

    const mockMetrics = {
      organizationId: 'org-star',
      reportingPeriod: {
        startDate: '2026-08-14',
        endDate: '2026-11-12',
      },
      currency: 'PKR',
      metrics: {
        operatingCashFlow: {
          metricName: 'Operating Cash Flow',
          status: 'COMPUTED',
          value: '2289100.0000',
          unit: 'CURRENCY',
          formula: 'OperatingCashFlow = CashInflows - CashOutflows',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: { startDate: '2026-08-14', endDate: '2026-11-12' },
          currency: 'PKR',
          sourceRecordIds: { transactionIds: ['tx-1'] },
          dataLimitations: [],
        },
        currentRatio: {
          metricKey: 'currentRatio',
          metricName: 'Current Ratio',
          status: 'NOT_CALCULABLE',
          value: null,
          unit: 'RATIO',
          formula: 'CurrentRatio = CurrentAssets / CurrentLiabilities',
          formulaVersion: 'v1.0.0-decimal',
          reportingPeriod: { startDate: '2026-08-14', endDate: '2026-11-12' },
          currency: 'PKR',
          sourceRecordIds: {
            accountIds: ['acc-savings', 'acc-usd'],
            invoiceIds: ['inv-ahmed'],
            billIds: [],
          },
          dataLimitations: [
            'Current liabilities (open supplier bills and short-term debt) are verified zero; ratio cannot be mathematically calculated (division by zero prevented).',
          ],
          components: {
            currentAssets: '2615400.0000',
            currentLiabilities: '0.0000',
            liquidCash: '2615100.0000',
            accountsReceivable: '300.0000',
            shortTermDebt: '0.0000',
            openBillsPayable: '0.0000',
            calculationReason:
              'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; metric is not calculable.',
          },
          auditTrace: {
            metricKey: 'currentRatio',
            calculationReason:
              'Current liabilities are verified zero (0 open supplier bills, 0 short-term debt accounts). Division by zero prevented; metric is not calculable.',
            status: 'NOT_CALCULABLE',
            reportingPeriod: { startDate: '2026-08-14', endDate: '2026-11-12' },
            currency: 'PKR',
            inputs: {
              currentAssets: '2615400.0000',
              currentLiabilities: '0.0000',
              liquidCash: '2615100.0000',
              accountsReceivable: '300.0000',
            },
            assetRecords: [
              {
                id: 'acc-savings',
                type: 'ACCOUNT',
                label: 'Business Savings Reserve',
                classification: 'Liquid Asset (BANK)',
                currency: 'PKR',
                nativeAmount: '2615100.0000',
                convertedAmount: '2615100.0000',
                role: 'CALCULATION_INPUT',
              },
              {
                id: 'inv-ahmed',
                type: 'INVOICE',
                label: 'INV 002 (Ahmed)',
                classification: 'Accounts Receivable',
                currency: 'PKR',
                nativeAmount: '300.0000',
                convertedAmount: '300.0000',
                role: 'CALCULATION_INPUT',
              },
            ],
            liabilityRecords: [],
          },
        },
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockMetrics,
    });

    render(<AnalyticsPage />);

    await waitFor(() => {
      expect(screen.getByText('Financial Metrics')).toBeInTheDocument();
    });

    // Expand Liquidity category (4 metrics)
    fireEvent.click(screen.getByRole('button', { name: /Liquidity\s*\(4 metrics\)/i }));

    // Check Current Ratio and Not Calculable badges appear
    expect(screen.getByText('Current Ratio')).toBeInTheDocument();
    expect(screen.getAllByText('Not Calculable').length).toBeGreaterThanOrEqual(1);

    // Expand Current Ratio card (which is index 2 in Liquidity: OCF, Runway, Current Ratio)
    const detailButtons = screen.getAllByRole('button', { name: /Show Details/i });
    fireEvent.click(detailButtons[2]);

    // Check calculation assessment callout appears
    expect(
      screen.getByText(/Current liabilities are verified zero \(0 open supplier bills, 0 short-term debt accounts\)/i),
    ).toBeInTheDocument();

    // Click Audit Trace button inside the expanded card
    fireEvent.click(screen.getByRole('button', { name: 'Audit Trace' }));

    // Verify Audit Trace modal contents
    expect(screen.getByText('Audit Trace: Current Ratio')).toBeInTheDocument();
    expect(screen.getByText('Current Assets & Cash Accounts (2 Records):')).toBeInTheDocument();
    expect(screen.getByText('Business Savings Reserve')).toBeInTheDocument();
    expect(screen.getByText('INV 002 (Ahmed)')).toBeInTheDocument();
    expect(screen.getByText(/Zero current liability records/i)).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByRole('button', { name: 'Close Audit View' }));
    expect(screen.queryByText('Audit Trace: Current Ratio')).not.toBeInTheDocument();
  });
});
