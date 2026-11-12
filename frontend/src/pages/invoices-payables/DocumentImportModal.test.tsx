import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as apiClientModule from '../../services/apiClient';
import * as useAuthModule from '../../context/useAuth';
import { RoleType } from '../../types/auth.types';
import type { DocumentImportExtractionResponse } from '../../types/financial.types';
import { DocumentImportModal, MAX_DOCUMENT_IMPORT_BYTES } from './DocumentImportModal';
import { InvoicesPayablesPage } from './InvoicesPayablesPage';

const baseExtractedInvoiceResponse: DocumentImportExtractionResponse = {
  success: true,
  savedToDatabase: false,
  ledgerMutationPerformed: false,
  documentType: 'INVOICE',
  fileMetadata: {
    fileName: 'Star_Business_Invoice.pdf',
    mimeType: 'application/pdf',
    detectedFormat: 'pdf',
    sizeBytes: 4200,
    checksumSha256: 'abc123checksumabc123checksumabc123checksumabc123checksumabc12345',
  },
  extractionMetadata: {
    extractionMethod: 'PDF_EMBEDDED_TEXT',
    extractedCharCount: 340,
    pageCount: 1,
    ocrConfidence: null,
    provider: 'deterministic-grounded',
    externalVisionConfigured: false,
    warnings: ['Total amount derived from extracted subtotal + tax.'],
    limitations: [
      'External multimodal Vision AI provider is not configured; extraction used local PDF text.',
    ],
  },
  extractedTextPreview: 'TAX INVOICE\nInvoice Number: INV-PDF-2026\nTotal: USD 3850.00',
  extractedDocument: {
    documentType: 'INVOICE',
    documentNumber: 'INV-PDF-2026',
    counterpartyName: 'NorthStar Logistics Corp',
    counterpartyEmail: null,
    category: 'Sales Revenue',
    department: null,
    issueDate: '2026-10-01',
    dueDate: '2026-10-31',
    currency: 'USD',
    currencySource: 'DOCUMENT',
    subtotalAmount: '3500.0000',
    taxRate: '10.0000',
    taxAmount: '350.0000',
    totalAmount: '3850.0000',
    notes: null,
  },
  lineItems: [
    {
      description: 'Advisory Retainer & Quarterly Forecasting Services',
      quantity: '2.0000',
      unitPrice: '1500.0000',
      taxRate: '10.0000',
      lineSubtotal: '3000.0000',
      lineTaxAmount: '300.0000',
      lineTotal: '3300.0000',
      confidence: 0.92,
    },
    {
      description: 'Onboarding Setup',
      quantity: '1.0000',
      unitPrice: '500.0000',
      taxRate: '10.0000',
      lineSubtotal: '500.0000',
      lineTaxAmount: '50.0000',
      lineTotal: '550.0000',
      confidence: 0.9,
    },
  ],
  fieldConfidence: {
    documentNumber: 0.9,
    counterpartyName: 0.88,
    counterpartyEmail: 0,
    issueDate: 0.9,
    dueDate: 0.72,
    currency: 0.94,
    subtotalAmount: 0.9,
    taxRate: 0.88,
    taxAmount: 0.88,
    totalAmount: 0.92,
    lineItems: 0.91,
  },
  arithmeticVerification: {
    isValid: true,
    lineItemsMatchSubtotal: true,
    subtotalPlusTaxMatchesTotal: true,
    taxRateMatchesTaxAmount: true,
    dateOrderValid: true,
    calculatedLineItemsSubtotal: '3500.0000',
    calculatedTotalAmount: '3850.0000',
    discrepancies: [],
    missingRequiredFields: [],
    summary:
      'Extracted document passed deterministic arithmetic, date order, and required field verification.',
  },
  duplicateWarnings: {
    hasPotentialDuplicate: false,
    checksumMatched: false,
    documentNumberConflict: false,
    similarRecordMatch: false,
    previouslyExtractedNotSaved: true,
    previousExtractionInfo: {
      previouslyExtracted: true,
      extractionCount: 2,
      lastExtractedAt: '2026-10-06T00:00:00.000Z',
      message:
        'This document was previously extracted 2 time(s) for preview, but has not been saved as a customer invoice yet.',
    },
    matches: [],
  },
  sanitizationFlags: [],
  aiOrchestration: {
    workflowRunId: 'wf-doc-1',
    taskClassification: 'CUSTOMER_INVOICE_DOCUMENT_EXTRACTION',
    durationMs: 42,
    isApproved: true,
    requiresHumanReview: false,
    validationErrors: [],
    confidenceScore: 0.86,
  },
};

