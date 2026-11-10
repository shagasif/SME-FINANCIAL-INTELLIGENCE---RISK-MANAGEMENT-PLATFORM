import { render, screen, waitFor } from '@testing-library/react';
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
      expect(screen.getByText('Unusual expense amount detected')).toBeInTheDocument();
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
});
