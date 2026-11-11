import { jest } from '@jest/globals';
import { AgentType, RoleType } from '../../generated/prisma/client.js';
import { AgentSkillsRegistryService } from '../ai-orchestration/skills/agent-skills-registry.service.js';
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
});