const savedDuplicateInvoiceResponse: DocumentImportExtractionResponse = {
  ...baseExtractedInvoiceResponse,
  duplicateWarnings: {
    hasPotentialDuplicate: true,
    checksumMatched: true,
    documentNumberConflict: true,
    similarRecordMatch: false,
    previouslyExtractedNotSaved: false,
    previousExtractionInfo: null,
    matches: [
      {
        matchType: 'FILE_CHECKSUM',
        recordId: 'inv-existing',
        documentNumber: 'INV-PDF-2026',
        counterpartyName: 'NorthStar Logistics Corp',
        issueDate: '2026-10-01',
        totalAmount: '3850.0000',
        status: 'DRAFT',
        reason: 'This document file has already been saved as customer invoice "INV-PDF-2026" (DRAFT).',
      },
    ],
  },
};

const mockBillExtractionResponse: DocumentImportExtractionResponse = {
  ...baseExtractedInvoiceResponse,
  documentType: 'BILL',
  fileMetadata: {
    fileName: 'zenith_bill.png',
    mimeType: 'image/png',
    detectedFormat: 'png',
    sizeBytes: 9800,
    checksumSha256: 'billpng999billpng999billpng999billpng999billpng999billpng9991234',
  },
  extractionMetadata: {
    extractionMethod: 'IMAGE_OCR',
    extractedCharCount: 210,
    pageCount: 1,
    ocrConfidence: 87.5,
    provider: 'deterministic-grounded',
    externalVisionConfigured: false,
    warnings: ['Total amount derived from extracted subtotal + tax.'],
    limitations: [
      'External multimodal Vision AI provider is not configured; extraction used local offline Tesseract OCR.',
    ],
  },
  extractedDocument: {
    ...baseExtractedInvoiceResponse.extractedDocument,
    documentType: 'BILL',
    documentNumber: 'BILL-OCR-771',
    counterpartyName: null,
    counterpartyEmail: 'billing@zenith.io',
    category: 'Operating Expense',
    subtotalAmount: '1000.0000',
    taxRate: '15.0000',
    taxAmount: '150.0000',
    totalAmount: '1150.0000',
  },
  fieldConfidence: {
    ...baseExtractedInvoiceResponse.fieldConfidence,
    counterpartyName: 0,
    counterpartyEmail: 0.92,
  },
  lineItems: [],
  arithmeticVerification: {
    ...baseExtractedInvoiceResponse.arithmeticVerification,
    isValid: false,
    missingRequiredFields: ['supplierName'],
    summary: 'Manual review required: 1 missing field(s), 0 verification discrepancy(ies).',
  },
  duplicateWarnings: {
    hasPotentialDuplicate: false,
    checksumMatched: false,
    documentNumberConflict: false,
    similarRecordMatch: false,
    previouslyExtractedNotSaved: false,
    previousExtractionInfo: null,
    matches: [],
  },
};

