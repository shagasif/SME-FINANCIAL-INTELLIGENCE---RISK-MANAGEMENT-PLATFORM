import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnalyticsChartsSection } from './AnalyticsChartsSection';
import type { AllMetricsResponse } from '../../types/analytics.types';

const mockMetricsData: AllMetricsResponse = {
  organizationId: 'org-test',
  currency: 'USD',
  reportingPeriod: {
    startDate: '2026-08-14T00:00:00.000Z',
    endDate: '2026-11-12T23:59:59.999Z',
  },
  conversionContext: {
    baseCurrency: 'USD',
    isComplete: true,
    missingCurrencies: [],
    appliedRates: [],
  },
  metrics: {
    operatingCashFlow: {
      metricKey: 'operatingCashFlow',
      name: 'Operating Cash Flow',
      status: 'COMPUTED',
      value: '10000.00',
      unit: 'CURRENCY',
      formula: 'Cash Inflows - Cash Outflows',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      sourceRecordIds: { transactionIds: ['tx-1'] },
      dataLimitations: [],
    },
    cashRunway: {
      metricKey: 'cashRunway',
      name: 'Cash Runway',
      status: 'NOT_CALCULABLE',
      value: null,
      unit: 'MONTHS',
      formula: 'LiquidCash / AverageMonthlyNetBurn',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    currentRatio: {
      metricKey: 'currentRatio',
      name: 'Current Ratio',
      status: 'NOT_CALCULABLE',
      value: null,
      unit: 'RATIO',
      formula: 'CurrentAssets / CurrentLiabilities',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    quickRatio: {
      metricKey: 'quickRatio',
      name: 'Quick Ratio',
      status: 'NOT_CALCULABLE',
      value: null,
      unit: 'RATIO',
      formula: '(Cash + MarketableSecurities + Receivables) / CurrentLiabilities',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    grossMargin: {
      metricKey: 'grossMargin',
      name: 'Gross Profit Margin',
      status: 'COMPUTED',
      value: '28.89',
      unit: 'PERCENTAGE',
      formula: '((Revenue - COGS) / Revenue) * 100',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    expenseGrowth: {
      metricKey: 'expenseGrowth',
      name: 'Expense Growth Rate',
      status: 'COMPUTED',
      value: '5.20',
      unit: 'PERCENTAGE',
      formula: '((CurrentPeriodExpenses - PriorPeriodExpenses) / PriorPeriodExpenses) * 100',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    workingCapital: {
      metricKey: 'workingCapital',
      name: 'Net Working Capital',
      status: 'COMPUTED',
      value: '7000.00',
      unit: 'CURRENCY',
      formula: 'CurrentAssets - CurrentLiabilities',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    budgetVariance: {
      metricKey: 'budgetVariance',
      name: 'Budget Variance',
      status: 'COMPUTED',
      value: '3000.00',
      unit: 'CURRENCY',
      formula: 'TotalAllocated - TotalActualSpent',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      dataLimitations: [],
    },
    receivableAging: {
      metricKey: 'receivableAging',
      name: 'Accounts Receivable Aging',
      status: 'COMPUTED',
      value: {
        totalOutstanding: '15000.0000',
        totalOverdue: '2000.0000',
        isComplete: true,
        missingCurrencies: [],
        buckets: [
          { bucket: 'CURRENT', amount: '13000.0000', count: 3, recordIds: ['inv-1'] },
          { bucket: '1_30', amount: '2000.0000', count: 1, recordIds: ['inv-2'] },
        ],
      },
      unit: 'SCHEDULE',
      formula: 'DaysOverdue = floor((AsOfDate - DueDate) / 1 day)',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      sourceRecordIds: { invoiceIds: ['inv-1'] },
      dataLimitations: [],
    },
    payableAging: {
      metricKey: 'payableAging',
      name: 'Accounts Payable Aging',
      status: 'COMPUTED',
      value: {
        totalOutstanding: '8000.0000',
        totalOverdue: '0.0000',
        isComplete: true,
        missingCurrencies: [],
        buckets: [
          { bucket: 'CURRENT', amount: '8000.0000', count: 2, recordIds: ['bill-1'] },
        ],
      },
      unit: 'SCHEDULE',
      formula: 'DaysOverdue = floor((AsOfDate - DueDate) / 1 day)',
      formulaVersion: 'v1.0.0-decimal',
      reportingPeriod: {
        startDate: '2026-08-14T00:00:00.000Z',
        endDate: '2026-11-12T23:59:59.999Z',
      },
      currency: 'USD',
      sourceRecordIds: { billIds: ['bill-1'] },
      dataLimitations: [],
    },
  },
  charts: {
    monthlySeries: [
      {
        month: '2026-08',
        label: 'Aug 2026',
        income: '45000.00',
        expenses: '32000.00',
        netCashFlow: '13000.00',
        cogs: '15000.00',
        grossMarginPct: '28.89',
      },
      {
        month: '2026-09',
        label: 'Sep 2026',
        income: '52000.00',
        expenses: '38000.00',
        netCashFlow: '14000.00',
        cogs: '17000.00',
        grossMarginPct: '30.15',
      },
      {
        month: '2026-10',
        label: 'Oct 2026',
        income: '60000.00',
        expenses: '41000.00',
        netCashFlow: '19000.00',
        cogs: '19000.00',
        grossMarginPct: '31.67',
      },
    ],
    expenseBreakdown: [
      { category: 'Rent & Facilities', amount: '15000.00', percentage: '35.0', count: 2 },
      { category: 'Payroll & Salaries', amount: '20000.00', percentage: '46.5', count: 8 },
      { category: 'Cloud Infrastructure', amount: '8000.00', percentage: '18.5', count: 4 },
    ],
    profitabilityTrend: {
      isAvailable: true,
      reason: null,
    },
    budgetComparison: {
      budgetId: 'bgt-1',
      budgetName: 'Q3 Operations Budget',
      currency: 'USD',
      isComplete: true,
      lines: [
        { category: 'Rent & Facilities', department: 'Operations', allocatedAmount: '16000.00', actualSpent: '15000.00', status: 'ON_TRACK' },
        { category: 'Payroll & Salaries', department: 'Admin', allocatedAmount: '22000.00', actualSpent: '20000.00', status: 'ON_TRACK' },
      ],
    },
  },
};

describe('AnalyticsChartsSection Click-to-Expand', () => {
  it('renders all 6 charts in the dashboard grid initially without any modal open', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    expect(screen.getByTestId('chart-card-income-vs-expenses')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-cash-flow-trend')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-expense-breakdown')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-aging-schedule')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-profitability-trend')).toBeInTheDocument();
    expect(screen.getByTestId('chart-card-budget-vs-actual')).toBeInTheDocument();

    // Modal dialog is not open
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens and closes Income vs Expenses chart modal when clicking chart card or close button', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId('chart-card-income-vs-expenses'));

    // Modal opens
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(modal.getByText('Total Period Income')).toBeInTheDocument();
    expect(modal.getByText('Total Period Expenses')).toBeInTheDocument();

    // Close via footer close button
    const closeBtn = screen.getByTestId('chart-modal-close-button');
    fireEvent.click(closeBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens and closes Cash Flow Trend modal via expand button and header close icon', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    const expandBtn = screen.getByLabelText('Expand Cash Flow Trend chart');
    fireEvent.click(expandBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(modal.getByText('Cumulative Net Cash Flow')).toBeInTheDocument();

    // Close via header close button
    const headerClose = screen.getByLabelText('Close dialog');
    fireEvent.click(headerClose);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Expense Breakdown modal and displays category allocations', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId('chart-card-expense-breakdown'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(modal.getByText('Category Allocation')).toBeInTheDocument();
    expect(modal.getByText('Rent & Facilities')).toBeInTheDocument();

    // Close via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Aging Schedule modal and allows closing by clicking backdrop overlay', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId('chart-card-aging-schedule'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(modal.getByText('Net Aging Working Gap')).toBeInTheDocument();

    // Click backdrop
    const backdrop = document.querySelector('.bg-black\\/60');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Profitability Trend modal and displays enlarged chart elements', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId('chart-card-profitability-trend'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(
      modal.getByText('Monthly gross profit margin (%) from classified COGS'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens Budget vs Actual modal and displays lines and scope', () => {
    render(
      <AnalyticsChartsSection
        metricsData={mockMetricsData}
        selectedCategory="ALL"
        currency="USD"
      />,
    );

    fireEvent.click(screen.getByTestId('chart-card-budget-vs-actual'));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    const modal = within(dialog);
    expect(modal.getAllByText(/Q3 Operations Budget/).length).toBeGreaterThanOrEqual(1);
    expect(modal.getByText('Tracked Expense Categories')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('chart-modal-close-button'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
