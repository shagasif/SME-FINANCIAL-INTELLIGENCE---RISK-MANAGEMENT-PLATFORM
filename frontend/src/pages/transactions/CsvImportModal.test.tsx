import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { CsvImportModal } from './CsvImportModal';
import type { FinancialAccount } from '../../types/financial.types';
import * as apiClient from '../../services/apiClient';

vi.mock('../../services/apiClient', () => {
  return {
    apiPost: vi.fn(),
    ApiClientError: class ApiClientError extends Error {
      statusCode?: number;
      constructor(message: string, statusCode?: number) {
        super(message);
        this.statusCode = statusCode;
      }
    },
  };
});

const mockAccounts: FinancialAccount[] = [
  {
    id: 'acc-1',
    organizationId: 'org-test-99',
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

describe('CsvImportModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();
  const orgId = 'org-test-99';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal with destination account, Browse Financial File button, and supported accept attributes', () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    expect(screen.getByText(/4-Step Financial File Import Wizard/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Browse Financial File/i })).toBeInTheDocument();

    const fileInput = screen.getByTestId('csv-file-input') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.type).toBe('file');
    expect(fileInput.accept).toContain('.csv');
    expect(fileInput.accept).toContain('.xlsx');
    expect(fileInput.accept).toContain('.xls');
    expect(fileInput.accept).toContain('.json');
  });

  it('triggers click on the hidden file input when clicking Browse Financial File', () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    const browseBtn = screen.getByRole('button', { name: /Browse Financial File/i });
    fireEvent.click(browseBtn);

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('explicitly rejects PDF file uploads and shows dedicated error message', async () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const pdfFile = new File(['%PDF-1.5 fake binary'], 'bank_statement.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        'PDF files are not supported. Please upload a CSV, XLSX, XLS, or JSON financial statement.',
      );
    });
  });

  it('rejects unsupported file formats like .txt or .png', async () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const txtFile = new File(['hello world text'], 'notes.txt', {
      type: 'text/plain',
    });

    fireEvent.change(fileInput, { target: { files: [txtFile] } });

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(
        'Unsupported file type. Please upload a CSV, XLSX, XLS, or JSON financial statement.',
      );
    });
  });

  it('shows error if file has fewer than 2 rows', async () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const singleRowCsv = new File(['Date,Amount,Description\n'], 'single_row.csv', {
      type: 'text/csv',
    });

    fireEvent.change(fileInput, { target: { files: [singleRowCsv] } });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /must have at least one header row and one data row/i,
      );
    });
  });

  it('parses valid CSV file, previews headers and samples, and proceeds to mapping step', async () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const validCsvContent = `Date,Amount,Description,Type,Category
2026-10-15,1500.00,Client Invoice Payment,INCOME,Revenue
2026-10-16,-250.00,Office Supplies,EXPENSE,Operations`;

    const validCsvFile = new File([validCsvContent], 'bank_transactions.csv', {
      type: 'text/csv',
    });

    fireEvent.change(fileInput, { target: { files: [validCsvFile] } });

    await waitFor(() => {
      expect(screen.getByText('bank_transactions.csv')).toBeInTheDocument();
      expect(screen.getByText('(5 columns)')).toBeInTheDocument();
      expect(screen.getByText('CSV')).toBeInTheDocument();
      expect(screen.getByText('Raw File Header Preview')).toBeInTheDocument();
      expect(screen.getByText('Client Invoice Payment')).toBeInTheDocument();
    });

    const continueBtn = screen.getByRole('button', { name: /Continue to Column Mapping/i });
    expect(continueBtn).not.toBeDisabled();

    fireEvent.click(continueBtn);

    expect(screen.getByText('Column Mapping')).toBeInTheDocument();
    expect(screen.getByLabelText(/Transaction Date \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount \*/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description \/ Memo \*/i)).toBeInTheDocument();
  });

  it('parses JSON file containing transaction array and proceeds to mapping step', async () => {
    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const jsonRecords = [
      {
        Date: '2026-10-20',
        Amount: '450.00',
        Description: 'AWS Cloud Hosting',
        Type: 'EXPENSE',
      },
      {
        Date: '2026-10-21',
        Amount: '2200.00',
        Description: 'Enterprise Client Retainer',
        Type: 'INCOME',
      },
    ];

    const jsonFile = new File([JSON.stringify(jsonRecords)], 'transactions.json', {
      type: 'application/json',
    });

    fireEvent.change(fileInput, { target: { files: [jsonFile] } });

    await waitFor(() => {
      expect(screen.getByText('transactions.json')).toBeInTheDocument();
      expect(screen.getByText('JSON')).toBeInTheDocument();
      expect(screen.getByText('AWS Cloud Hosting')).toBeInTheDocument();
    });

    const continueBtn = screen.getByRole('button', { name: /Continue to Column Mapping/i });
    fireEvent.click(continueBtn);

    expect(screen.getByText('Column Mapping')).toBeInTheDocument();
  });

  it('parses Excel workbook with multiple worksheets and switches active sheet', async () => {
    // Generate valid XLSX binary with two worksheets
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Date', 'Amount', 'Description'],
      ['2026-10-01', '100.00', 'Sheet1 Payment'],
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Date', 'Amount', 'Description'],
      ['2026-10-02', '999.00', 'Sheet2 Consulting Fee'],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, 'Operations');
    XLSX.utils.book_append_sheet(wb, ws2, 'Consulting');

    const wbArray = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const excelFile = new File([wbArray], 'multisheet_statement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    fireEvent.change(fileInput, { target: { files: [excelFile] } });

    await waitFor(() => {
      expect(screen.getByText('multisheet_statement.xlsx')).toBeInTheDocument();
      expect(screen.getByText('Excel (XLSX)')).toBeInTheDocument();
      expect(screen.getByText('Sheet1 Payment')).toBeInTheDocument();
      expect(screen.getByLabelText(/Select Excel Worksheet/i)).toBeInTheDocument();
      expect(screen.getByText('2 worksheets detected')).toBeInTheDocument();
    });

    // Switch worksheet to Consulting
    const sheetSelect = screen.getByLabelText(/Select Excel Worksheet/i);
    fireEvent.change(sheetSelect, { target: { value: 'Consulting' } });

    await waitFor(() => {
      expect(screen.getByText('Sheet2 Consulting Fee')).toBeInTheDocument();
    });
  });

  it('enforces tenant isolation and displays duplicate warning in Step 3', async () => {
    const mockPost = vi.mocked(apiClient.apiPost);
    mockPost.mockResolvedValueOnce({
      id: 'batch-999',
      organizationId: orgId,
      accountId: 'acc-1',
      fileName: 'bank_transactions.csv',
      totalRows: 10,
      validRows: 8,
      duplicateRowsCount: 2,
      invalidRows: 0,
      previewRows: [
        {
          date: '2026-10-15',
          amount: '1500.00',
          description: 'Client Invoice Payment',
          type: 'INCOME',
        },
      ],
      rowErrors: [],
      status: 'PREVIEW',
    });

    mockPost.mockResolvedValueOnce({
      success: true,
      batchId: 'batch-999',
    });

    render(
      <CsvImportModal
        isOpen={true}
        onClose={mockOnClose}
        accounts={mockAccounts}
        orgId={orgId}
        onSuccess={mockOnSuccess}
      />,
    );

    const fileInput = screen.getByTestId('csv-file-input');
    const validCsv = `Date,Amount,Description\n2026-10-15,1500.00,Client Invoice Payment\n`;
    fireEvent.change(fileInput, {
      target: { files: [new File([validCsv], 'bank_transactions.csv', { type: 'text/csv' })] },
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Continue to Column Mapping/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /Continue to Column Mapping/i }));

    // Click validate & preview batch
    const previewBtn = screen.getByRole('button', { name: /Validate & Preview Batch/i });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      // Check tenant isolation: preview API called with orgId
      expect(mockPost).toHaveBeenCalledWith(
        `/v1/organizations/${orgId}/csv-imports/preview`,
        expect.objectContaining({
          accountId: 'acc-1',
          fileName: 'bank_transactions.csv',
        }),
      );
    });

    // Check Step 3 UI renders KPI & duplicate warning
    await waitFor(() => {
      expect(screen.getByText('Validation Preview')).toBeInTheDocument();
      expect(screen.getByText('Duplicates')).toBeInTheDocument();
      expect(
        screen.getByText(/Skip 2 duplicate records during commitment/i),
      ).toBeInTheDocument();
    });

    // Check that duplicate skipping checkbox is checked by default
    const skipCheckbox = screen.getByLabelText(
      /Skip 2 duplicate records during commitment \(Recommended\)/i,
    ) as HTMLInputElement;
    expect(skipCheckbox.checked).toBe(true);

    // Commit batch
    const commitBtn = screen.getByRole('button', { name: /Commit 6 Records to Ledger/i });
    fireEvent.click(commitBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        `/v1/organizations/${orgId}/csv-imports/batch-999/confirm`,
        { skipDuplicates: true },
      );
      expect(screen.getByText('Import Committed Successfully!')).toBeInTheDocument();
      expect(mockOnSuccess).toHaveBeenCalledTimes(1);
    });
  });
});