describe('DocumentImportModal & InvoicesPayablesPage Document Import UI Refinements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows short modal titles ("Import Customer Invoice" / "Import Supplier Bill") in both sections', async () => {
    vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', email: 'owner@star.com', fullName: 'Owner', isPlatformAdmin: false },
      activeOrg: { id: 'org-star', name: 'star', slug: 'star', baseCurrency: 'USD', role: RoleType.BUSINESS_OWNER },
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

    vi.spyOn(apiClientModule, 'apiGet').mockImplementation(async (path: string) => {
      if (path.includes('/aging')) {
        return {
          asOfDate: '2026-11-11T00:00:00.000Z',
          currency: 'USD',
          receivablesAging: { totalOutstanding: '0', totalOverdue: '0', isComplete: true, missingCurrencies: [], buckets: [] },
          payablesAging: { totalOutstanding: '0', totalOverdue: '0', isComplete: true, missingCurrencies: [], buckets: [] },
        };
      }
      return [];
    });

    render(
      <BrowserRouter>
        <InvoicesPayablesPage />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Import$/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Upload PDF or image invoices/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    expect(screen.getByRole('heading', { name: 'Import Customer Invoice' })).toBeInTheDocument();
    expect(screen.getByText(/PDF, JPG, JPEG, PNG/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    fireEvent.click(screen.getByRole('button', { name: /Supplier Bills/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Import$/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Upload PDF or image supplier bills/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Import$/i }));
    expect(screen.getByRole('heading', { name: 'Import Supplier Bill' })).toBeInTheDocument();
  });

  it('rejects unsupported extensions, empty files, and >10 MB files cleanly on the client without uploading', async () => {
    const apiPostSpy = vi.spyOn(apiClientModule, 'apiPost');

    render(
      <DocumentImportModal
        isOpen={true}
        onClose={vi.fn()}
        documentType="INVOICE"
        orgId="org-star"
        orgCurrency="USD"
        onSuccess={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText(/Select Customer Invoice Document/i) as HTMLInputElement;

    const badExt = new File(['abc'], 'statement.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [badExt] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unsupported file format/i);

    const emptyPdf = new File([], 'empty.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [emptyPdf] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/empty \(0 bytes\)/i);

    const hugeFile = new File(['x'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(hugeFile, 'size', { value: MAX_DOCUMENT_IMPORT_BYTES + 1 });
    fireEvent.change(fileInput, { target: { files: [hugeFile] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/exceeds the 10 MB/i);

    expect(apiPostSpy).not.toHaveBeenCalled();
  });

  it('hides unnecessary notices, renders single Verified badge beside filename, clean valid inputs, line-item headers, and saves on confirmation', async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    const apiPostSpy = vi
      .spyOn(apiClientModule, 'apiPost')
      .mockImplementation(async (path: string) => {
        if (path.endsWith('/invoices/import/extract')) {
          return baseExtractedInvoiceResponse;
        }
        if (path.endsWith('/invoices')) {
          return { id: 'inv-created-1' };
        }
        return {};
      });

    render(
      <DocumentImportModal
        isOpen={true}
        onClose={onClose}
        documentType="INVOICE"
        orgId="org-star"
        orgCurrency="USD"
        onSuccess={onSuccess}
      />,
    );

    const fileInput = screen.getByLabelText(/Select Customer Invoice Document/i) as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4 test'], 'Star_Business_Invoice.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith(
        '/v1/organizations/org-star/invoices/import/extract',
        expect.any(FormData),
        undefined,
        undefined,
        60_000,
      );
    });

    expect(await screen.findByDisplayValue('INV-PDF-2026')).toBeInTheDocument();

    // 1. Unnecessary notices removed (Verifier AI banner, derived total notice, extraction-only blue banner, duplicate warning)
    expect(screen.queryByText(/Total amount derived from extracted subtotal \+ tax/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verifier AI:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/previously extracted/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Potential Duplicate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PDF_EMBEDDED_TEXT/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Extraction Limitation/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\b90%\b|\b92%\b|\b86%\b/)).not.toBeInTheDocument();

    // 2. Single green Verified badge beside filename; ZERO green ticks inside input fields
    expect(screen.getByText('Star_Business_Invoice.pdf')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.queryByLabelText(/: Verified/i)).not.toBeInTheDocument();

    // Valid inputs remain clean with no amber/red borders or warning icons
    const invoiceNumInput = screen.getByLabelText(/Invoice Number \*/i);
    expect(invoiceNumInput.className).not.toMatch(/border-amber-500|border-red-500|border-emerald-500/);
    expect(screen.queryByLabelText(/Needs review|Required field missing/i)).not.toBeInTheDocument();

    // 4. Line items table headers & single-line Add Item button
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Qty')).toBeInTheDocument();
    expect(screen.getByText('Unit Price')).toBeInTheDocument();
    expect(screen.getByText('Tax %')).toBeInTheDocument();
    const addBtn = screen.getByRole('button', { name: /Add Item/i });
    expect(addBtn.className).toContain('whitespace-nowrap');

    // Save proceeds cleanly with checksum (extraction-only history never blocks saving)
    const saveBtn = screen.getByRole('button', { name: /^Save Invoice$/i });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledTimes(2);
    });
    const [savePath, savePayload] = apiPostSpy.mock.calls[1] as [string, Record<string, unknown>];
    expect(savePath).toBe('/v1/organizations/org-star/invoices');
    expect(savePayload.sourceDocumentChecksum).toBe(
      baseExtractedInvoiceResponse.fileMetadata.checksumSha256,
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays duplicate warning and blocks saving when document was actually saved before', async () => {
    const duplicateSavedResponse: DocumentImportExtractionResponse = {
      ...savedDuplicateInvoiceResponse,
      extractedDocument: {
        ...savedDuplicateInvoiceResponse.extractedDocument,
        documentNumber: 'INV-SB-2026-101',
        currency: 'PKR',
      },
      duplicateWarnings: {
        ...savedDuplicateInvoiceResponse.duplicateWarnings,
        matches: [
          {
            matchType: 'FILE_CHECKSUM',
            recordId: 'inv-existing',
            documentNumber: 'INV-SB-2026-101',
            counterpartyName: 'Al-Madina Traders',
            issueDate: '2026-11-11',
            totalAmount: '55000.0000',
            currency: 'PKR',
            status: 'DRAFT',
            reason: 'This file is already saved as Invoice INV-SB-2026-101 (Draft) for PKR 55,000.',
          },
        ],
      },
    };
    const apiPostSpy = vi.spyOn(apiClientModule, 'apiPost').mockResolvedValueOnce(
      duplicateSavedResponse,
    );

    render(
      <DocumentImportModal
        isOpen={true}
        onClose={vi.fn()}
        documentType="INVOICE"
        orgId="org-star"
        orgCurrency="PKR"
        onSuccess={vi.fn()}
      />,
    );

    const fileInput = screen.getByLabelText(/Select Customer Invoice Document/i) as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4 test'], 'Star_Business_Invoice.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    expect(await screen.findByText('Duplicate Document Detected')).toBeInTheDocument();
    expect(
      screen.getByText('This file is already saved as Invoice INV-SB-2026-101 (Draft) for PKR 55,000.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\[FILE_CHECKSUM\]/i)).not.toBeInTheDocument();
    // Verified badge is not shown for duplicate/blocked save
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Save Invoice$/i })).toBeDisabled();
    expect(apiPostSpy).toHaveBeenCalledTimes(1);
  });

  it('hides Verified badge when Supplier Name is missing, highlights only that input with ! warning, clears highlight once entered, and saves Bill', async () => {
    const onSuccess = vi.fn();
    let failSaveOnce = true;

    const apiPostSpy = vi
      .spyOn(apiClientModule, 'apiPost')
      .mockImplementation(async (path: string) => {
        if (path.endsWith('/bills/import/extract')) {
          return mockBillExtractionResponse;
        }
        if (path.endsWith('/bills')) {
          if (failSaveOnce) {
            failSaveOnce = false;
            throw new apiClientModule.ApiClientError('Bill number BILL-OCR-771 already exists', 409);
          }
          return { id: 'bill-created-1' };
        }
        return {};
      });

    render(
      <DocumentImportModal
        isOpen={true}
        onClose={vi.fn()}
        documentType="BILL"
        orgId="org-star"
        orgCurrency="USD"
        onSuccess={onSuccess}
      />,
    );

    const fileInput = screen.getByLabelText(/Select Supplier Bill Document/i) as HTMLInputElement;
    const pngFile = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'zenith_bill.png', {
      type: 'image/png',
    });
    fireEvent.change(fileInput, { target: { files: [pngFile] } });

    expect(await screen.findByDisplayValue('BILL-OCR-771')).toBeInTheDocument();

    // Missing required field -> Verified badge is NOT shown; ONLY Supplier Name highlighted with warning icon
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Supplier Name: Required field missing')).toBeInTheDocument();
    const supplierInput = screen.getByLabelText(/Supplier Name \*/i);
    expect(supplierInput.className).toContain('border-amber-500');

    // Unrelated valid fields (e.g. Bill Number) remain completely clean without warning border or icon
    const billNumInput = screen.getByLabelText(/Bill Number \*/i);
    expect(billNumInput.className).not.toContain('border-amber-500');
    expect(screen.queryByLabelText(/Bill Number:/i)).not.toBeInTheDocument();

    // User enters lowercase Supplier Name -> field cleans up, Auto Title Case normalizes on save, and Verified badge appears
    fireEvent.change(supplierInput, { target: { value: 'zenith cloud corp' } });
    expect(screen.queryByLabelText('Supplier Name: Required field missing')).not.toBeInTheDocument();
    expect(supplierInput.className).not.toContain('border-amber-500');
    expect(screen.getByText('Verified')).toBeInTheDocument();
    // Still zero green ticks on individual inputs!
    expect(screen.queryByLabelText(/: Verified/i)).not.toBeInTheDocument();

    // Backend 409 displays cleanly
    fireEvent.click(screen.getByRole('button', { name: /^Save Bill$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/BILL-OCR-771 already exists/i);
    expect(onSuccess).not.toHaveBeenCalled();

    // Fix Bill Number and save cleanly
    fireEvent.change(billNumInput, { target: { value: 'BILL-OCR-772' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save Bill$/i }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    const [savePath, savePayload] = apiPostSpy.mock.calls[2] as [string, Record<string, unknown>];
    expect(savePath).toBe('/v1/organizations/org-star/bills');
    expect(savePayload.billNumber).toBe('BILL-OCR-772');
    expect(savePayload.supplierName).toBe('Zenith Cloud Corp');
  });
});
