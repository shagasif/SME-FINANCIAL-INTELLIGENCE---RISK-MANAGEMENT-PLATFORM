# Frontend API Integration Contract Documentation

## SME Financial Intelligence & Risk Management Platform (`v1.0.0`)

---

## 1. Base URL, Versioning & Headers

- **Base URL**: `http://localhost:3000/api`
- **Health Endpoints (Unversioned)**:
  - `GET /api/health`
  - `GET /api/health/ready`
- **Domain Endpoints (Version 1)**:
  - `/api/v1/...`
- **Swagger / OpenAPI UI**:
  - `http://localhost:3000/api/docs`
- **Authentication Header**:
  ```http
  Authorization: Bearer <accessToken>
  Content-Type: application/json
  ```
- **Currency & Monetary Format**:
  - All monetary values and ratios are returned as **fixed-precision 4-decimal strings** (e.g., `"15249.5000"`) paired with ISO-4217 currency codes (`"USD"`).
- **Date Format**:
  - All dates and timestamps use **ISO-8601 UTC strings** (e.g., `"2026-10-15T00:00:00.000Z"`).

---

## 2. Standard Error Response Envelope

All API errors return a consistent JSON structure compatible with `frontend/src/types/api.types.ts`:

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "Insufficient role permissions. Required one of: PLATFORM_ADMIN, BUSINESS_OWNER, FINANCE_MANAGER, ACCOUNTANT",
  "path": "/api/v1/organizations/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d/reports/123/export",
  "timestamp": "2026-11-09T18:00:00.000Z"
}
```

---

## 3. Role Permissions Matrix

| Role Enum | Create/Edit Ledger & CSV | Manage Budgets & Invoices | Run Forecasts, Scenarios & AI Workflows | Export Reports | Read Dashboards & Audit Logs |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `PLATFORM_ADMIN` | Yes | Yes | Yes | Yes | Yes |
| `BUSINESS_OWNER` | Yes | Yes | Yes | Yes | Yes |
| `FINANCE_MANAGER` | Yes | Yes | Yes | Yes | Yes |
| `ACCOUNTANT` | Yes | Yes | Yes | Yes | Yes |
| `OPERATIONS_MANAGER` | Read | Bills & Budgets | Yes | No | Read |
| `FINANCIAL_ANALYST` | Read | Read | Yes | No | Read |
| `AUDITOR` | Read-Only | Read-Only | Read-Only | No (`403`) | Yes (Full Read + Audit Trail) |

---

## 4. Complete REST API Endpoint Reference

### 4.1 Authentication & Sessions (`/api/v1/auth`)
- `POST /api/v1/auth/register` — Register user and optional initial organization workspace.
- `POST /api/v1/auth/login` — Authenticate and receive `{ accessToken, expiresAt, user, memberships }`.
- `POST /api/v1/auth/logout` — Revoke current session (`Bearer` token required).
- `GET /api/v1/auth/me` — Get active user profile and organization memberships.
- `POST /api/v1/auth/password-reset/request` — Request password recovery token.
- `POST /api/v1/auth/password-reset/confirm` — Confirm password reset and revoke old sessions.

### 4.2 Organizations & Memberships (`/api/v1/organizations`)
- `POST /api/v1/organizations` — Create new organization workspace.
- `GET /api/v1/organizations` — List accessible organizations.
- `GET /api/v1/organizations/:orgId` — Get organization details and members.
- `POST /api/v1/organizations/:orgId/members` — Add member with role (`RoleType`).
- `Patch /api/v1/organizations/:orgId/members/:membershipId` — Update member role or status.

### 4.3 Financial Accounts & Transactions (`/api/v1/organizations/:orgId`)
- `POST /api/v1/organizations/:orgId/accounts` — Create financial account (`BANK`, `CASH`, `ACCOUNTS_RECEIVABLE`, `ACCOUNTS_PAYABLE`, `CREDIT_CARD`, `SHORT_TERM_DEBT`, etc.).
- `GET /api/v1/organizations/:orgId/accounts` — List accounts with `openingBalance` and `currentBalance`.
- `DELETE /api/v1/organizations/:orgId/accounts/:accountId` — Archive account.
- `POST /api/v1/organizations/:orgId/transactions` — Record `INCOME`, `EXPENSE`, or `TRANSFER` transaction.
- `GET /api/v1/organizations/:orgId/transactions` — Filter/search transactions (`type`, `category`, `department`, `accountId`, `startDate`, `endDate`, `search`, `page`, `limit`).
- `PATCH /api/v1/organizations/:orgId/transactions/:transactionId` — Edit transaction & reconcile balance.
- `DELETE /api/v1/organizations/:orgId/transactions/:transactionId` — Archive transaction & reverse balance impact.

### 4.4 Two-Step CSV Import Pipeline (`/api/v1/organizations/:orgId/csv-imports`)
- `POST /api/v1/organizations/:orgId/csv-imports/preview`
  - **Request**:
    ```json
    {
      "accountId": "uuid",
      "fileName": "october_statement.csv",
      "csvContent": "date,type,amount,description,category,counterparty\n2026-10-05,INCOME,15000.00,SaaS License,Sales Revenue,GlobalCorp",
      "columnMapping": {
        "dateColumn": "date",
        "typeColumn": "type",
        "amountColumn": "amount",
        "descriptionColumn": "description",
        "categoryColumn": "category",
        "counterpartyColumn": "counterparty"
      }
    }
    ```
  - **Response**: Returns `ImportBatch` with `previewRows`, `rowErrors`, `duplicateRows`, and `sanitizationNotes`.
- `POST /api/v1/organizations/:orgId/csv-imports/:batchId/confirm` — Commits validated rows (`{ "skipDuplicates": true }`).
- `GET /api/v1/organizations/:orgId/csv-imports` — List import batches.
- `GET /api/v1/organizations/:orgId/csv-imports/:batchId` — Get batch details.

### 4.5 Invoices, Supplier Bills & Aging (`/api/v1/organizations/:orgId`)
- `POST /api/v1/organizations/:orgId/invoices` — Create customer invoice.
- `GET /api/v1/organizations/:orgId/invoices` — List invoices with overdue tracking.
- `POST /api/v1/organizations/:orgId/invoices/:invoiceId/payments` — Record partial or full invoice payment.
- `POST /api/v1/organizations/:orgId/bills` — Create supplier bill.
- `GET /api/v1/organizations/:orgId/bills` — List supplier bills.
- `POST /api/v1/organizations/:orgId/bills/:billId/payments` — Record partial or full bill payment.
- `GET /api/v1/organizations/:orgId/aging` — Get deterministic `receivablesAging` and `payablesAging` buckets (`CURRENT`, `1_TO_30_DAYS`, `31_TO_60_DAYS`, `61_TO_90_DAYS`, `OVER_90_DAYS`).

### 4.6 Budgets, Variance & Revisions (`/api/v1/organizations/:orgId/budgets`)
- `POST /api/v1/organizations/:orgId/budgets` — Create `MONTHLY`, `QUARTERLY`, or `ANNUAL` budget with category/department lines.
- `GET /api/v1/organizations/:orgId/budgets` — List budgets and revision history.
- `PATCH /api/v1/organizations/:orgId/budgets/:budgetId/revise` — Revise budget lines and append `BudgetRevision`.
- `GET /api/v1/organizations/:orgId/budgets/:budgetId/variance` — Compute actual-vs-budget variance per line (`ON_TRACK`, `WARNING`, `OVERRUN`).

### 4.7 Deterministic Financial Intelligence (`/api/v1/organizations/:orgId/analytics/metrics`)
- `GET /api/v1/organizations/:orgId/analytics/metrics?startDate=...&endDate=...`
  - Returns all 10 metrics (`operatingCashFlow`, `cashRunway`, `currentRatio`, `quickRatio`, `grossMargin`, `expenseGrowth`, `workingCapital`, `budgetVariance`, `receivableAging`, `payableAging`), each with `{ status, value, unit, formula, formulaVersion, reportingPeriod, currency, sourceRecordIds, dataLimitations }`.

### 4.8 Cash-Flow Forecasting (`/api/v1/organizations/:orgId/forecasts`)
- `POST /api/v1/organizations/:orgId/forecasts` — Generate `7`, `30`, `60`, or `90`-day forecast (`BASE`, `OPTIMISTIC`, `CONSERVATIVE`).
- `GET /api/v1/organizations/:orgId/forecasts` — List forecast versions.
- `GET /api/v1/organizations/:orgId/forecasts/:forecastId` — Get forecast with daily `ForecastItem` trajectory.
- `POST /api/v1/organizations/:orgId/forecasts/:forecastId/compare-actuals` — Compare forecast against actual ledger cash flows.

### 4.9 FinMemory Historical Intelligence (`/api/v1/organizations/:orgId/finmemory`)
- `POST /api/v1/organizations/:orgId/finmemory/snapshots` — Generate period snapshot (`periodKey`, `periodStart`, `periodEnd`).
- `GET /api/v1/organizations/:orgId/finmemory/snapshots` — List historical snapshots.
- `GET /api/v1/organizations/:orgId/finmemory/compare?baseSnapshotId=...&targetSnapshotId=...` — Compare two snapshots.

### 4.10 Anomaly Detection & Risk Alerts (`/api/v1/organizations/:orgId/risk-alerts`)
- `POST /api/v1/organizations/:orgId/risk-alerts/scan` — Run 8-rule anomaly/risk scan (`UNUSUAL_AMOUNT`, `UNUSUAL_FREQUENCY`, `TIMING_CHANGE`, `CATEGORY_SHIFT`, `DUPLICATE_CANDIDATE`, `CASH_SHORTFALL`, `OVERDUE_RECEIVABLE`, `BUDGET_OVERRUN`).
- `GET /api/v1/organizations/:orgId/risk-alerts` — List alerts with `reviewDecisions`.
- `POST /api/v1/organizations/:orgId/risk-alerts/:alertId/triage` — Submit `ACKNOWLEDGE`, `DISMISS`, `INVESTIGATE`, or `ESCALATE` decision with `reviewerNotes`.

### 4.11 Scenario Planning (`/api/v1/organizations/:orgId/scenarios`)
- `POST /api/v1/organizations/:orgId/scenarios` — Run isolated what-if scenario (`customerPaymentDelayDays`, `salesGrowthPct`, `operatingCostChangePct`, `supplierPaymentTimingDays`).
- `GET /api/v1/organizations/:orgId/scenarios` — List scenarios and `ScenarioResult` comparisons.

### 4.12 Multi-Agent Orchestrator, MCP, Skills & AI Model Provider (`/api/v1/organizations/:orgId/ai`)
- `POST /api/v1/organizations/:orgId/ai/workflows/execute` — Execute the 10-step Supervisor -> Specialist Agents -> Skills -> MCP Tools -> AI Model -> Verifier AI workflow.
- `GET /api/v1/organizations/:orgId/ai/workflows` — List `WorkflowRun` records with `AgentRun` details.
- `GET /api/v1/organizations/:orgId/ai/workflows/:workflowId` — Inspect a workflow run, hook logs (`preHookLog`, `duringHookLog`, `postHookLog`, `errorHookLog`), `verifierReport`, and `modelUsageSummary`.
- `GET /api/v1/organizations/:orgId/ai/mcp/discovery` — Discover connected MCP servers and approved tools.
- `POST /api/v1/organizations/:orgId/ai/mcp/invoke` — Invoke an approved MCP tool inside an isolated agent sandbox.
- `GET /api/v1/organizations/:orgId/ai/skills` — List registered Agent Skills and their schemas/instructions.
- `POST /api/v1/organizations/:orgId/ai/skills/execute` — Execute an Agent Skill inside its responsible agent's sandbox.
- `GET /api/v1/organizations/:orgId/ai/model-provider/status` — Inspect AI provider configuration (zero secrets exposed) and token/cost usage.
- `GET /api/v1/organizations/:orgId/ai/sandbox/boundaries` — Inspect sandbox security boundaries and per-agent tool allowlists.

### 4.13 Reports, Exports, Notifications, Tasks & Audit (`/api/v1/organizations/:orgId`)
- `POST /api/v1/organizations/:orgId/reports` — Generate `BUSINESS_HEALTH`, `CASH_FLOW`, `EXPENSE`, `BUDGET`, or `RISK` report.
- `GET /api/v1/organizations/:orgId/reports` — List generated reports.
- `GET /api/v1/organizations/:orgId/reports/:reportId/export?format=CSV|PDF` — Export report (RBAC-restricted).
- `GET /api/v1/organizations/:orgId/notifications` — List notifications.
- `PATCH /api/v1/organizations/:orgId/notifications/:notificationId/read` — Mark notification read.
- `POST /api/v1/organizations/:orgId/tasks` — Create follow-up task.
- `GET /api/v1/organizations/:orgId/tasks` — List follow-up tasks.
- `PATCH /api/v1/organizations/:orgId/tasks/:taskId/status` — Update task status.
- `GET /api/v1/organizations/:orgId/review-history` — List reviewer decisions.
- `GET /api/v1/organizations/:orgId/audit-events` — List immutable SHA-256 hashed audit events.
