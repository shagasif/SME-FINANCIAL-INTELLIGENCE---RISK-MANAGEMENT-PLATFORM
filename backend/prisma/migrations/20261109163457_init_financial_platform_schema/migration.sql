-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('PLATFORM_ADMIN', 'BUSINESS_OWNER', 'FINANCE_MANAGER', 'ACCOUNTANT', 'OPERATIONS_MANAGER', 'FINANCIAL_ANALYST', 'AUDITOR');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('MANUAL_ENTRY', 'CSV_IMPORT', 'SYNTHETIC_SEED', 'SYSTEM_GENERATED');

-- CreateEnum
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING_PREVIEW', 'VALIDATED', 'COMMITTED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'CASH', 'ACCOUNTS_RECEIVABLE', 'ACCOUNTS_PAYABLE', 'CREDIT_CARD', 'SHORT_TERM_DEBT', 'REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'EQUITY');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('INCOME', 'EXPENSE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('NONE', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'CHEQUE', 'DIRECT_DEBIT', 'OTHER');

-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ForecastScenarioType" AS ENUM ('BASE', 'OPTIMISTIC', 'CONSERVATIVE');

-- CreateEnum
CREATE TYPE "RiskAlertType" AS ENUM ('UNUSUAL_AMOUNT', 'UNUSUAL_FREQUENCY', 'TIMING_CHANGE', 'CATEGORY_SHIFT', 'DUPLICATE_CANDIDATE', 'CASH_SHORTFALL', 'OVERDUE_RECEIVABLE', 'BUDGET_OVERRUN');

-- CreateEnum
CREATE TYPE "RiskSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'DISMISSED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ReviewTargetType" AS ENUM ('RISK_ALERT', 'IMPORT_BATCH', 'SCENARIO_DECISION', 'AGENT_RECOMMENDATION', 'BUDGET_REVISION', 'CONSEQUENTIAL_EXPORT');

