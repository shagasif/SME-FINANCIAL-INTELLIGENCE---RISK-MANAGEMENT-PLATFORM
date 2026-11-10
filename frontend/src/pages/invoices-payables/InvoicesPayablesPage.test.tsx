import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { InvoicesPayablesPage } from './InvoicesPayablesPage';

describe('InvoicesPayablesPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders invoices list and aging schedules, and toggles to bills tab', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: {
        id: 'usr-1',
        email: 'finance@apex.local',
        fullName: 'Finance Lead',
        isPlatformAdmin: false,
      },
      activeOrg: {
        id: 'org-1',
        name: 'Apex Manufacturing',
        slug: 'apex-mfg',
        baseCurrency: 'USD',
        role: RoleType.FINANCE_MANAGER,
      },
      memberships: [],
      activeRole: RoleType.FINANCE_MANAGER,
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

    const mockInvoices = [
      {
        id: 'inv-1',
        organizationId: 'org-1',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Global Logistics Corp',
        issueDate: '2026-10-01T00:00:00.000Z',
        dueDate: '2026-10-31T00:00:00.000Z',
        totalAmount: '18500.0000',
        paidAmount: '0.0000',
        outstandingBalance: '18500.0000',
        currency: 'USD',
        status: 'OVERDUE',
        isOverdue: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];

    const mockBills = [
      {
        id: 'bill-1',
        organizationId: 'org-1',
        billNumber: 'BILL-2026-500',
        supplierName: 'Precision Steel Suppliers',
        issueDate: '2026-10-05T00:00:00.000Z',
        dueDate: '2026-11-05T00:00:00.000Z',
        totalAmount: '9200.0000',
        paidAmount: '0.0000',
        outstandingBalance: '9200.0000',
        currency: 'USD',
        status: 'RECEIVED',
        isOverdue: false,
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      },
    ];

    const mockAging = {
      organizationId: 'org-1',
      asOfDate: '2026-11-10T00:00:00.000Z',
      receivablesAging: {
        current: '10000.0000',
        days1to30: '5000.0000',
        days31to60: '3500.0000',
        days61to90: '0.0000',
        days90Plus: '0.0000',
        totalOutstanding: '18500.0000',
      },
      payablesAging: {
        current: '9200.0000',
        days1to30: '0.0000',
        days31to60: '0.0000',
        days61to90: '0.0000',
        days90Plus: '0.0000',
        totalOutstanding: '9200.0000',
      },
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/invoices')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockInvoices), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/bills')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockBills), { status: 200, headers: jsonHeader }),
        );
      }
      if (url.includes('/aging')) {
        return Promise.resolve(
          new Response(JSON.stringify(mockAging), { status: 200, headers: jsonHeader }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }),
      );
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Invoices & Payables Management')).toBeInTheDocument();
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      expect(screen.getByText('Global Logistics Corp')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Record Payment/i })).toBeInTheDocument();
    });

    // Toggle to Supplier Bills tab
    const billsTabButton = screen.getByRole('button', { name: /Supplier Bills/i });
    fireEvent.click(billsTabButton);

    await waitFor(() => {
      expect(screen.getByText('BILL-2026-500')).toBeInTheDocument();
      expect(screen.getByText('Precision Steel Suppliers')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Settle Bill/i })).toBeInTheDocument();
    });
  });
});
