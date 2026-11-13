import { jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  AgentType,
  ExecutionStatus,
  ImportBatchStatus,
  InvoiceStatus,
  MembershipStatus,
  Prisma,
  RoleType,
  TransactionType,
} from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { CsvImportService } from '../csv-import/csv-import.service.js';
import { InvoicesPayablesService } from '../invoices-payables/invoices-payables.service.js';
import { WorkflowHookService } from './hooks/workflow-hooks.service.js';
import { McpIntegrationService } from './mcp/mcp-integration.service.js';
import { ToolRegistryService } from './mcp/tool-registry.service.js';
import { AiModelProviderService } from './model-provider/ai-model-provider.service.js';
import { AgentSandboxService } from './sandbox/agent-sandbox.service.js';
import { AgentSkillsRegistryService } from './skills/agent-skills-registry.service.js';
import { SupervisorOrchestratorService } from './supervisor-orchestrator.service.js';

describe('STEP 4: Automatic Post-Save AI Agent Orchestration', () => {
  function buildHarness(options: { throwForecastError?: boolean } = {}) {
    const workflowRuns: Array<Record<string, unknown>> = [];
    const agentRuns: Array<Record<string, unknown>> = [];
    const generatedForecasts: Array<Record<string, unknown>> = [];
    const generatedRiskScans: Array<Record<string, unknown>> = [];
    const generatedReports: Array<Record<string, unknown>> = [];
    const auditLogs: Array<Record<string, unknown>> = [];

    const prisma = {
      organization: {
        findUnique: jest.fn().mockResolvedValue({ id: 'org-star', baseCurrency: 'PKR', isActive: true }),
      },
      organizationMembership: {
        findUnique: jest.fn().mockResolvedValue({ status: MembershipStatus.ACTIVE }),
      },
      financialAccount: {
        count: jest.fn().mockResolvedValue(1),
      },
      financialTransaction: {
        count: jest.fn().mockResolvedValue(2),
      },
      budget: {
        count: jest.fn().mockResolvedValue(0),
      },
      invoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'inv-auto-1',
          ...data,
          subtotalAmount: new Prisma.Decimal('100000.0000'),
          taxRate: new Prisma.Decimal('0.0000'),
          taxAmount: new Prisma.Decimal('0.0000'),
          totalAmount: new Prisma.Decimal('100000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('100000.0000'),
          lineItems: [],
          payments: [],
          createdAt: new Date('2026-11-12T11:30:00.000Z'),
          updatedAt: new Date('2026-11-12T11:30:00.000Z'),
        })),
      },
      bill: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'bill-auto-1',
          ...data,
          subtotalAmount: new Prisma.Decimal('45000.0000'),
          taxRate: new Prisma.Decimal('0.0000'),
          taxAmount: new Prisma.Decimal('0.0000'),
          totalAmount: new Prisma.Decimal('45000.0000'),
          paidAmount: new Prisma.Decimal('0.0000'),
          outstandingBalance: new Prisma.Decimal('45000.0000'),
          lineItems: [],
          payments: [],
          createdAt: new Date('2026-11-12T11:31:00.000Z'),
          updatedAt: new Date('2026-11-12T11:31:00.000Z'),
        })),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workflowRun: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
          const promptFilter = (where.prompt as { contains?: string } | undefined)?.contains;
          return (
            workflowRuns.find(
              (w) =>
                w.organizationId === where.organizationId &&
                w.taskClassification === where.taskClassification &&
                (!promptFilter || String(w.prompt).includes(promptFilter)) &&
                (w.status === ExecutionStatus.RUNNING || w.status === ExecutionStatus.COMPLETED),
            ) ?? null
          );
        }),
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `wf-${workflowRuns.length + 1}`, startedAt: new Date(), ...data };
          workflowRuns.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = workflowRuns.find((w) => w.id === where.id)!;
          Object.assign(target, data);
          return {
            ...target,
            agentRuns: agentRuns.filter((a) => a.workflowRunId === where.id),
          };
        }),
      },
      agentRun: {
        create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
          const rec = { id: `ar-${agentRuns.length + 1}`, startedAt: new Date(), ...data };
          agentRuns.push(rec);
          return rec;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const target = agentRuns.find((a) => a.id === where.id)!;
          Object.assign(target, data);
          return target;
        }),
      },
    };

    const auditStub = {
      record: jest.fn().mockImplementation(async (entry: Record<string, unknown>) => {
        auditLogs.push(entry);
        return { id: `aud-${auditLogs.length}`, ...entry };
      }),
    } as unknown as AuditService;

    const analyticsStub = {
      computeAllMetrics: jest.fn().mockResolvedValue({
        organizationId: 'org-star',
        currency: 'PKR',
        formulaVersion: 'v1.0.0-decimal',
        reportingPeriod: {
          startDate: '2026-10-13T00:00:00.000Z',
          endDate: '2026-11-12T00:00:00.000Z',
        },
        metrics: {
          operatingCashFlow: { value: '55000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
          cashRunway: { value: '999.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
          currentRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
          quickRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
          grossMargin: { value: '70.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
          expenseGrowth: { value: '5.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
          workingCapital: { value: '120000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-auto-1'] } },
          budgetVariance: { value: '15.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { budgetIds: ['bgt-1'] } },
          receivableAging: { value: { totalOutstanding: '100000.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { invoiceIds: ['inv-auto-1'] } },
          payableAging: { value: { totalOutstanding: '45000.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { billIds: ['bill-auto-1'] } },
        },
      }),
    };

    const forecastingStub = {
      listForecasts: jest.fn().mockResolvedValue([{ id: 'fc-stale-old' }]),
      getForecastById: jest.fn().mockResolvedValue({ id: 'fc-stale-old' }),
      generateForecast: jest.fn().mockImplementation(async (orgId: string, dto: { horizonDays: number }) => {
        if (options.throwForecastError) {
          throw new Error('Forecast computation engine timeout');
        }
        const fc = {
          id: `fc-fresh-${generatedForecasts.length + 1}`,
          organizationId: orgId,
          horizonDays: dto.horizonDays,
          scenarioType: 'BASE',
          openingCashBalance: '150000.0000',
          projectedClosingCash: '205000.0000',
          minimumProjectedCash: '140000.0000',
          hasLiquidityWarning: false,
          assumptions: { deterministic: true },
          sourceRecordIds: { invoiceIds: ['inv-auto-1'] },
        };
        generatedForecasts.push(fc);
        return fc;
      }),
    };

    const riskStub = {
      listAlerts: jest.fn().mockResolvedValue([]),
      runAnomalyAndRiskScan: jest.fn().mockImplementation(async () => {
        const alert = {
          id: `al-fresh-${generatedRiskScans.length + 1}`,
          severity: 'MEDIUM',
          type: 'OVERDUE_RECEIVABLE',
          status: 'OPEN',
        };
        generatedRiskScans.push(alert);
        return { alerts: [alert] };
      }),
    };

    const reportsStub = {
      generateReport: jest.fn().mockImplementation(async (orgId: string, dto: { type: string; title?: string }) => {
        const rep = {
          id: `rep-auto-${generatedReports.length + 1}`,
          organizationId: orgId,
          type: dto.type,
          title: dto.title ?? 'Automated Brief',
        };
        generatedReports.push(rep);
        return rep;
      }),
    };

    const invoicesPayablesStubForMcp = {
      computeAgingReport: jest.fn().mockResolvedValue({
        receivablesAging: { totalOutstanding: '100000.0000', totalOverdue: '0.0000', sourceRecordIds: ['inv-auto-1'] },
        payablesAging: { totalOutstanding: '45000.0000', totalOverdue: '0.0000', sourceRecordIds: ['bill-auto-1'] },
      }),
    };

    const sandbox = new AgentSandboxService(auditStub);
    const toolRegistry = new ToolRegistryService(
      sandbox,
      analyticsStub as never,
      { listAccounts: jest.fn().mockResolvedValue([]), listTransactions: jest.fn().mockResolvedValue({ items: [], pagination: { total: 0 }, summary: { currency: 'PKR' } }) } as never,
      forecastingStub as never,
      riskStub as never,
      invoicesPayablesStubForMcp as never,
      { listBudgets: jest.fn().mockResolvedValue([]) } as never,
      { listScenarios: jest.fn().mockResolvedValue([]) } as never,
      { listSnapshots: jest.fn().mockResolvedValue([]) } as never,
      reportsStub as never,
    );
    const config = new ConfigService({ AI_PROVIDER: 'deterministic-grounded' });
    const mcp = new McpIntegrationService(config, toolRegistry, auditStub);
    const modelProvider = new AiModelProviderService(config);
    const skillsRegistry = new AgentSkillsRegistryService(mcp, modelProvider, auditStub);
    const hooks = new WorkflowHookService(prisma as never, auditStub);

    const supervisor = new SupervisorOrchestratorService(
      prisma as never,
      hooks,
      sandbox,
      skillsRegistry,
      auditStub,
    );

    const invoicesPayablesService = new InvoicesPayablesService(
      prisma as never,
      auditStub,
      undefined,
      supervisor,
    );

    return {
      invoicesPayablesService,
      supervisor,
      prisma,
      workflowRuns,
      agentRuns,
      generatedForecasts,
      generatedRiskScans,
      generatedReports,
      analyticsStub,
    };
  }

  it('automatically triggers relevant agents in sequence on invoice save and updates forecast, risk scan, recommendations, and report', async () => {
    const h = buildHarness();

    const saved = await h.invoicesPayablesService.createInvoice(
      'org-star',
      {
        invoiceNumber: 'INV-STEP4-001',
        customerName: 'sara enterprises',
        issueDate: '2026-11-12T00:00:00.000Z',
        dueDate: '2026-12-12T00:00:00.000Z',
        totalAmount: '100000.0000',
        status: InvoiceStatus.ISSUED,
      },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );

    expect(saved.id).toBe('inv-auto-1');
    expect(saved.customerName).toBe('Sara Enterprises');

    expect(h.workflowRuns).toHaveLength(1);
    const wf = h.workflowRuns[0];
    expect(wf.taskClassification).toBe('AUTO_POST_INVOICE_ORCHESTRATION');
    expect(wf.status).toBe(ExecutionStatus.COMPLETED);

    // Selected agents exclude EXPENSE_ANOMALY_DETECTION and SCENARIO_PLANNING for INVOICE
    expect(wf.selectedAgents).toEqual([
      AgentType.FINANCE_DATA_ANALYST,
      AgentType.CASH_FLOW_FORECASTING,
      AgentType.FINANCIAL_RISK_ASSESSMENT,
      AgentType.STRATEGIC_RECOMMENDATION,
      AgentType.FINANCIAL_REPORTING,
      AgentType.VERIFIER_AI,
    ]);

    // Every invoked agent run actually completed with timestamps
    expect(h.agentRuns).toHaveLength(6);
    expect(h.agentRuns.every((ar) => ar.status === ExecutionStatus.COMPLETED)).toBe(true);
    expect(h.agentRuns.every((ar) => ar.completedAt instanceof Date)).toBe(true);

    // Fresh outputs persisted (not stale cached forecast)
    expect(h.analyticsStub.computeAllMetrics).toHaveBeenCalled();
    expect(h.generatedForecasts).toHaveLength(1);
    expect(h.generatedForecasts[0].id).toBe('fc-fresh-1');
    expect(h.generatedRiskScans).toHaveLength(1);
    expect(h.generatedReports).toHaveLength(1);

    const synth = wf.synthesizedResult as {
      providerMode: string;
      limitations: string[];
      updatedOutputs: { forecastIds: string[]; reportIds: string[]; riskAlertIds: string[] };
    };
    expect(synth.providerMode).toBe('deterministic-grounded');
    expect(synth.limitations[0]).toContain('External AI provider is not configured');
    expect(synth.updatedOutputs.forecastIds).toContain('fc-fresh-1');
    expect(synth.updatedOutputs.reportIds).toContain('rep-auto-1');
  });

  it('includes EXPENSE_ANOMALY_DETECTION when a supplier bill is imported and prevents duplicate orchestration runs', async () => {
    const h = buildHarness();

    const bill = await h.invoicesPayablesService.createBill(
      'org-star',
      {
        billNumber: 'BILL-STEP4-001',
        supplierName: 'al-madina traders',
        issueDate: '2026-11-12T00:00:00.000Z',
        dueDate: '2026-11-25T00:00:00.000Z',
        totalAmount: '45000.0000',
        sourceDocumentChecksum: 'abc123checksum',
      },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );

    expect(bill.id).toBe('bill-auto-1');
    expect(bill.supplierName).toBe('Al-Madina Traders');
    expect(h.workflowRuns).toHaveLength(1);
    expect(h.workflowRuns[0].taskClassification).toBe('AUTO_POST_BILL_ORCHESTRATION');
    expect(h.workflowRuns[0].selectedAgents).toEqual([
      AgentType.FINANCE_DATA_ANALYST,
      AgentType.CASH_FLOW_FORECASTING,
      AgentType.EXPENSE_ANOMALY_DETECTION,
      AgentType.FINANCIAL_RISK_ASSESSMENT,
      AgentType.STRATEGIC_RECOMMENDATION,
      AgentType.FINANCIAL_REPORTING,
      AgentType.VERIFIER_AI,
    ]);

    // Duplicate trigger for same billId is prevented cleanly
    const dupRes = (await h.supervisor.orchestratePostDocumentSave({
      organizationId: 'org-star',
      userId: 'user-owner-1',
      userRole: RoleType.BUSINESS_OWNER,
      documentType: 'BILL',
      documentId: 'bill-auto-1',
      documentNumber: 'BILL-STEP4-001',
      counterpartyName: 'Al-Madina Traders',
      currency: 'PKR',
      totalAmount: '45000.0000',
      status: 'OPEN',
      dueDate: '2026-11-25T00:00:00.000Z',
      triggerSource: 'DOCUMENT_IMPORT',
    })) as { skipped?: boolean; reason?: string };

    expect(dupRes.skipped).toBe(true);
    expect(dupRes.reason).toBe('ALREADY_EXECUTED');
    expect(h.workflowRuns).toHaveLength(1);
  });

  it('never marks a failed agent as COMPLETED and never rolls back a saved invoice when orchestration fails', async () => {
    const h = buildHarness({ throwForecastError: true });

    const saved = await h.invoicesPayablesService.createInvoice(
      'org-star',
      {
        invoiceNumber: 'INV-STEP4-FAILSAFE',
        customerName: 'Failsafe Client',
        issueDate: '2026-11-12T00:00:00.000Z',
        dueDate: '2026-12-12T00:00:00.000Z',
        totalAmount: '25000.0000',
      },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );

    // Invoice save still succeeds cleanly
    expect(saved.id).toBe('inv-auto-1');

    // Failed agent run is recorded with FAILED + errorDetails (never COMPLETED)
    const forecastAgentRun = h.agentRuns.find(
      (ar) => ar.agentType === AgentType.CASH_FLOW_FORECASTING,
    );
    expect(forecastAgentRun?.status).toBe(ExecutionStatus.FAILED);
    expect(String(forecastAgentRun?.errorDetails)).toContain('Forecast computation engine timeout');
    expect(forecastAgentRun?.completedAt).toBeInstanceOf(Date);

    const wf = h.workflowRuns[0];
    const synth = wf.synthesizedResult as {
      failedAgents: Array<{ agentType: string; error: string }>;
    };
    expect(synth.failedAgents).toEqual([
      {
        agentType: AgentType.CASH_FLOW_FORECASTING,
        error: 'Forecast computation engine timeout',
      },
    ]);
  });

  it('triggers AUTO_POST_LEDGER_IMPORT_ORCHESTRATION after CsvImportService commits rows, discloses partial errors, and skips 0-row commits', async () => {
    const h = buildHarness();

    const csvPrisma = {
      importBatch: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'batch-partial-1',
            organizationId: 'org-star',
            dataSourceId: 'ds-1',
            accountId: 'acc-1',
            fileName: 'march_ledger.xlsx',
            status: ImportBatchStatus.VALIDATED,
            errorRowsCount: 1,
            previewRows: [
              {
                rowNumber: 2,
                transactionDate: '2026-11-05T00:00:00.000Z',
                type: TransactionType.EXPENSE,
                amount: '18000.0000',
                description: 'Cloud Hosting',
                category: 'Infrastructure',
                counterparty: 'AWS',
                department: 'Engineering',
                reference: 'REF-1',
                duplicateHash: 'h1',
                isDuplicate: false,
                sanitizationFlags: [],
              },
              {
                rowNumber: 3,
                transactionDate: '2026-11-05T00:00:00.000Z',
                type: TransactionType.EXPENSE,
                amount: '18000.0000',
                description: 'Cloud Hosting',
                category: 'Infrastructure',
                counterparty: 'AWS',
                department: 'Engineering',
                reference: 'REF-1',
                duplicateHash: 'h1',
                isDuplicate: true,
                sanitizationFlags: [],
              },
            ],
          })
          .mockResolvedValueOnce({
            id: 'batch-empty-2',
            organizationId: 'org-star',
            dataSourceId: 'ds-2',
            accountId: 'acc-1',
            fileName: 'dupes_only.csv',
            status: ImportBatchStatus.VALIDATED,
            errorRowsCount: 0,
            previewRows: [
              {
                rowNumber: 2,
                transactionDate: '2026-11-05T00:00:00.000Z',
                type: TransactionType.INCOME,
                amount: '5000.0000',
                description: 'Dup Row',
                category: 'Sales',
                counterparty: null,
                department: null,
                reference: null,
                duplicateHash: 'h-dup',
                isDuplicate: true,
                sanitizationFlags: [],
              },
            ],
          }),
      },
      financialAccount: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'acc-1',
          organizationId: 'org-star',
          currency: 'PKR',
          currentBalance: new Prisma.Decimal('150000.0000'),
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          financialTransaction: { create: jest.fn().mockResolvedValue({ id: 'tx-created-1' }) },
          financialAccount: { update: jest.fn().mockResolvedValue({ id: 'acc-1' }) },
          importBatch: {
            update: jest.fn().mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
              id: where.id,
              ...data,
            })),
          },
        }),
      ),
    };

    const csvImportService = new CsvImportService(
      csvPrisma as never,
      { record: jest.fn().mockResolvedValue({ id: 'aud-csv' }) } as never,
      h.supervisor,
      {} as never,
    );

    const committedPartial = await csvImportService.confirmImportBatch(
      'org-star',
      'batch-partial-1',
      { skipDuplicates: true },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );
    expect(committedPartial.status).toBe(ImportBatchStatus.COMMITTED);
    expect(committedPartial.committedRowsCount).toBe(1);

    // Partial batch triggered orchestration with EXPENSE_ANOMALY_DETECTION and partial-import disclosure
    expect(h.workflowRuns).toHaveLength(1);
    const wf = h.workflowRuns[0];
    expect(wf.taskClassification).toBe('AUTO_POST_LEDGER_IMPORT_ORCHESTRATION');
    expect(wf.selectedAgents).toContain(AgentType.EXPENSE_ANOMALY_DETECTION);
    const synth = wf.synthesizedResult as {
      limitations: string[];
      updatedOutputs: { forecastIds: string[]; reportIds: string[] };
    };
    expect(synth.limitations.some((l) => l.includes('Partial batch import: 1 row(s) failed'))).toBe(true);
    expect(synth.limitations.some((l) => l.includes('1 duplicate row(s) were skipped'))).toBe(true);
    expect(synth.updatedOutputs.forecastIds).toHaveLength(1);
    expect(synth.updatedOutputs.reportIds).toHaveLength(1);

    // Duplicate trigger for same batchId is prevented
    const dupRes = (await h.supervisor.orchestratePostLedgerImport({
      organizationId: 'org-star',
      userId: 'user-owner-1',
      userRole: RoleType.BUSINESS_OWNER,
      batchId: 'batch-partial-1',
      fileName: 'march_ledger.xlsx',
      accountId: 'acc-1',
      currency: 'PKR',
      committedRowsCount: 1,
      errorRowsCount: 1,
      skippedDuplicatesCount: 1,
      hasExpenseRows: true,
      netBalanceChange: '-18000.0000',
    })) as { skipped?: boolean; reason?: string };
    expect(dupRes.skipped).toBe(true);
    expect(dupRes.reason).toBe('ALREADY_EXECUTED');
    expect(h.workflowRuns).toHaveLength(1);

    // Zero-row commit (all duplicates skipped) must NOT trigger misleading workflow run
    const committedZero = await csvImportService.confirmImportBatch(
      'org-star',
      'batch-empty-2',
      { skipDuplicates: true },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );
    expect(committedZero.committedRowsCount).toBe(0);
    expect(h.workflowRuns).toHaveLength(1);
  });

  it('suppresses overdue-AR and budget-variance recommendations when overdue AR=0, active budgets=0, and alerts=0', async () => {
    const h = buildHarness();
    h.analyticsStub.computeAllMetrics.mockResolvedValueOnce({
      organizationId: 'org-star',
      currency: 'PKR',
      formulaVersion: 'v1.0.0-decimal',
      conversionContext: { baseCurrency: 'PKR', isComplete: true, missingCurrencies: [] },
      reportingPeriod: {
        startDate: '2026-10-13T00:00:00.000Z',
        endDate: '2026-11-12T00:00:00.000Z',
      },
      metrics: {
        operatingCashFlow: { value: '55000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        cashRunway: { value: '999.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        currentRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        quickRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        grossMargin: { value: '70.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        expenseGrowth: { value: '5.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        workingCapital: { value: '120000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-auto-1'] } },
        budgetVariance: { value: null, status: 'UNSUPPORTED_MISSING_DATA', dataLimitations: ['No active budget overlaps the selected reporting period.'], sourceRecordIds: { budgetIds: [] } },
        receivableAging: { value: { totalOutstanding: '100000.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { invoiceIds: ['inv-auto-1'] } },
        payableAging: { value: { totalOutstanding: '0.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { billIds: [] } },
      },
    });
    // Also ensure strategic recommendation sees 0 active budgets & 0 overdue AR & 0 alerts
    h.analyticsStub.computeAllMetrics.mockResolvedValue({
      organizationId: 'org-star',
      currency: 'PKR',
      formulaVersion: 'v1.0.0-decimal',
      conversionContext: { baseCurrency: 'PKR', isComplete: true, missingCurrencies: [] },
      reportingPeriod: {
        startDate: '2026-10-13T00:00:00.000Z',
        endDate: '2026-11-12T00:00:00.000Z',
      },
      metrics: {
        operatingCashFlow: { value: '55000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        cashRunway: { value: '999.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        currentRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        quickRatio: { value: '2.2000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'] } },
        grossMargin: { value: '70.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        expenseGrowth: { value: '5.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { transactionIds: ['tx-1'] } },
        workingCapital: { value: '120000.0000', status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { accountIds: ['acc-1'], invoiceIds: ['inv-auto-1'] } },
        budgetVariance: { value: null, status: 'UNSUPPORTED_MISSING_DATA', dataLimitations: ['No active budget overlaps the selected reporting period.'], sourceRecordIds: { budgetIds: [] } },
        receivableAging: { value: { totalOutstanding: '100000.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { invoiceIds: ['inv-auto-1'] } },
        payableAging: { value: { totalOutstanding: '0.0000', totalOverdue: '0.0000', buckets: [] }, status: 'COMPUTED', dataLimitations: [], sourceRecordIds: { billIds: [] } },
      },
    });

    await h.invoicesPayablesService.createInvoice(
      'org-star',
      {
        invoiceNumber: 'INV-002',
        customerName: 'Current Customer',
        issueDate: '2026-11-12T00:00:00.000Z',
        dueDate: '2026-12-12T00:00:00.000Z',
        totalAmount: '100000.0000',
        status: InvoiceStatus.ISSUED,
      },
      'user-owner-1',
      RoleType.BUSINESS_OWNER,
    );

    const recAgentRun = h.agentRuns.find(
      (ar) => ar.agentType === AgentType.STRATEGIC_RECOMMENDATION,
    );
    const skillResult = (
      recAgentRun?.outputPayload as {
        skillResults: Array<{
          recommendations: Array<{ priority: number; action: string; rationale: string }>;
          sourceRecordIds: Record<string, string[]>;
        }>;
      }
    ).skillResults[0];

    const joined = skillResult.recommendations.map((r) => `${r.action} ${r.rationale}`).join(' ');
    expect(joined).not.toMatch(/Accelerate collection on overdue/i);
    expect(joined).not.toMatch(/budget variance lines/i);
    expect(joined).toMatch(/current customer receivables ahead of due dates/i);
    expect(joined).toMatch(/Establish an active operating budget/i);
    expect(skillResult.sourceRecordIds.invoiceIds).toContain('inv-auto-1');
  });
});
