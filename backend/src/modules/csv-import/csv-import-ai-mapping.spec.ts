import { jest } from '@jest/globals';
import { AgentType, RoleType, Prisma } from '../../generated/prisma/client.js';
import { DecimalMath } from '../../common/utils/decimal-math.js';
import { AgentSkillsRegistryService } from '../ai-orchestration/skills/agent-skills-registry.service.js';
import { SupervisorOrchestratorService } from '../ai-orchestration/supervisor-orchestrator.service.js';
import { CsvImportService } from './csv-import.service.js';

describe('Financial File Auto-Mapping via Supervisor Orchestrator, Finance Data Analyst & Verifier AI', () => {
  describe('AgentSkillsRegistryService.profileSchemaAndColumns (Finance Data Analyst Agent)', () => {
    it('correctly maps standard financial statement headers and corroborates with sample rows', () => {
      const headers = ['Date', 'Amount', 'Description', 'Type', 'Category', 'Payee'];
      const sampleRows = [
        ['2026-10-01', '12500.50', 'Enterprise SaaS License Renewal', 'INCOME', 'Sales', 'Acme Corp'],
        ['2026-10-02', '-450.00', 'AWS Cloud Services', 'EXPENSE', 'Infrastructure', 'Amazon Web Services'],
      ];

      const profiling = AgentSkillsRegistryService.profileSchemaAndColumns(
        'october_statement.csv',
        headers,
        sampleRows,
      );

      expect(profiling.detectedMappings.dateColumn).toBe('Date');
      expect(profiling.detectedMappings.amountColumn).toBe('Amount');
      expect(profiling.detectedMappings.descriptionColumn).toBe('Description');
      expect(profiling.detectedMappings.typeColumn).toBe('Type');
      expect(profiling.detectedMappings.categoryColumn).toBe('Category');
      expect(profiling.detectedMappings.counterpartyColumn).toBe('Payee');

      expect(profiling.confidenceScores.date).toBeGreaterThanOrEqual(0.85);
      expect(profiling.confidenceScores.amount).toBeGreaterThanOrEqual(0.85);
      expect(profiling.confidenceScores.description).toBeGreaterThanOrEqual(0.70);
      expect(profiling.unmappedHeaders).toEqual([]);
    });

    it('handles ambiguous columns without wild guessing and notes ambiguity', () => {
      const headers = ['Posting Date', 'Value Date', 'Txn Amount', 'Ledger Balance', 'Memo'];
      const sampleRows = [
        ['2026-10-01', '2026-10-03', '500.00', '15000.00', 'Vendor Payment'],
      ];

      const profiling = AgentSkillsRegistryService.profileSchemaAndColumns(
        'ambiguous_statement.csv',
        headers,
        sampleRows,
      );

      // Posting Date preferred over Value Date, Txn Amount preferred over Ledger Balance
      expect(profiling.detectedMappings.dateColumn).toBe('Posting Date');
      expect(profiling.detectedMappings.amountColumn).toBe('Txn Amount');
      expect(profiling.detectedMappings.descriptionColumn).toBe('Memo');
      expect(profiling.fieldAnalysis.date).toContain('Ambiguity detected');
    });

    it('leaves unmapped columns with 0.0 confidence when headers cannot be recognized', () => {
      const headers = ['RandomColA', 'RandomColB', 'RandomColC'];
      const sampleRows = [['xyz', 'abc', '123']];

      const profiling = AgentSkillsRegistryService.profileSchemaAndColumns(
        'unrecognized.csv',
        headers,
        sampleRows,
      );

      expect(profiling.detectedMappings.dateColumn).toBeNull();
      expect(profiling.confidenceScores.date).toBe(0);
      expect(profiling.unmappedHeaders).toContain('RandomColA');
    });
  });

  describe('AgentSkillsRegistryService.verifyColumnMappings (Verifier AI Agent)', () => {
    it('approves valid mappings with high confidence', () => {
      const headers = ['TxnDate', 'TotalAmount', 'Narrative'];
      const sampleRows = [
        ['2026-10-01', '2500.00', 'Consulting fee'],
        ['2026-10-02', '120.00', 'Office supplies'],
      ];
      const detectedMappings = {
        dateColumn: 'TxnDate',
        amountColumn: 'TotalAmount',
        descriptionColumn: 'Narrative',
      };
      const confidenceScores = {
        date: 0.95,
        amount: 0.95,
        description: 0.85,
      };

      const verification = AgentSkillsRegistryService.verifyColumnMappings(
        headers,
        sampleRows,
        detectedMappings,
        confidenceScores,
      );

      expect(verification.isApproved).toBe(true);
      expect(verification.validationErrors).toHaveLength(0);
      expect(verification.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(verification.requiresManualReview).toBe(false);
    });

    it('flags rejection when mandatory Date column is missing', () => {
      const headers = ['TotalAmount', 'Narrative'];
      const sampleRows = [['2500.00', 'Consulting fee']];
      const detectedMappings = {
        dateColumn: null,
        amountColumn: 'TotalAmount',
        descriptionColumn: 'Narrative',
      };
      const confidenceScores = {
        date: 0,
        amount: 0.95,
        description: 0.85,
      };

      const verification = AgentSkillsRegistryService.verifyColumnMappings(
        headers,
        sampleRows,
        detectedMappings,
        confidenceScores,
      );

      expect(verification.isApproved).toBe(false);
      expect(verification.validationErrors).toEqual(
        expect.arrayContaining([expect.stringContaining('Required field "Date" is not mapped')]),
      );
      expect(verification.requiresManualReview).toBe(true);
    });

    it('flags rejection when a header collision occurs', () => {
      const headers = ['SharedColumn', 'Narrative'];
      const sampleRows = [['100', 'Some text']];
      const detectedMappings = {
        dateColumn: 'SharedColumn',
        amountColumn: 'SharedColumn',
        descriptionColumn: 'Narrative',
      };
      const confidenceScores = {
        date: 0.5,
        amount: 0.5,
        description: 0.85,
      };

      const verification = AgentSkillsRegistryService.verifyColumnMappings(
        headers,
        sampleRows,
        detectedMappings,
        confidenceScores,
      );

      expect(verification.isApproved).toBe(false);
      expect(verification.validationErrors).toEqual(
        expect.arrayContaining([expect.stringContaining('Column conflict')]),
      );
    });

    it('flags validation error if mapped amount column contains non-numeric sample values', () => {
      const headers = ['Date', 'Amount', 'Narrative'];
      const sampleRows = [
        ['2026-10-01', 'Not An Amount', 'Sample text'],
        ['2026-10-02', 'Still Invalid', 'Sample text 2'],
      ];
      const detectedMappings = {
        dateColumn: 'Date',
        amountColumn: 'Amount',
        descriptionColumn: 'Narrative',
      };
      const confidenceScores = {
        date: 0.95,
        amount: 0.70,
        description: 0.85,
      };

      const verification = AgentSkillsRegistryService.verifyColumnMappings(
        headers,
        sampleRows,
        detectedMappings,
        confidenceScores,
      );

      expect(verification.isApproved).toBe(false);
      expect(verification.validationErrors).toEqual(
        expect.arrayContaining([expect.stringContaining('contains no valid numeric amounts')]),
      );
    });
  });

  describe('CsvImportService.autoMapColumns integration', () => {
    it('dispatches to supervisor orchestrator and returns full AI metadata', async () => {
      const mockSupervisor = {
        orchestrateFileSchemaMapping: jest.fn().mockResolvedValue({
          workflowRunId: 'wf-123',
          taskClassification: 'FILE_SCHEMA_PROFILING_AND_COLUMN_MAPPING',
          durationMs: 42,
          analystResult: {
            detectedMappings: {
              dateColumn: 'Date',
              amountColumn: 'Amount',
              descriptionColumn: 'Description',
            },
            confidenceScores: { date: 0.95, amount: 0.95, description: 0.85 },
            fieldAnalysis: { date: 'Mapped to Date' },
            unmappedHeaders: [],
            notes: 'Profiled 3 headers',
          },
          verifierResult: {
            isApproved: true,
            verifiedMappings: {
              dateColumn: 'Date',
              amountColumn: 'Amount',
              descriptionColumn: 'Description',
            },
            validationErrors: [],
            confidenceScore: 0.92,
            requiresManualReview: false,
            notes: 'Verifier AI verified mappings',
          },
        }),
      };

      const mockAiProvider = {
        getProviderConfigurationSummary: jest.fn().mockReturnValue({
          activeProvider: 'gemini',
          externalCredentialsConfigured: true,
        }),
      };

      const service = new CsvImportService(
        {} as any,
        {} as any,
        mockSupervisor as any,
        mockAiProvider as any,
      );

      const user = {
        userId: 'usr-1',
        email: 'test@example.com',
        sessionId: 'sess-1',
        role: RoleType.BUSINESS_OWNER,
        organizationRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        organizationId: 'org-1',
      };

      const result = await service.autoMapColumns(
        'org-1',
        {
          fileName: 'statement.csv',
          headers: ['Date', 'Amount', 'Description'],
          sampleRows: [['2026-10-01', '100.00', 'Test']],
        },
        user,
      );

      expect(result.success).toBe(true);
      expect(result.provider).toBe('gemini');
      expect(result.externalCredentialsConfigured).toBe(true);
      expect(result.workflowRunId).toBe('wf-123');
      expect(result.verifierResult.isApproved).toBe(true);
      expect(mockSupervisor.orchestrateFileSchemaMapping).toHaveBeenCalledWith({
        organizationId: 'org-1',
        userId: 'usr-1',
        userRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        fileName: 'statement.csv',
        headers: ['Date', 'Amount', 'Description'],
        sampleRows: [['2026-10-01', '100.00', 'Test']],
      });
    });
  });

  describe('SupervisorOrchestratorService.orchestrateFileSchemaMapping Prisma field compliance', () => {
    it('updates WorkflowRun with durationMs (and not totalDurationMs) on success', async () => {
      const mockWorkflowRun = { id: 'wf-test-1', organizationId: 'org-1' };
      const mockAgentRun = { id: 'ag-test-1' };
      const updateCalls: Array<{ where: any; data: any }> = [];

      const mockPrisma = {
        workflowRun: {
          create: jest.fn().mockResolvedValue(mockWorkflowRun),
          update: jest.fn().mockImplementation((args: any) => {
            updateCalls.push(args);
            return Promise.resolve({ ...mockWorkflowRun, ...args.data });
          }),
        },
        agentRun: {
          create: jest.fn().mockResolvedValue(mockAgentRun),
          update: jest.fn().mockResolvedValue(mockAgentRun),
        },
      };

      const mockSandbox = {
        createSandboxContext: jest.fn().mockReturnValue({
          sandboxId: 'sb-1',
          allowedTools: [],
          invokedTools: [],
          blockedOperations: [],
        }),
        releaseSandbox: jest.fn(),
      };

      const mockSkillsRegistry = {
        executeSkill: jest.fn().mockImplementation((skillId: string) => {
          if (skillId === 'skill.file-schema-profiling-and-column-mapping') {
            return Promise.resolve({
              output: {
                detectedMappings: {
                  dateColumn: 'Date',
                  amountColumn: 'Amount',
                  descriptionColumn: 'Desc',
                },
                confidenceScores: { date: 0.95, amount: 0.95, description: 0.9 },
                fieldAnalysis: {},
                unmappedHeaders: [],
                notes: 'Profiled',
              },
              invokedMcpTools: [],
              sourceRecordIds: {},
              modelUsage: { provider: 'deterministic-grounded', totalTokens: 100 },
            });
          }
          return Promise.resolve({
            output: {
              isApproved: true,
              verifiedMappings: {
                dateColumn: 'Date',
                amountColumn: 'Amount',
                descriptionColumn: 'Desc',
              },
              validationErrors: [],
              confidenceScore: 0.95,
              requiresManualReview: false,
              notes: 'Approved',
            },
            invokedMcpTools: [],
            sourceRecordIds: {},
            modelUsage: { provider: 'deterministic-grounded', totalTokens: 100 },
          });
        }),
      };

      const mockAudit = { record: jest.fn().mockResolvedValue({}) };

      const orchestrator = new SupervisorOrchestratorService(
        mockPrisma as any,
        {} as any,
        mockSandbox as any,
        mockSkillsRegistry as any,
        mockAudit as any,
      );

      const result = await orchestrator.orchestrateFileSchemaMapping({
        organizationId: 'org-1',
        userId: 'usr-1',
        userRole: RoleType.BUSINESS_OWNER,
        isPlatformAdmin: false,
        fileName: 'test.csv',
        headers: ['Date', 'Amount', 'Desc'],
        sampleRows: [['2026-10-01', '50.00', 'Coffee']],
      });

      expect(result.workflowRunId).toBe('wf-test-1');
      expect(updateCalls).toHaveLength(1);
      const updatePayload = updateCalls[0].data;

      // Ensure durationMs is recorded and invalid totalDurationMs is NOT present
      expect(updatePayload).toHaveProperty('durationMs');
      expect(typeof updatePayload.durationMs).toBe('number');
      expect(updatePayload).not.toHaveProperty('totalDurationMs');
      expect(updatePayload.status).toBe('COMPLETED');
      expect(updatePayload.verificationStatus).toBe('APPROVED');
      expect(updatePayload.completedAt).toBeInstanceOf(Date);
    });

    it('records durationMs and errorHookLog on failure, and does not hide original error if db update fails', async () => {
      const mockWorkflowRun = { id: 'wf-fail-1', organizationId: 'org-1' };
      const updateCalls: Array<{ where: any; data: any }> = [];

      const mockPrisma = {
        workflowRun: {
          create: jest.fn().mockResolvedValue(mockWorkflowRun),
          update: jest.fn().mockImplementation((args: any) => {
            updateCalls.push(args);
            // Simulate secondary DB error during catch block update
            return Promise.reject(new Error('Simulated secondary DB error'));
          }),
        },
        agentRun: {
          create: jest.fn().mockRejectedValue(new Error('Primary specialist execution error')),
        },
      };

      const mockSandbox = {
        createSandboxContext: jest.fn().mockReturnValue({ sandboxId: 'sb-1' }),
        releaseSandbox: jest.fn(),
      };

      const orchestrator = new SupervisorOrchestratorService(
        mockPrisma as any,
        {} as any,
        mockSandbox as any,
        {} as any,
        {} as any,
      );

      // Verify original error is rethrown and NOT masked by the secondary DB failure
      await expect(
        orchestrator.orchestrateFileSchemaMapping({
          organizationId: 'org-1',
          userId: 'usr-1',
          userRole: RoleType.BUSINESS_OWNER,
          isPlatformAdmin: false,
          fileName: 'test.csv',
          headers: ['Date'],
          sampleRows: [],
        }),
      ).rejects.toThrow('Primary specialist execution error');

      expect(updateCalls).toHaveLength(1);
      const failUpdate = updateCalls[0].data;
      expect(failUpdate).toHaveProperty('durationMs');
      expect(failUpdate).not.toHaveProperty('totalDurationMs');
      expect(failUpdate.status).toBe('FAILED');
      expect(failUpdate.verificationStatus).toBe('REJECTED');
      expect(failUpdate.errorHookLog.errorMessage).toBe('Primary specialist execution error');
    });
  });

  describe('Multi-Format File Support (CSV, XLSX, XLS, JSON)', () => {
    it('isSupportedFileName correctly identifies all 4 supported extensions and strips sheet qualifiers', () => {
      // Supported formats
      expect(CsvImportService.isSupportedFileName('monthly_ledger.csv')).toBe(true);
      expect(CsvImportService.isSupportedFileName('bank_statement.xlsx')).toBe(true);
      expect(CsvImportService.isSupportedFileName('legacy_export.xls')).toBe(true);
      expect(CsvImportService.isSupportedFileName('transaction_feed.json')).toBe(true);

      // Case-insensitivity
      expect(CsvImportService.isSupportedFileName('REPORT.XLSX')).toBe(true);
      expect(CsvImportService.isSupportedFileName('DATA.CSV')).toBe(true);
      expect(CsvImportService.isSupportedFileName('FEED.JSON')).toBe(true);
      expect(CsvImportService.isSupportedFileName('ARCHIVE.XLS')).toBe(true);

      // Worksheet suffixes
      expect(CsvImportService.isSupportedFileName('monthly_ledger.xlsx [Operations]')).toBe(true);
      expect(CsvImportService.isSupportedFileName('export.xls [Sheet 2]')).toBe(true);

      // Unsupported formats
      expect(CsvImportService.isSupportedFileName('financial_report.pdf')).toBe(false);
      expect(CsvImportService.isSupportedFileName('script.py')).toBe(false);
      expect(CsvImportService.isSupportedFileName('archive.zip')).toBe(false);
      expect(CsvImportService.isSupportedFileName('payload.exe')).toBe(false);
      expect(CsvImportService.isSupportedFileName('')).toBe(false);
    });

    it('createPreviewBatch accepts XLSX, XLS, and JSON formats without throwing extension errors', async () => {
      const mockPrisma = {
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', organizationId: 'org-1', isArchived: false }),
        },
        dataSource: {
          create: jest.fn().mockResolvedValue({ id: 'ds-1' }),
        },
        importBatch: {
          create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'batch-1', ...args.data })),
        },
        financialTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const mockAudit = {
        record: jest.fn().mockResolvedValue(undefined),
      };

      const service = new CsvImportService(
        mockPrisma as any,
        mockAudit as any,
        {} as any,
        {} as any,
      );

      const validCsvContent = 'Date,Amount,Description\n2026-10-01,150.00,Office Supplies\n2026-10-02,320.00,Client Lunch\n';
      const columnMapping = {
        dateColumn: 'Date',
        amountColumn: 'Amount',
        descriptionColumn: 'Description',
      };

      // Test XLSX
      const xlsxResult = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-1',
          fileName: 'q4_statements.xlsx',
          csvContent: validCsvContent,
          columnMapping,
        },
        'usr-1',
      );
      expect(xlsxResult.fileName).toBe('q4_statements.xlsx');
      expect(xlsxResult.totalRows).toBe(2);

      // Test XLS
      const xlsResult = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-1',
          fileName: 'legacy_export.xls',
          csvContent: validCsvContent,
          columnMapping,
        },
        'usr-1',
      );
      expect(xlsResult.fileName).toBe('legacy_export.xls');

      // Test JSON
      const jsonResult = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-1',
          fileName: 'bank_stream.json',
          csvContent: validCsvContent,
          columnMapping,
        },
        'usr-1',
      );
      expect(jsonResult.fileName).toBe('bank_stream.json');

      // Test unsupported format is rejected
      await expect(
        service.createPreviewBatch(
          'org-1',
          {
            accountId: 'acc-1',
            fileName: 'statement.pdf',
            csvContent: validCsvContent,
            columnMapping,
          },
          'usr-1',
        ),
      ).rejects.toThrow('Only .csv, .xlsx, .xls, and .json files are permitted for financial transaction import');
    });

    it('parseFlexibleDate parses ISO dates, European DD-MM-YYYY, slash dates, and Excel serial numbers', () => {
      // ISO-8601 string
      const dIso = CsvImportService.parseFlexibleDate('2026-08-02');
      expect(dIso).not.toBeNull();
      expect(dIso?.toISOString().startsWith('2026-08-02')).toBe(true);

      // Slash formatted date
      const dSlash = CsvImportService.parseFlexibleDate('08/02/2026');
      expect(dSlash).not.toBeNull();

      // European DD-MM-YYYY format
      const dEu = CsvImportService.parseFlexibleDate('15-08-2026');
      expect(dEu).not.toBeNull();
      expect(dEu?.toISOString().startsWith('2026-08-15')).toBe(true);

      // Excel numeric serial date (e.g. 45506 -> Aug 2024)
      const dSerial = CsvImportService.parseFlexibleDate('45506');
      expect(dSerial).not.toBeNull();
      expect(dSerial?.getUTCFullYear()).toBe(2024);

      // Invalid / empty dates return null
      expect(CsvImportService.parseFlexibleDate('invalid-date')).toBeNull();
      expect(CsvImportService.parseFlexibleDate('')).toBeNull();
      expect(CsvImportService.parseFlexibleDate(null)).toBeNull();
      expect(CsvImportService.parseFlexibleDate('9999999')).toBeNull();
    });

    it('createPreviewBatch populates transactionDate and date, separates valid and error rows, and returns KPI counts', async () => {
      let createdData: any = null;
      const mockPrisma = {
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', organizationId: 'org-1', isArchived: false }),
        },
        dataSource: {
          create: jest.fn().mockResolvedValue({ id: 'ds-1' }),
        },
        importBatch: {
          create: jest.fn().mockImplementation((args: any) => {
            createdData = args.data;
            return Promise.resolve({ id: 'batch-test-2', ...args.data });
          }),
        },
        financialTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new CsvImportService(
        mockPrisma as any,
        { record: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
      );

      // Row 1: Valid ISO date
      // Row 2: Valid Excel serial date (46238 -> Aug 2026)
      // Row 3: Invalid corrupt date
      const mixedCsvContent = 'Date,Amount,Description\n2026-08-02,185000.00,Retail Sales\n46238,245000.00,Wholesale Order\ncorrupt_date,500.00,Failed Date Entry\n';

      const result = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-1',
          fileName: 'SME_Financial_Test_Data.xlsx',
          csvContent: mixedCsvContent,
          columnMapping: {
            dateColumn: 'Date',
            amountColumn: 'Amount',
            descriptionColumn: 'Description',
          },
        },
        'usr-1',
      );

      // Verify KPI counts
      expect(result.totalRows).toBe(3);
      expect(result.validRowsCount).toBe(2);
      expect(result.errorRowsCount).toBe(1);
      expect(result.validRows).toBe(2);
      expect(result.invalidRows).toBe(1);

      // Verify preview rows contain both transactionDate and date
      const previewRows = result.previewRows as any[];
      expect(previewRows).toHaveLength(2);
      expect(previewRows[0].transactionDate).toContain('2026-08-02');
      expect(previewRows[0].date).toBe('2026-08-02');
      expect(previewRows[0].description).toBe('Retail Sales');

      expect(previewRows[1].transactionDate).toBeDefined();
      expect(previewRows[1].date).toBeDefined();
      expect(previewRows[1].description).toBe('Wholesale Order');

      // Verify rowErrors contains the invalid date row
      const rowErrors = result.rowErrors as any[];
      expect(rowErrors).toHaveLength(1);
      expect(rowErrors[0].rowNumber).toBe(4); // header is 1, row 3 is line 4
      expect(rowErrors[0].errors[0]).toContain('Invalid date "corrupt_date"');
    });

    it('correctly parses accounting-style parentheses and normalizes SALE and PURCHASE without row errors', async () => {
      const mockPrisma = {
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'acc-1', organizationId: 'org-1' }),
        },
        dataSource: {
          create: jest.fn().mockResolvedValue({ id: 'ds-test-3' }),
        },
        importBatch: {
          create: jest.fn().mockImplementation((args: any) => {
            return Promise.resolve({ id: 'batch-test-3', ...args.data });
          }),
        },
        financialTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new CsvImportService(
        mockPrisma as any,
        { record: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
      );

      // Realistic business rows from small_business_25_transactions.xlsx:
      // Row 1: Sale with positive amount
      // Row 2: Purchase with accounting parentheses amount (9,200)
      // Row 3: Expense with accounting parentheses amount (3,800)
      // Extra columns: 'Payment Method', 'Running Balance (PKR)'
      const csvContent =
        'Date,Transaction ID,Type,Category,Description,Payment Method,Net Amount (PKR),Running Balance (PKR)\n' +
        '01-Oct-2026,Opening Sale,Sale,Sales,Cash sale - assorted products,Cash,"18,500","68,500"\n' +
        '02-Oct-2026,PUR-001,Purchase,Inventory,Purchase of stock from wholesaler,Bank Transfer,"(9,200)","59,300"\n' +
        '03-Oct-2026,EXP-001,Expense,Utilities,Electricity bill,Bank Transfer,"(3,800)","68,250"\n';

      const result = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-1',
          fileName: 'small_business_25_transactions.xlsx',
          csvContent,
          columnMapping: {
            dateColumn: 'Date',
            amountColumn: 'Net Amount (PKR)',
            descriptionColumn: 'Description',
            typeColumn: 'Type',
            categoryColumn: 'Category',
            referenceColumn: 'Transaction ID',
          },
        },
        'usr-1',
      );

      expect(result.totalRows).toBe(3);
      expect(result.validRowsCount).toBe(3);
      expect(result.errorRowsCount).toBe(0);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);

      const previewRows = result.previewRows as any[];
      expect(previewRows).toHaveLength(3);

      // Row 1: Sale -> INCOME, exact signed amount 18500.0000
      expect(previewRows[0].type).toBe('INCOME');
      expect(previewRows[0].amount).toBe('18500.0000');
      expect(previewRows[0].description).toBe('Cash sale - assorted products');
      expect(previewRows[0].category).toBe('Sales');
      expect(previewRows[0].reference).toBe('Opening Sale');

      // Row 2: Purchase -> EXPENSE, exact signed amount preserved: (9,200) -> -9200.0000
      expect(previewRows[1].type).toBe('EXPENSE');
      expect(previewRows[1].amount).toBe('-9200.0000');
      expect(previewRows[1].description).toBe('Purchase of stock from wholesaler');
      expect(previewRows[1].category).toBe('Inventory');
      expect(previewRows[1].reference).toBe('PUR-001');

      // Row 3: Expense -> EXPENSE, exact signed amount preserved: (3,800) -> -3800.0000
      expect(previewRows[2].type).toBe('EXPENSE');
      expect(previewRows[2].amount).toBe('-3800.0000');
      expect(previewRows[2].description).toBe('Electricity bill');
      expect(previewRows[2].category).toBe('Utilities');
      expect(previewRows[2].reference).toBe('EXP-001');
    });

    it('confirmImportBatch commits exact signed financial amounts and updates account balance correctly', async () => {
      const createdTxData: any[] = [];
      let updatedAccountBalance: any = null;

      const mockPrisma = {
        importBatch: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'batch-test-signed',
            organizationId: 'org-1',
            accountId: 'acc-1',
            dataSourceId: 'ds-1',
            status: 'VALIDATED',
            previewRows: [
              {
                rowNumber: 2,
                transactionDate: '2026-10-01T00:00:00.000Z',
                type: 'INCOME',
                amount: '18500.0000',
                description: 'Cash sale - assorted products',
                category: 'Sales',
                counterparty: null,
                department: null,
                reference: 'Opening Sale',
                duplicateHash: 'hash-1',
                isDuplicate: false,
              },
              {
                rowNumber: 3,
                transactionDate: '2026-10-02T00:00:00.000Z',
                type: 'EXPENSE',
                amount: '-9200.0000',
                description: 'Purchase of stock from wholesaler',
                category: 'Inventory',
                counterparty: null,
                department: null,
                reference: 'PUR-001',
                duplicateHash: 'hash-2',
                isDuplicate: false,
              },
              {
                rowNumber: 4,
                transactionDate: '2026-10-03T00:00:00.000Z',
                type: 'EXPENSE',
                amount: '-3800.0000',
                description: 'Electricity bill',
                category: 'Utilities',
                counterparty: null,
                department: null,
                reference: 'EXP-001',
                duplicateHash: 'hash-3',
                isDuplicate: false,
              },
            ],
          }),
        },
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'acc-1',
            organizationId: 'org-1',
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('50000.0000'),
            isArchived: false,
          }),
        },
        $transaction: jest.fn().mockImplementation(async (callback: any) => {
          const txMock = {
            financialTransaction: {
              create: jest.fn().mockImplementation((args: any) => {
                createdTxData.push(args.data);
                return Promise.resolve({ id: 'tx-' + createdTxData.length, ...args.data });
              }),
            },
            financialAccount: {
              update: jest.fn().mockImplementation((args: any) => {
                updatedAccountBalance = args.data.currentBalance;
                return Promise.resolve({ id: 'acc-1', ...args.data });
              }),
            },
            importBatch: {
              update: jest.fn().mockResolvedValue({ id: 'batch-test-signed', status: 'COMMITTED' }),
            },
          };
          return callback(txMock);
        }),
      };

      const service = new CsvImportService(
        mockPrisma as any,
        { record: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
      );

      await service.confirmImportBatch(
        'org-1',
        'batch-test-signed',
        { skipDuplicates: true },
        'usr-1',
      );

      // Verify exact 3 transactions were created with exact signed decimal amounts
      expect(createdTxData).toHaveLength(3);
      expect(createdTxData[0].amount.toString()).toBe('18500');
      expect(createdTxData[1].amount.toString()).toBe('-9200');
      expect(createdTxData[2].amount.toString()).toBe('-3800');

      // Verify balance math:
      // Initial 50,000 + 18,500 - 9,200 - 3,800 = 55,500
      expect(updatedAccountBalance.toString()).toBe('55500');
    });
  });

  describe('CsvImportService.parseFlexibleAmount', () => {
    it('correctly parses accounting-style parentheses and comma separators', () => {
      expect(CsvImportService.parseFlexibleAmount('(9,200)')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('(3,800)')?.toString()).toBe('-3800');
      expect(CsvImportService.parseFlexibleAmount('( 11,500.75 )')?.toString()).toBe('-11500.75');
      expect(CsvImportService.parseFlexibleAmount('18,500')?.toString()).toBe('18500');
      expect(CsvImportService.parseFlexibleAmount('18,500.50')?.toString()).toBe('18500.5');
    });

    it('handles currency symbols and prefixes/suffixes', () => {
      expect(CsvImportService.parseFlexibleAmount('$ (9,200)')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('(PKR 9,200)')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('(9,200) PKR')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('₨ (3,800)')?.toString()).toBe('-3800');
      expect(CsvImportService.parseFlexibleAmount('€ 4,500.25')?.toString()).toBe('4500.25');

      // Currency prefixes with or without spaces and abbreviation dots (Rs, Rs., PKR, etc.)
      expect(CsvImportService.parseFlexibleAmount('Rs 700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('Rs  700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('Rs 1,300')?.toString()).toBe('1300');
      expect(CsvImportService.parseFlexibleAmount('Rs  1,300')?.toString()).toBe('1300');
      expect(CsvImportService.parseFlexibleAmount('Rs 1,020')?.toString()).toBe('1020');
      expect(CsvImportService.parseFlexibleAmount('PKR 1,020.50')?.toString()).toBe('1020.5');
      expect(CsvImportService.parseFlexibleAmount('PKR1,020.50')?.toString()).toBe('1020.5');
      expect(CsvImportService.parseFlexibleAmount('(Rs 900)')?.toString()).toBe('-900');
      expect(CsvImportService.parseFlexibleAmount('Rs (900)')?.toString()).toBe('-900');
      expect(CsvImportService.parseFlexibleAmount('Rs. 700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('Rs.700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('Rs700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('PKR 700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('PKR700')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('700 Rs')?.toString()).toBe('700');
      expect(CsvImportService.parseFlexibleAmount('1,020 PKR')?.toString()).toBe('1020');
    });

    it('handles trailing minus notation and positive sign', () => {
      expect(CsvImportService.parseFlexibleAmount('9,200-')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('-9,200')?.toString()).toBe('-9200');
      expect(CsvImportService.parseFlexibleAmount('+15,000')?.toString()).toBe('15000');
      expect(CsvImportService.parseFlexibleAmount('.50')?.toString()).toBe('0.5');
      expect(CsvImportService.parseFlexibleAmount('-.50')?.toString()).toBe('-0.5');
      expect(CsvImportService.parseFlexibleAmount('(.50)')?.toString()).toBe('-0.5');
    });

    it('returns null for unparseable or non-numeric values', () => {
      expect(CsvImportService.parseFlexibleAmount(null)).toBeNull();
      expect(CsvImportService.parseFlexibleAmount(undefined)).toBeNull();
      expect(CsvImportService.parseFlexibleAmount('')).toBeNull();
      expect(CsvImportService.parseFlexibleAmount('   ')).toBeNull();
      expect(CsvImportService.parseFlexibleAmount('-')).toBeNull();
      expect(CsvImportService.parseFlexibleAmount('N/A')).toBeNull();
      expect(CsvImportService.parseFlexibleAmount('abc')).toBeNull();
    });
  });

  describe('Generic Business Normalization & Multi-Format Regression Tests', () => {
    it('normalizes extensive business terminology into canonical transaction types', () => {
      // Income variations
      const incomeTerms = ['Sale', 'SALES', 'Revenue', 'Earnings', 'Gain', 'Credit', 'CR', 'Inflow', 'IN', 'Receipt', 'Deposit', 'Invoice', 'Proceeds'];
      for (const term of incomeTerms) {
        const res = CsvImportService.normalizeTransactionType(term);
        expect(res.unrecognized).toBe(false);
        expect(res.resolvedType).toBe('INCOME');
      }

      // Expense variations
      const expenseTerms = ['Purchase', 'PURCHASES', 'Cost', 'Spend', 'Debit', 'DR', 'Outflow', 'OUT', 'Payment', 'Withdrawal', 'WD', 'Disbursement', 'Fee', 'Bill', 'Settlement'];
      for (const term of expenseTerms) {
        const res = CsvImportService.normalizeTransactionType(term);
        expect(res.unrecognized).toBe(false);
        expect(res.resolvedType).toBe('EXPENSE');
      }

      // Transfer variations
      const transferTerms = ['Transfer', 'Internal_Transfer', 'Xfer', 'Contra', 'InterAccount'];
      for (const term of transferTerms) {
        const res = CsvImportService.normalizeTransactionType(term);
        expect(res.unrecognized).toBe(false);
        expect(res.resolvedType).toBe('TRANSFER');
      }

      // Inferred from signed numeric amount when rawType is omitted
      expect(CsvImportService.normalizeTransactionType('', DecimalMath.of('500')).resolvedType).toBe('INCOME');
      expect(CsvImportService.normalizeTransactionType('', DecimalMath.of('-500')).resolvedType).toBe('EXPENSE');

      // Unrecognized terms flagged cleanly
      const invalid = CsvImportService.normalizeTransactionType('MYSTERIOUS_FLOW');
      expect(invalid.unrecognized).toBe(true);
      expect(invalid.unrecognizedValue).toBe('MYSTERIOUS_FLOW');
    });

    it('dynamically profiles distinct column naming conventions across different financial systems', () => {
      // Schema 1: Bank statement format
      const bankHeaders = ['Posting Date', 'Value Date', 'Particulars', 'Debit Amount', 'Dr/Cr', 'Beneficiary', 'Ref No'];
      const bankSamples = [
        ['2026-11-01', '2026-11-02', 'Cloud infrastructure service', '1450.00', 'DR', 'Amazon Web Services', 'TXN-9871'],
        ['2026-11-03', '2026-11-03', 'Client retainer payment', '8500.00', 'CR', 'Apex Corp', 'INV-5541'],
      ];
      const bankProfile = AgentSkillsRegistryService.profileSchemaAndColumns('bank_export.csv', bankHeaders, bankSamples);
      expect(bankProfile.detectedMappings.dateColumn).toBe('Posting Date');
      expect(bankProfile.detectedMappings.amountColumn).toBe('Debit Amount');
      expect(bankProfile.detectedMappings.descriptionColumn).toBe('Particulars');
      expect(bankProfile.detectedMappings.typeColumn).toBe('Dr/Cr');
      expect(bankProfile.detectedMappings.counterpartyColumn).toBe('Beneficiary');
      expect(bankProfile.detectedMappings.referenceColumn).toBe('Ref No');

      // Schema 2: ERP Invoice/Bill format
      const erpHeaders = ['Document Date', 'Due Date', 'Line Item', 'Paid Amount (USD)', 'Flow Direction', 'Vendor Name', 'Doc No', 'Extra Col'];
      const erpSamples = [
        ['15-Oct-2026', '30-Oct-2026', 'Raw aluminium billets', '42,500.00', 'OUT', 'Alloy Metals Ltd', 'PO-1092', 'Internal Note'],
      ];
      const erpProfile = AgentSkillsRegistryService.profileSchemaAndColumns('erp_export.xlsx', erpHeaders, erpSamples);
      expect(erpProfile.detectedMappings.dateColumn).toBe('Document Date');
      expect(erpProfile.detectedMappings.amountColumn).toBe('Paid Amount (USD)');
      expect(erpProfile.detectedMappings.descriptionColumn).toBe('Line Item');
      expect(erpProfile.detectedMappings.typeColumn).toBe('Flow Direction');
      expect(erpProfile.detectedMappings.counterpartyColumn).toBe('Vendor Name');
      expect(erpProfile.detectedMappings.referenceColumn).toBe('Doc No');
      expect(erpProfile.unmappedHeaders).toContain('Extra Col');
    });

    it('createPreviewBatch safely processes files with extra columns, omitted type columns, and fractional amounts', async () => {
      const mockPrisma = {
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({ id: 'acc-multi', organizationId: 'org-1' }),
        },
        dataSource: {
          create: jest.fn().mockResolvedValue({ id: 'ds-multi' }),
        },
        importBatch: {
          create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'batch-multi', ...args.data })),
        },
        financialTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new CsvImportService(
        mockPrisma as any,
        { record: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
      );

      // File with 4 rows:
      // Row 1: Valid positive amount, no type column (infers INCOME)
      // Row 2: Valid negative amount with parens, no type column (infers EXPENSE)
      // Row 3: Valid fractional amount (.50), type 'Sale' (INCOME)
      // Row 4: Genuinely invalid date (should be flagged as row error, not breaking valid rows)
      // Extra ignored columns: 'Tax_Code', 'Internal_Audit_ID'
      const csvContent =
        'Entry_Date,Narrative,Total_Val,Type_Col,Tax_Code,Internal_Audit_ID\n' +
        '2026-10-10,Software subscription renewal,1500.00,,VAT-01,AUD-101\n' +
        '2026-10-11,Office maintenance fee,(450.00),,VAT-02,AUD-102\n' +
        '2026-10-12,Discounted unit item,.50,Sale,VAT-00,AUD-103\n' +
        'bad-date-string,Corrupt entry row,100.00,Sale,VAT-01,AUD-104\n';

      const result = await service.createPreviewBatch(
        'org-1',
        {
          accountId: 'acc-multi',
          fileName: 'enterprise_ledger.csv',
          csvContent,
          columnMapping: {
            dateColumn: 'Entry_Date',
            amountColumn: 'Total_Val',
            descriptionColumn: 'Narrative',
            typeColumn: 'Type_Col',
          },
        },
        'usr-1',
      );

      expect(result.totalRows).toBe(4);
      expect(result.validRowsCount).toBe(3);
      expect(result.errorRowsCount).toBe(1);

      const previewRows = result.previewRows as any[];
      expect(previewRows).toHaveLength(3);

      // Row 1: Inferred INCOME from positive 1500.00
      expect(previewRows[0].type).toBe('INCOME');
      expect(previewRows[0].amount).toBe('1500.0000');
      expect(previewRows[0].description).toBe('Software subscription renewal');

      // Row 2: Inferred EXPENSE from negative (450.00) -> -450.0000
      expect(previewRows[1].type).toBe('EXPENSE');
      expect(previewRows[1].amount).toBe('-450.0000');
      expect(previewRows[1].description).toBe('Office maintenance fee');

      // Row 3: Fractional amount .50 -> 0.5000, Type Sale -> INCOME
      expect(previewRows[2].type).toBe('INCOME');
      expect(previewRows[2].amount).toBe('0.5000');
      expect(previewRows[2].description).toBe('Discounted unit item');

      // Row 4: Error isolated to specific row
      const rowErrors = result.rowErrors as any[];
      expect(rowErrors).toHaveLength(1);
      expect(rowErrors[0].rowNumber).toBe(5);
      expect(rowErrors[0].errors[0]).toContain('Invalid date "bad-date-string"');
    });

    it('processes files with currency-prefixed amounts (Rs 700, Rs  1,300, PKR 1,020.50, (Rs 900)) without errors', async () => {
      const mockPrisma = {
        financialAccount: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'acc-cafe',
            organizationId: 'org-cafe',
            currency: 'PKR',
            currentBalance: new Prisma.Decimal('50000.0000'),
            isArchived: false,
          }),
        },
        dataSource: {
          create: jest.fn().mockResolvedValue({ id: 'ds-cafe' }),
        },
        importBatch: {
          create: jest.fn().mockImplementation((args: any) => Promise.resolve({ id: 'batch-cafe', ...args.data })),
        },
        financialTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([]),
        },
      };

      const service = new CsvImportService(
        mockPrisma as any,
        { record: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
        {} as any,
      );

      const csvContent =
        'Date,Item,Category,Total (PKR),Payment Method\n' +
        '01-Nov-2026,Espresso,Coffee,Rs  700,Cash\n' +
        '02-Nov-2026,Chicken Sandwich,Food,"Rs  1,300",Cash\n' +
        '03-Nov-2026,Chocolate Brownie,Dessert,(Rs 900),Cash\n' +
        '04-Nov-2026,Mocha,Coffee,"PKR 1,020.50",Card\n' +
        '05-Nov-2026,Flat White,Coffee,Rs 490,Card\n';

      const result = await service.createPreviewBatch(
        'org-cafe',
        {
          accountId: 'acc-cafe',
          fileName: 'cafe_transactions.csv',
          csvContent,
          columnMapping: {
            dateColumn: 'Date',
            amountColumn: 'Total (PKR)',
            descriptionColumn: 'Item',
            categoryColumn: 'Category',
          },
        },
        'usr-cafe',
      );

      expect(result.totalRows).toBe(5);
      expect(result.validRowsCount).toBe(5);
      expect(result.errorRowsCount).toBe(0);

      const previewRows = result.previewRows as any[];
      expect(previewRows).toHaveLength(5);

      expect(previewRows[0].amount).toBe('700.0000');
      expect(previewRows[0].type).toBe('INCOME');

      expect(previewRows[1].amount).toBe('1300.0000');
      expect(previewRows[1].type).toBe('INCOME');

      expect(previewRows[2].amount).toBe('-900.0000');
      expect(previewRows[2].type).toBe('EXPENSE');

      expect(previewRows[3].amount).toBe('1020.5000');
      expect(previewRows[3].type).toBe('INCOME');

      expect(previewRows[4].amount).toBe('490.0000');
      expect(previewRows[4].type).toBe('INCOME');
    });
  });
});
