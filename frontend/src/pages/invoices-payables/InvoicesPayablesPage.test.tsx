import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import { InvoicesPayablesPage } from './InvoicesPayablesPage';

const baseAuthMock = {
  user: {
    id: 'usr-1',
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
};

describe('InvoicesPayablesPage Component (Phase 1 Fixes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps backend buckets[] aging shape, currency, incomplete FX warning, and native invoice/bill rows cleanly', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuthMock);

    const mockInvoices = [
      {
        id: 'inv-1',
        organizationId: 'org-star',
        invoiceNumber: 'INV-2026-001',
        customerName: 'Global Logistics Corp',
        issueDate: '2026-10-01T00:00:00.000Z',
        dueDate: '2026-10-31T00:00:00.000Z',
        totalAmount: '185000.0000',
        paidAmount: '0.0000',
        outstandingBalance: '185000.0000',
        currency: 'PKR',
        status: 'OVERDUE',
        isOverdue: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'inv-draft',
        organizationId: 'org-star',
        invoiceNumber: 'INV-DRAFT-002',
        customerName: 'Draft Customer',
        issueDate: '2026-11-10T00:00:00.000Z',
        dueDate: '2026-12-10T00:00:00.000Z',
        totalAmount: '500.0000',
        paidAmount: '0.0000',
        outstandingBalance: '500.0000',
        currency: 'USD',
        status: 'DRAFT',
        createdAt: '2026-11-10T00:00:00.000Z',
        updatedAt: '2026-11-10T00:00:00.000Z',
      },
      {
        id: 'inv-void',
        organizationId: 'org-star',
        invoiceNumber: 'INV-VOID-003',
        customerName: 'Voided Client',
        issueDate: '2026-11-01T00:00:00.000Z',
        dueDate: '2026-11-30T00:00:00.000Z',
        totalAmount: '250.0000',
        paidAmount: '0.0000',
        outstandingBalance: '250.0000',
        currency: 'USD',
        status: 'VOID',
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ];

    const mockBills = [
      {
        id: 'bill-1',
        organizationId: 'org-star',
        billNumber: 'BILL-2026-500',
        supplierName: 'Precision Steel Suppliers',
        issueDate: '2026-10-05T00:00:00.000Z',
        dueDate: '2026-11-25T00:00:00.000Z',
        totalAmount: '9200.0000',
        paidAmount: '0.0000',
        outstandingBalance: '9200.0000',
        currency: 'USD',
        status: 'OPEN',
        isOverdue: false,
        createdAt: '2026-10-05T00:00:00.000Z',
        updatedAt: '2026-10-05T00:00:00.000Z',
      },
    ];

    const mockAging = {
      asOfDate: '2026-11-11T00:00:00.000Z',
      currency: 'USD',
      receivablesAging: {
        totalOutstanding: '668.7800',
        totalOverdue: '668.7800',
        isComplete: false,
        missingCurrencies: ['EUR'],
        buckets: [
          { bucket: 'CURRENT', count: 0, amount: '0.0000' },
          { bucket: '1_TO_30_DAYS', count: 1, amount: '668.7800' },
          { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
          { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
          { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
        ],
      },
      payablesAging: {
        totalOutstanding: '9200.0000',
        totalOverdue: '0.0000',
        isComplete: true,
        missingCurrencies: [],
        buckets: [
          { bucket: 'CURRENT', count: 1, amount: '9200.0000' },
          { bucket: '1_TO_30_DAYS', count: 0, amount: '0.0000' },
          { bucket: '31_TO_60_DAYS', count: 0, amount: '0.0000' },
          { bucket: '61_TO_90_DAYS', count: 0, amount: '0.0000' },
          { bucket: 'OVER_90_DAYS', count: 0, amount: '0.0000' },
        ],
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
      if (url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('INV-2026-001')).toBeInTheDocument();
      expect(screen.getByText(/Accounts Receivable Aging Schedule \(USD\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Incomplete FX \(EUR\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Partial Total:\s*\$668\.78/i)).toBeInTheDocument();
      expect(screen.getByText('$669')).toBeInTheDocument();
      expect(screen.getAllByText(/PKR\s*185,000\.00/i).length).toBeGreaterThanOrEqual(2);
    });

    // Only 1 payable row (OVERDUE) gets a Record Payment button; DRAFT & VOID do not
    expect(screen.getAllByRole('button', { name: /Record Payment/i })).toHaveLength(1);

    // Toggle to Supplier Bills tab
    fireEvent.click(screen.getByRole('button', { name: /Supplier Bills/i }));

    await waitFor(() => {
      expect(screen.getByText('BILL-2026-500')).toBeInTheDocument();
      expect(screen.getByText(/Total Outstanding:\s*\$9,200\.00/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Settle Bill/i })).toBeInTheDocument();
    });
  });

  it('submits payment payload with backend method & PaymentMethod enum and native invoice currency', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuthMock);

    let capturedPaymentBody: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL, init?: RequestInit) => {
      const url = req.toString();
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.includes('/payments') && init?.method === 'POST') {
        capturedPaymentBody = JSON.parse(String(init.body));
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'inv-1', status: 'PAID' }), {
            status: 201,
            headers: jsonHeader,
          }),
        );
      }
      if (url.includes('/invoices')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'inv-1',
                organizationId: 'org-star',
                invoiceNumber: 'INV-PKR-10',
                customerName: 'Lahore Textile',
                issueDate: '2026-11-01T00:00:00.000Z',
                dueDate: '2026-11-30T00:00:00.000Z',
                totalAmount: '50000.0000',
                paidAmount: '0.0000',
                outstandingBalance: '50000.0000',
                currency: 'PKR',
                status: 'ISSUED',
                createdAt: '2026-11-01T00:00:00.000Z',
                updatedAt: '2026-11-01T00:00:00.000Z',
              },
            ]),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/bills')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      if (url.includes('/aging')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              asOfDate: '2026-11-11T00:00:00.000Z',
              currency: 'USD',
              receivablesAging: {
                totalOutstanding: '180.7500',
                totalOverdue: '0.0000',
                isComplete: true,
                missingCurrencies: [],
                buckets: [{ bucket: 'CURRENT', count: 1, amount: '180.7500' }],
              },
              payablesAging: {
                totalOutstanding: '0.0000',
                totalOverdue: '0.0000',
                isComplete: true,
                missingCurrencies: [],
                buckets: [],
              },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      if (url.includes('/accounts')) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 'acc-pkr',
                organizationId: 'org-star',
                name: 'Business Savings Reserve',
                currency: 'PKR',
                openingBalance: '0.0000',
                currentBalance: '2615100.0000',
                isArchived: false,
                createdAt: '2026-10-01T00:00:00.000Z',
                updatedAt: '2026-10-01T00:00:00.000Z',
              },
            ]),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Record Payment/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));

    await waitFor(() => {
      expect(screen.getByText(/Record Payment for INV-PKR-10/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Payment Amount \(PKR\)/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Payment Method/i), { target: { value: 'CARD' } });
    fireEvent.change(screen.getByLabelText(/Post Cash Movement to Account/i), {
      target: { value: 'acc-pkr' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Settlement/i }));

    await waitFor(() => {
      expect(capturedPaymentBody).not.toBeNull();
    });

    expect(capturedPaymentBody).toMatchObject({
      amount: '50000.0000',
      method: 'CARD',
      accountId: 'acc-pkr',
    });
    expect(capturedPaymentBody).not.toHaveProperty('paymentMethod');
  });

  it('waits for auth hydration and never displays demo fallback records when fetch fails', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('API unreachable'));
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      ...baseAuthMock,
      activeOrg: null,
      isLoading: true,
    });

    const { rerender } = render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    expect(fetchSpy).not.toHaveBeenCalled();

    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuthMock);
    rerender(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Unable to reach backend API/i);
      expect(screen.getByText(/No customer invoices recorded yet/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Northstar Technologies/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Cloud EMEA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/195,500/)).not.toBeInTheDocument();
  });

  it('supports search & status filtering, line-item creation with tax breakdown, and dueDate >= issueDate validation', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuthMock);

    const requestedUrls: string[] = [];
    let createdPayload: Record<string, unknown> | null = null;
    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL, init?: RequestInit) => {
      const url = req.toString();
      requestedUrls.push(url);
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.endsWith('/invoices') && init?.method === 'POST') {
        createdPayload = JSON.parse(String(init.body));
        return Promise.resolve(new Response(JSON.stringify({ id: 'inv-new' }), { status: 201, headers: jsonHeader }));
      }
      if (url.includes('/invoices') || url.includes('/bills') || url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      if (url.includes('/aging')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              asOfDate: '2026-11-12T00:00:00.000Z',
              currency: 'USD',
              receivablesAging: { totalOutstanding: '0.0000', totalOverdue: '0.0000', isComplete: true, missingCurrencies: [], buckets: [] },
              payablesAging: { totalOutstanding: '0.0000', totalOverdue: '0.0000', isComplete: true, missingCurrencies: [], buckets: [] },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Search invoices and bills/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Search invoices and bills/i), {
      target: { value: 'Lahore' },
    });
    fireEvent.change(screen.getByLabelText(/Filter by status/i), {
      target: { value: 'OVERDUE' },
    });

    await waitFor(() => {
      expect(
        requestedUrls.some((u) => u.includes('status=OVERDUE') && u.includes('search=Lahore')),
      ).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: /New Invoice \(AR\)/i }));

    fireEvent.change(screen.getByLabelText(/Invoice Number/i), { target: { value: 'INV-LI-1' } });
    fireEvent.change(screen.getByLabelText(/Customer Legal Name/i), {
      target: { value: 'Karachi Exports' },
    });
    fireEvent.change(screen.getByLabelText(/Revenue Category/i), {
      target: { value: 'Advisory Services' },
    });
    fireEvent.change(screen.getByLabelText(/Department/i), { target: { value: 'Finance' } });
    fireEvent.change(screen.getByLabelText(/Issue Date/i), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText(/Due Date/i), { target: { value: '2026-11-10' } });

    // Add line item
    fireEvent.click(screen.getByRole('button', { name: /Add Line Item/i }));
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Retainer' } });
    fireEvent.change(screen.getByLabelText(/Qty/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Unit Price/i), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Tax %/i), { target: { value: '10' } });

    // Submit with invalid dueDate < issueDate
    fireEvent.click(screen.getByRole('button', { name: /Create Customer Invoice/i }));
    await waitFor(() => {
      expect(screen.getByText(/Due date cannot be earlier than issue date/i)).toBeInTheDocument();
    });
    expect(createdPayload).toBeNull();

    // Fix dueDate >= issueDate and submit
    fireEvent.change(screen.getByLabelText(/Due Date/i), { target: { value: '2026-11-30' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Customer Invoice/i }));

    await waitFor(() => {
      expect(createdPayload).not.toBeNull();
    });
    expect(createdPayload).toMatchObject({
      invoiceNumber: 'INV-LI-1',
      category: 'Advisory Services',
      department: 'Finance',
      lineItems: [
        { description: 'Retainer', quantity: '2.0000', unitPrice: '500.0000', taxRate: '10.0000' },
      ],
    });
  });

  it('supports DRAFT -> ISSUED transition, detail payment history view, and safe VOID action', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue(baseAuthMock);

    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const draftInv = {
      id: 'inv-draft-1',
      organizationId: 'org-star',
      invoiceNumber: 'INV-D1',
      customerName: 'Draft Customer',
      category: 'Sales Revenue',
      department: 'Sales',
      issueDate: '2026-11-01T00:00:00.000Z',
      dueDate: '2026-11-30T00:00:00.000Z',
      subtotalAmount: '1000.0000',
      taxRate: '10.0000',
      taxAmount: '100.0000',
      totalAmount: '1100.0000',
      paidAmount: '0.0000',
      outstandingBalance: '1100.0000',
      currency: 'USD',
      status: 'DRAFT',
      lineItems: [
        {
          id: 'li-1',
          description: 'Consulting Package',
          quantity: '1.0000',
          unitPrice: '1000.0000',
          taxRate: '10.0000',
          taxAmount: '100.0000',
          lineSubtotal: '1000.0000',
          lineTotal: '1100.0000',
        },
      ],
      payments: [
        {
          id: 'pay-hist-1',
          organizationId: 'org-star',
          amount: '250.0000',
          currency: 'USD',
          paymentDate: '2026-11-05T00:00:00.000Z',
          method: 'BANK_TRANSFER',
          reference: 'WIRE-55',
          createdAt: '2026-11-05T00:00:00.000Z',
        },
      ],
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation((req: RequestInfo | URL, init?: RequestInit) => {
      const url = req.toString();
      const method = init?.method || 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const jsonHeader = { 'Content-Type': 'application/json' };
      if (url.endsWith('/invoices/inv-draft-1') && method === 'GET') {
        return Promise.resolve(new Response(JSON.stringify(draftInv), { status: 200, headers: jsonHeader }));
      }
      if (url.endsWith('/invoices/inv-draft-1') && method === 'PATCH') {
        return Promise.resolve(new Response(JSON.stringify({ ...draftInv, status: 'ISSUED' }), { status: 200, headers: jsonHeader }));
      }
      if (url.endsWith('/invoices/inv-draft-1/void') && method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ ...draftInv, status: 'VOID' }), { status: 200, headers: jsonHeader }));
      }
      if (url.includes('/invoices')) {
        return Promise.resolve(new Response(JSON.stringify([draftInv]), { status: 200, headers: jsonHeader }));
      }
      if (url.includes('/bills') || url.includes('/accounts')) {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200, headers: jsonHeader }));
      }
      if (url.includes('/aging')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              asOfDate: '2026-11-12T00:00:00.000Z',
              currency: 'USD',
              receivablesAging: { totalOutstanding: '0.0000', totalOverdue: '0.0000', isComplete: true, missingCurrencies: [], buckets: [] },
              payablesAging: { totalOutstanding: '0.0000', totalOverdue: '0.0000', isComplete: true, missingCurrencies: [], buckets: [] },
            }),
            { status: 200, headers: jsonHeader },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: jsonHeader }));
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Issue/i })).toBeInTheDocument();
    });

    // View Detail & Payment History modal
    fireEvent.click(screen.getByRole('button', { name: /View/i }));
    await waitFor(() => {
      expect(screen.getByText(/Invoice Details — INV-D1/i)).toBeInTheDocument();
      expect(screen.getByText('Consulting Package')).toBeInTheDocument();
      expect(screen.getByText('WIRE-55')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /^Close$/i }));

    // Activate DRAFT -> ISSUED
    fireEvent.click(screen.getByRole('button', { name: /Issue/i }));
    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'PATCH' && c.url.endsWith('/invoices/inv-draft-1')),
      ).toBe(true);
    });

    // Void unpaid invoice
    fireEvent.click(screen.getByRole('button', { name: /Void/i }));
    await waitFor(() => {
      expect(screen.getByText(/Void Invoice INV-D1/i)).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Void Reason/i), {
      target: { value: 'Cancelled order' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Void/i }));

    await waitFor(() => {
      expect(
        calls.some((c) => c.method === 'POST' && c.url.endsWith('/invoices/inv-draft-1/void')),
      ).toBe(true);
    });
  });
});
