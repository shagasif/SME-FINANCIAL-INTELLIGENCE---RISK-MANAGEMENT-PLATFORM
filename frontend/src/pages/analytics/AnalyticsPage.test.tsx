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
      expect(screen.getByText('Operating Cash Flow (OCF)')).toBeInTheDocument();
      expect(screen.getByText('Cash Runway')).toBeInTheDocument();
    });

    expect(screen.getByText('Days Sales Outstanding (DSO)')).toBeInTheDocument();
    expect(screen.getAllByText('Verified').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Deterministic/i)).not.toBeInTheDocument();

    // Formula stays hidden by default until user clicks 'View Formula'
    expect(
      screen.queryByText('Cash Inflows from Operations - Cash Outflows for Operations'),
    ).not.toBeInTheDocument();
    const formulaButtons = screen.getAllByRole('button', { name: /View Formula/i });
    fireEvent.click(formulaButtons[0]);
    expect(
      screen.getByText('Cash Inflows from Operations - Cash Outflows for Operations'),
    ).toBeInTheDocument();
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
      expect(screen.getByText('$2,054.04')).toBeInTheDocument();
      expect(screen.getByText('$1,250.00')).toBeInTheDocument();
      expect(screen.getByText(/Incomplete FX/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Calculation incomplete due to missing exchange rate\(s\): EUR -> USD/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/missing exchange rate\(s\) for:/i),
      ).toBeInTheDocument();
    });
  });
});