-- CreateEnum
CREATE TYPE "ReviewActionType" AS ENUM ('ACKNOWLEDGE', 'DISMISS', 'INVESTIGATE', 'ESCALATE', 'APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('SUPERVISOR_ORCHESTRATOR', 'FINANCE_DATA_ANALYST', 'CASH_FLOW_FORECASTING', 'EXPENSE_ANOMALY_DETECTION', 'FINANCIAL_RISK_ASSESSMENT', 'SCENARIO_PLANNING', 'STRATEGIC_RECOMMENDATION', 'FINANCIAL_REPORTING', 'VERIFIER_AI');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'BLOCKED_BY_SANDBOX');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REQUIRES_HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('BUSINESS_HEALTH', 'CASH_FLOW', 'EXPENSE', 'BUDGET', 'RISK');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "industry" TEXT,
    "baseCurrency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "isSyntheticDemo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "RoleType" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "description" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "accountId" TEXT,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileChecksum" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING_PREVIEW',
    "columnMapping" JSONB NOT NULL,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRowsCount" INTEGER NOT NULL DEFAULT 0,
    "errorRowsCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateRowsCount" INTEGER NOT NULL DEFAULT 0,
    "committedRowsCount" INTEGER NOT NULL DEFAULT 0,
    "previewRows" JSONB NOT NULL,
    "rowErrors" JSONB NOT NULL,
    "duplicateRows" JSONB NOT NULL,
    "sanitizationNotes" JSONB,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "openingBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "institution" TEXT,
    "isLiquid" BOOLEAN NOT NULL DEFAULT true,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dataSourceId" TEXT,
    "importBatchId" TEXT,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "department" TEXT,
    "counterparty" TEXT,
    "reference" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceFrequency" "RecurrenceFrequency" NOT NULL DEFAULT 'NONE',
    "isCostOfGoodsSold" BOOLEAN NOT NULL DEFAULT false,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "duplicateHash" TEXT,
    "metadata" JSONB,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Sales Revenue',
    "department" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "paidAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(19,4) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bill" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierEmail" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Operating Expense',
    "department" TEXT,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "totalAmount" DECIMAL(19,4) NOT NULL,
    "paidAmount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "outstandingBalance" DECIMAL(19,4) NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "billId" TEXT,
    "transactionId" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodType" "BudgetPeriodType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "totalAllocated" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "BudgetStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT 'General',
    "allocatedAmount" DECIMAL(19,4) NOT NULL,
    "alertThreshold" DECIMAL(19,4) NOT NULL DEFAULT 90.0000,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRevision" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "previousAllocated" DECIMAL(19,4) NOT NULL,
    "newAllocated" DECIMAL(19,4) NOT NULL,
    "changeSummary" TEXT NOT NULL,
    "snapshotLines" JSONB NOT NULL,
    "revisedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialMetricSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "formulaVersion" TEXT NOT NULL DEFAULT 'v1.0.0',
    "completenessScore" DECIMAL(19,4) NOT NULL,
    "totalRevenue" DECIMAL(19,4) NOT NULL,
    "totalExpenses" DECIMAL(19,4) NOT NULL,
    "operatingCashFlow" DECIMAL(19,4) NOT NULL,
    "closingCashBalance" DECIMAL(19,4) NOT NULL,
    "workingCapital" DECIMAL(19,4) NOT NULL,
    "currentRatio" DECIMAL(19,4),
    "quickRatio" DECIMAL(19,4),
    "grossMarginPct" DECIMAL(19,4),
    "expenseGrowthPct" DECIMAL(19,4),
    "cashRunwayMonths" DECIMAL(19,4),
    "budgetVariancePct" DECIMAL(19,4),
    "overdueReceivables" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "overduePayables" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "metricsPayload" JSONB NOT NULL,
    "sourceRecordIds" JSONB NOT NULL,
    "dataLimitations" JSONB NOT NULL,
    "recurringPatterns" JSONB,
    "forecastComparison" JSONB,
    "historicalInsights" JSONB,
    "assumptionsAndNotes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowForecast" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "scenarioType" "ForecastScenarioType" NOT NULL DEFAULT 'BASE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "openingCashBalance" DECIMAL(19,4) NOT NULL,
    "projectedInflows" DECIMAL(19,4) NOT NULL,
    "projectedOutflows" DECIMAL(19,4) NOT NULL,
    "projectedClosingCash" DECIMAL(19,4) NOT NULL,
    "minimumProjectedCash" DECIMAL(19,4) NOT NULL,
    "minimumCashDate" TIMESTAMP(3),
    "hasLiquidityWarning" BOOLEAN NOT NULL DEFAULT false,
    "uncertaintyBandPct" DECIMAL(19,4) NOT NULL DEFAULT 10.0000,
    "assumptions" JSONB NOT NULL,
    "sourceRecordIds" JSONB NOT NULL,
    "dataLimitations" JSONB,
    "actualComparison" JSONB,
    "createdByUserId" TEXT,

    CONSTRAINT "CashFlowForecast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastItem" (
    "id" TEXT NOT NULL,
    "forecastId" TEXT NOT NULL,
    "projectionDate" TIMESTAMP(3) NOT NULL,
    "expectedInflow" DECIMAL(19,4) NOT NULL,
    "expectedOutflow" DECIMAL(19,4) NOT NULL,
    "recurringInflow" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "recurringOutflow" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "netCashFlow" DECIMAL(19,4) NOT NULL,
    "cumulativeBalance" DECIMAL(19,4) NOT NULL,
    "optimisticBalance" DECIMAL(19,4) NOT NULL,
    "conservativeBalance" DECIMAL(19,4) NOT NULL,
    "drivers" JSONB NOT NULL,

    CONSTRAINT "ForecastItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "baselineForecastId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "customerPaymentDelayDays" INTEGER NOT NULL DEFAULT 0,
    "salesGrowthPct" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "operatingCostChangePct" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "supplierPaymentTimingDays" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioResult" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "baselineClosingCash" DECIMAL(19,4) NOT NULL,
    "scenarioClosingCash" DECIMAL(19,4) NOT NULL,
    "netCashImpact" DECIMAL(19,4) NOT NULL,
    "baselineMinimumCash" DECIMAL(19,4) NOT NULL,
    "scenarioMinimumCash" DECIMAL(19,4) NOT NULL,
    "triggersLiquidityWarning" BOOLEAN NOT NULL DEFAULT false,
    "runwayImpactMonths" DECIMAL(19,4),
    "dailyComparisons" JSONB NOT NULL,
    "impactSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAlert" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "RiskAlertType" NOT NULL,
    "severity" "RiskSeverity" NOT NULL,
    "reviewPriority" INTEGER NOT NULL DEFAULT 2,
    "status" "RiskAlertStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "detectionMethod" TEXT NOT NULL,
    "metricValue" DECIMAL(19,4),
    "thresholdValue" DECIMAL(19,4),
    "supportingRecordIds" JSONB NOT NULL,
    "nonFraudDisclaimer" TEXT NOT NULL DEFAULT 'Statistical or rule-based anomaly signal for human review; not a determination of confirmed fraud.',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetType" "ReviewTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "riskAlertId" TEXT,
    "action" "ReviewActionType" NOT NULL,
    "reviewerUserId" TEXT NOT NULL,
    "reviewerNotes" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "taskClassification" TEXT NOT NULL,
    "selectedAgents" JSONB NOT NULL,
    "executionMode" TEXT NOT NULL DEFAULT 'SEQUENTIAL_AND_PARALLEL',
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "humanReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "preHookLog" JSONB,
    "duringHookLog" JSONB,
    "postHookLog" JSONB,
    "errorHookLog" JSONB,
    "synthesizedResult" JSONB,
    "verifierReport" JSONB,
    "sourceRecordIds" JSONB,
    "modelUsageSummary" JSONB,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "workflowRunId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "loadedSkills" JSONB,
    "allowedTools" JSONB NOT NULL,
    "invokedTools" JSONB NOT NULL,
    "mcpToolCalls" JSONB,
    "blockedOperations" JSONB,
    "modelUsage" JSONB,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "inputContext" JSONB NOT NULL,
    "outputPayload" JSONB,
    "evidenceCitations" JSONB,
    "errorDetails" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "title" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "summaryMetrics" JSONB NOT NULL,
    "narrativeBody" JSONB NOT NULL,
    "sourceRecordIds" JSONB NOT NULL,
    "exportFormats" JSONB NOT NULL,
    "generatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "category" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "linkPath" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "RiskSeverity" NOT NULL DEFAULT 'MEDIUM',
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "relatedEntityId" TEXT,
    "relatedType" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "ipAddress" TEXT,
    "details" JSONB,
    "integrityHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_tokenHash_idx" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_slug_idx" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_role_idx" ON "OrganizationMembership"("organizationId", "role");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "DataSource_organizationId_type_idx" ON "DataSource"("organizationId", "type");

-- CreateIndex
CREATE INDEX "ImportBatch_organizationId_status_idx" ON "ImportBatch"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_organizationId_fileChecksum_idx" ON "ImportBatch"("organizationId", "fileChecksum");

-- CreateIndex
CREATE INDEX "FinancialAccount_organizationId_type_isArchived_idx" ON "FinancialAccount"("organizationId", "type", "isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialAccount_organizationId_code_key" ON "FinancialAccount"("organizationId", "code");

-- CreateIndex
CREATE INDEX "FinancialTransaction_organizationId_transactionDate_idx" ON "FinancialTransaction"("organizationId", "transactionDate");

-- CreateIndex
CREATE INDEX "FinancialTransaction_organizationId_type_category_idx" ON "FinancialTransaction"("organizationId", "type", "category");

-- CreateIndex
CREATE INDEX "FinancialTransaction_organizationId_duplicateHash_idx" ON "FinancialTransaction"("organizationId", "duplicateHash");

-- CreateIndex
CREATE INDEX "FinancialTransaction_organizationId_isArchived_idx" ON "FinancialTransaction"("organizationId", "isArchived");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_status_dueDate_idx" ON "Invoice"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_invoiceNumber_key" ON "Invoice"("organizationId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "Bill_organizationId_status_dueDate_idx" ON "Bill"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Bill_organizationId_billNumber_key" ON "Bill"("organizationId", "billNumber");

-- CreateIndex
CREATE INDEX "PaymentRecord_organizationId_paymentDate_idx" ON "PaymentRecord"("organizationId", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentRecord_invoiceId_idx" ON "PaymentRecord"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentRecord_billId_idx" ON "PaymentRecord"("billId");

-- CreateIndex
CREATE INDEX "Budget_organizationId_periodType_startDate_endDate_idx" ON "Budget"("organizationId", "periodType", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_idx" ON "BudgetLine"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetLine_budgetId_category_department_key" ON "BudgetLine"("budgetId", "category", "department");

-- CreateIndex
CREATE INDEX "BudgetRevision_budgetId_version_idx" ON "BudgetRevision"("budgetId", "version");

-- CreateIndex
CREATE INDEX "FinancialMetricSnapshot_organizationId_periodKey_idx" ON "FinancialMetricSnapshot"("organizationId", "periodKey");

-- CreateIndex
CREATE INDEX "FinancialMetricSnapshot_organizationId_periodStart_periodEn_idx" ON "FinancialMetricSnapshot"("organizationId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "CashFlowForecast_organizationId_horizonDays_scenarioType_ve_idx" ON "CashFlowForecast"("organizationId", "horizonDays", "scenarioType", "version");

-- CreateIndex
CREATE INDEX "ForecastItem_forecastId_projectionDate_idx" ON "ForecastItem"("forecastId", "projectionDate");

-- CreateIndex
CREATE INDEX "Scenario_organizationId_createdAt_idx" ON "Scenario"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ScenarioResult_scenarioId_idx" ON "ScenarioResult"("scenarioId");

-- CreateIndex
CREATE INDEX "RiskAlert_organizationId_status_severity_idx" ON "RiskAlert"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "RiskAlert_organizationId_type_idx" ON "RiskAlert"("organizationId", "type");

-- CreateIndex
CREATE INDEX "ReviewDecision_organizationId_targetType_targetId_idx" ON "ReviewDecision"("organizationId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "ReviewDecision_riskAlertId_idx" ON "ReviewDecision"("riskAlertId");

-- CreateIndex
CREATE INDEX "WorkflowRun_organizationId_status_startedAt_idx" ON "WorkflowRun"("organizationId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_workflowRunId_agentType_idx" ON "AgentRun"("workflowRunId", "agentType");

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_status_idx" ON "AgentRun"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ReportRecord_organizationId_type_createdAt_idx" ON "ReportRecord"("organizationId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_userId_isRead_idx" ON "Notification"("organizationId", "userId", "isRead");

-- CreateIndex
CREATE INDEX "FollowUpTask_organizationId_status_priority_idx" ON "FollowUpTask"("organizationId", "status", "priority");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_action_status_idx" ON "AuditEvent"("action", "status");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialAccount" ADD CONSTRAINT "FinancialAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinancialAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialTransaction" ADD CONSTRAINT "FinancialTransaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill" ADD CONSTRAINT "Bill_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "FinancialTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialMetricSnapshot" ADD CONSTRAINT "FinancialMetricSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowForecast" ADD CONSTRAINT "CashFlowForecast_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastItem" ADD CONSTRAINT "ForecastItem_forecastId_fkey" FOREIGN KEY ("forecastId") REFERENCES "CashFlowForecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_baselineForecastId_fkey" FOREIGN KEY ("baselineForecastId") REFERENCES "CashFlowForecast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioResult" ADD CONSTRAINT "ScenarioResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAlert" ADD CONSTRAINT "RiskAlert_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_riskAlertId_fkey" FOREIGN KEY ("riskAlertId") REFERENCES "RiskAlert"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_workflowRunId_fkey" FOREIGN KEY ("workflowRunId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRecord" ADD CONSTRAINT "ReportRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
