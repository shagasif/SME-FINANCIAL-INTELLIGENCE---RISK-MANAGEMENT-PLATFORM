# SME Financial Intelligence & Risk Management Platform — Backend

Production-grade **NestJS 12 + TypeScript + PostgreSQL 16 + Prisma 7** modular monolithic backend implementing deterministic financial intelligence, multi-horizon cash-flow forecasting, **FinMemory** historical intelligence, anomaly/risk surveillance, non-destructive scenario planning, and a **Multi-Agent AI Orchestration Backend** with **MCP (Model Context Protocol) Integration**, **Reusable Agent Skills**, **AI Model Provider Gateway**, **Verifier AI Agent**, **Sandboxing**, and **Lifecycle Hooks**.

---

## 1. Backend Architecture & Module Map

```text
backend/
├── prisma/
│   ├── schema.prisma                   # 22 PostgreSQL models & 18 enums (@db.Decimal(19, 4))
│   └── migrations/                     # Committed SQL migrations applied to PostgreSQL 16
├── src/
│   ├── common/
│   │   ├── decorators/                 # @Roles(), @Public(), @CurrentUser()
│   │   ├── dto/                        # PaginationQueryDto, ApiErrorResponseDto
│   │   ├── filters/                    # AllExceptionsFilter (safe JSON error envelopes)
│   │   ├── guards/                     # JwtAuthGuard, OrgRbacGuard, RateLimitGuard
│   │   ├── interceptors/               # LoggingInterceptor (zero-secret HTTP logging)
│   │   └── utils/                      # DecimalMath (Decimal.js), SecurityUtil (scrypt, JWT, AES-256-GCM, sanitization)
│   ├── config/
│   │   └── env.validation.ts           # Fail-fast bootstrap environment validation
│   ├── database/
│   │   └── prisma.service.ts           # Prisma 7 (@prisma/adapter-pg) + live SELECT 1 readiness
│   ├── health/
│   │   └── health.controller.ts        # GET /api/health & GET /api/health/ready
│   └── modules/
│       ├── audit/                      # Immutable SHA-256 integrity-hashed AuditEvent service & API
│       ├── auth/                       # Registration, login, session revocation, password recovery
│       ├── organizations/              # Multi-tenant workspaces & 7-role memberships
│       ├── financial-transactions/     # Chart of accounts & decimal-safe income/expense/transfer ledger
│       ├── csv-import/                 # Two-step CSV upload, column mapping, preview, duplicate & injection checks
│       ├── invoices-payables/          # Customer invoices, supplier bills, partial payments & AR/AP aging
│       ├── budgets/                    # Monthly/quarterly budgets, variance attribution & revision history
│       ├── financial-analytics/        # 10 deterministic financial metrics with formulas & missing-data guards
│       ├── cash-flow-forecasting/      # 7/30/60/90-day Base/Optimistic/Conservative projections & actual comparison
│       ├── finmemory/                  # Monthly snapshots, completeness scoring, period & forecast comparisons
│       ├── risk-monitoring/            # 8 anomaly/risk detectors, non-fraud policy & human review triage
│       ├── scenario-planning/          # Isolated what-if sensitivity simulations
│       ├── ai-orchestration/           # Supervisor, 8 Specialist Agents, MCP, Agent Skills, AI Model Provider, Sandbox & Hooks
│       │   ├── hooks/                  # Pre, During, Post, and Error lifecycle hooks
│       │   ├── mcp/                    # McpIntegrationService & ToolRegistryService
│       │   ├── model-provider/         # AiModelProviderService (OpenAI/Gemini/Anthropic + Deterministic Fallback)
│       │   ├── sandbox/                # AgentSandboxService (tool allowlists, org isolation, blocked op logging)
│       │   ├── skills/                 # AgentSkillsRegistryService (versioned executable Skills for all 8 agents)
│       │   └── supervisor-orchestrator.service.ts
│       └── reports/                    # Business Health, Cash-Flow, Expense, Budget & Risk reports, CSV/PDF exports, Tasks & Notifications
└── test/
    ├── health.e2e-spec.ts              # Health & readiness E2E suite
    └── platform-complete.e2e-spec.ts   # Full-stack PostgreSQL E2E suite (Sections 17 & 24)
```

---

## 2. Role-Based Access Control (7 Platform Roles)

Enforced on every protected endpoint via `JwtAuthGuard` and `OrgRbacGuard`:
1. `PLATFORM_ADMIN` — Platform Administrator
2. `BUSINESS_OWNER` — Business Owner / Director
3. `FINANCE_MANAGER` — Finance Manager
4. `ACCOUNTANT` — Accountant / Bookkeeper
5. `OPERATIONS_MANAGER` — Operations Manager
6. `FINANCIAL_ANALYST` — Financial Analyst
7. `AUDITOR` — Auditor / Read-only Reviewer (strictly read-only; blocked from mutating records or executing restricted exports)

---

## 3. Multi-Agent AI Architecture, MCP, Skills, Sandbox & Hooks

### 3.1 Specialist Agents (8 Agents + Central Supervisor)
1. `FINANCE_DATA_ANALYST` — Executes `skill.financial-data-analysis` & `skill.aging-and-budget-attribution`
2. `CASH_FLOW_FORECASTING` — Executes `skill.cash-flow-forecasting`
3. `EXPENSE_ANOMALY_DETECTION` — Executes `skill.expense-and-anomaly-analysis`
4. `FINANCIAL_RISK_ASSESSMENT` — Executes `skill.financial-risk-assessment`
5. `SCENARIO_PLANNING` — Executes `skill.scenario-planning`
6. `STRATEGIC_RECOMMENDATION` — Executes `skill.strategic-financial-recommendations`
7. `FINANCIAL_REPORTING` — Executes `skill.financial-reporting`
8. `VERIFIER_AI` — Executes `skill.financial-output-verification`

### 3.2 Mandatory Sandbox Security Boundaries (`AgentSandboxService`)
- **Isolated Execution Contexts**: Each agent run receives an isolated `sandboxId` scoped strictly to a single `organizationId`.
- **Least-Privilege Tool Allowlists**: Each `AgentType` can invoke only its explicitly allowlisted MCP tools in `ToolRegistryService`.
- **Blocked Capabilities**: `raw_database_query`, `prisma_direct_access`, `shell_execute`, `child_process_exec`, `read_env_secrets`, `unrestricted_network_fetch`, `initiate_payment_transfer`, and `automatic_fund_transfer` are globally blocked and logged with `status: BLOCKED_BY_SANDBOX` in `AuditEvent`.
- **Timeouts, Cancellation & Rate Limits**: Enforces per-agent execution timeouts (`15,000ms` default), tool call caps (`8` calls/run), cancellation flags, and organization rate limits (`30` runs/min).

---

## 4. Setup & Commands

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
npm test
npm run test:e2e
npm run start:dev
```

- **Liveness Probe**: `GET http://localhost:3000/api/health`
- **Database Readiness Probe**: `GET http://localhost:3000/api/health/ready`
- **Interactive Swagger / OpenAPI Documentation**: `http://localhost:3000/api/docs`
