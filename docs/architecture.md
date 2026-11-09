# System Architecture Specification

## AI-Powered SME Financial Intelligence & Risk Management Platform (Phase 1 Foundation)

---

## 1. Architectural Pattern: Modular Monolith

Phase 1 establishes a **Modular Monolithic Architecture**. Rather than introducing premature distributed microservice complexity, the platform separates presentation, API transport, cross-cutting security/validation concerns, and persistence into well-defined modules with strict compile-time boundaries.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        Browser Client (React 19 + Vite)                    │
│  ┌──────────────────┐  ┌───────────────────────┐  ┌─────────────────────┐  │
│  │ Application Shell│  │ Design Token System   │  │ Typed HTTP Client   │  │
│  │ & Landing Page   │  │ (Light & Dark Modes)  │  │ (apiClient.ts)      │  │
│  └────────┬─────────┘  └───────────────────────┘  └──────────┬──────────┘  │
└───────────┼──────────────────────────────────────────────────┼─────────────┘
            │ HTTPS / REST (/api/*)                            │
            ▼                                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     NestJS 12 Modular Monolith Backend                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Security & Cross-Cutting Pipeline                                    │  │
│  │ Helmet Headers -> Restricted CORS -> ValidationPipe -> ExceptionFilter│  │
│  └──────────────────────────────────┬───────────────────────────────────┘  │
│                                     │                                      │
│  ┌──────────────────────┐  ┌────────▼─────────┐  ┌──────────────────────┐  │
│  │ ConfigModule         │  │ HealthModule     │  │ Future Domain &      │  │
│  │ (Startup Env Check)  │  │ (/health, /ready)│  │ AI Agent Modules     │  │
│  └──────────────────────┘  └────────┬─────────┘  └──────────┬───────────┘  │
│                                     │                       │              │
│                            ┌────────▼───────────────────────▼───────────┐  │
│                            │ PrismaModule / PrismaService (Prisma 7)    │  │
│                            │ (@prisma/adapter-pg Driver Adapter)        │  │
│                            └────────────────────┬───────────────────────┘  │
└─────────────────────────────────────────────────┼──────────────────────────┘
                                                  │ TCP (5432)
                                                  ▼
                                    ┌───────────────────────────┐
                                    │   PostgreSQL 16 Database  │
                                    └───────────────────────────┘
```

---

## 2. Frontend Architecture (`frontend/`)

The frontend is organized into distinct layers under `frontend/src/`:

- **Application Shell & Layout (`src/components/layout/`)**:
  - `AppShell.tsx`: Provides semantic HTML landmarks (`<header>`, `<main id="main-content">`, `<footer>`) and a keyboard-accessible skip-to-content link.
  - `Header.tsx`: Displays brand identity, Phase 1 status indicator, and the Light/Dark Mode theme switcher.
  - `Footer.tsx`: Displays architectural metadata and the active API base URL.
- **Reusable UI Components (`src/components/ui/`)**:
  - `Card.tsx`, `Badge.tsx`, `StatusIndicator.tsx`: Stateless, theme-aware components built with Tailwind CSS v4 and CSS custom properties.
- **Pages (`src/pages/`)**:
  - `LandingPage.tsx`: Renders the Phase 1 platform overview, the five core product pillars, live backend/database health diagnostics, and architectural boundary documentation.
- **Services & API Communication (`src/services/`)**:
  - `apiClient.ts`: Centralized `fetch` wrapper with request timeout (`AbortController`), JSON response parsing, and normalized `ApiClientError` exceptions.
  - `healthService.ts`: Typed service functions for `GET /api/health` and `GET /api/health/ready`.
- **Hooks (`src/hooks/`)**:
  - `useSystemHealth.ts`: Encapsulates loading, online/offline, and database readiness state transitions with manual retry support.
  - `useTheme.ts`: Manages Light Mode and Dark Mode (`data-theme="light" | "dark"`) with `localStorage` persistence.
- **Configuration, Types & Utilities (`src/config/`, `src/types/`, `src/utils/`)**:
  - `env.ts`: Centralizes `VITE_API_BASE_URL` resolution.
  - `api.types.ts` & `health.types.ts`: Strict TypeScript interfaces shared across services, hooks, and components.
  - `formatters.ts`: Pure formatting helpers for ISO-8601 timestamps.
- **Styles & Visual Design Tokens (`src/index.css`)**:
  - Implements Page 12 of the Capstone Blueprint: **Deep Forest Green** (`#16382C`), **Charcoal** (`#181D1B`), **Warm Ivory** (`#F6F3EC`), and restrained **Teal** (`#1F6E6C`) and **Amber** (`#B8732A`) accents across both Light Mode and Dark Mode.

---

## 3. Backend Architecture (`backend/`)

The NestJS backend is structured under `backend/src/` for clear separation of concerns:

- **Core Configuration (`src/config/`)**:
  - `env.validation.ts`: Validates `NODE_ENV`, `PORT`, `FRONTEND_URL`, and `DATABASE_URL` at application bootstrap before any module initializes.
- **Common Infrastructure (`src/common/`)**:
  - `filters/all-exceptions.filter.ts`: Catches all unhandled exceptions and `HttpException` instances, returning a uniform JSON error envelope (`statusCode`, `error`, `message`, `path`, `timestamp`) without leaking stack traces.
  - `interceptors/logging.interceptor.ts`: Logs HTTP method, route path, status code, and execution duration while omitting headers, tokens, and request bodies.
  - `dto/pagination-query.dto.ts` & `dto/api-error-response.dto.ts`: Shared DTOs using `class-validator`, `class-transformer`, and `@nestjs/swagger`.
- **Database Infrastructure (`src/database/`)**:
  - `prisma.module.ts` & `prisma.service.ts`: Global NestJS module wrapping Prisma 7 `PrismaClient` with `@prisma/adapter-pg`. Implements `checkReadiness()` using a live `SELECT 1` round-trip query.
- **Health Monitoring (`src/health/`)**:
  - `health.controller.ts` & `health.service.ts`: Exposes `GET /api/health` (process liveness) and `GET /api/health/ready` (PostgreSQL readiness).

---

## 4. Database Infrastructure

- **Engine**: PostgreSQL 16.
- **ORM**: Prisma 7 (`prisma@7.10.1`, `@prisma/client@7.10.1`, `@prisma/adapter-pg@7.10.1`).
- **Configuration**:
  - `backend/prisma.config.ts` loads `DATABASE_URL` from the environment.
  - `backend/prisma/schema.prisma` defines the PostgreSQL datasource and generates ESM-compatible TypeScript client code into `backend/src/generated/prisma`.
- **Financial Precision Standard (Phase 2+ Preparation)**:
  - All future monetary columns (transaction amounts, invoice totals, balances, budget lines) must use PostgreSQL fixed-precision `NUMERIC(19, 4)` (`@db.Decimal(19, 4)`) paired with explicit ISO-4217 currency codes. Binary floating-point types (`Float`/`Real`) are strictly prohibited for financial calculations.

---

## 5. API Communication & Versioning

- **Global Prefix**: `/api`
- **URI Versioning Readiness**: NestJS URI versioning is enabled (`VersioningType.URI`) with `defaultVersion: VERSION_NEUTRAL` so `/api/health` and `/api/health/ready` remain directly accessible while future domain controllers declare `@Controller({ path: '...', version: '1' })` (resolving to `/api/v1/...`).
- **OpenAPI / Swagger**: Exposed at `http://localhost:3000/api/docs` in development and test environments.

---

## 6. Security Foundation

Implemented in Phase 1:
- **Helmet Security Headers**: Protects against common web vulnerabilities (`X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, etc.).
- **Restricted CORS**: Only origins explicitly configured in `FRONTEND_URL` are permitted.
- **Startup Secret & Config Validation**: Application refuses to start if `DATABASE_URL` or other required settings are invalid.
- **Strict DTO Validation**: Global `ValidationPipe` strips unknown properties (`whitelist: true`) and rejects unpermitted fields (`forbidNonWhitelisted: true`).
- **Safe Exception Handling**: Internal errors return generic `500 Internal server error` messages to clients.
- **Zero Sensitive Log Policy**: Request bodies, authorization headers, and connection strings are never written to application logs.

Prepared for Phase 3+:
- Authentication & session management.
- Backend-enforced Role-Based Access Control (RBAC) across the 7 Capstone roles (`Platform Administrator`, `Business Owner / Director`, `Finance Manager`, `Accountant / Bookkeeper`, `Operations Manager`, `Financial Analyst`, `Auditor / Read-only Reviewer`).
- Strict multi-tenant `organizationId` scoping on every query.
- Immutable audit logging (`AuditEvent`) and human approval gates for consequential actions.

---

## 7. Future Modular Domain Boundaries

Subsequent phases will add independent NestJS modules under `backend/src/modules/`:

1. `organizations/`: Business profile, reporting currency, fiscal year, and role memberships.
2. `financial-records/`: Chart of accounts (`FinancialAccount`), transactions (`FinancialTransaction`), and validated CSV import batches (`ImportBatch`).
3. `invoices-payables/`: Customer invoices, supplier bills, payment status, and deterministic receivables/payables aging.
4. `budgets/`: Departmental/category budgets, revisions, and actual-vs-budget variance calculation.
5. `cash-flow-forecasting/`: Deterministic `7/30/60/90`-day cash-flow projections across base, optimistic, and conservative scenarios.
6. `financial-analytics/`: Liquidity ratios (current ratio, quick ratio), working capital, gross margin, and expense growth indicators.
7. `risk-monitoring/`: Statistical and rule-based anomaly candidates, liquidity threshold warnings, and alert triage lifecycle.
8. `scenario-planning/`: What-if assumption adjustments and sensitivity comparisons against baseline forecasts.
9. `finmemory/`: Time-aware monthly financial snapshots (`FinancialMetricSnapshot`), period-over-period comparisons, forecast-vs-actual tracking, and decision history.
10. `reporting-audit/`: Structured financial/risk report generation, CSV/PDF export, synthetic data labeling, and immutable audit trails.

---

## 8. Future AI Orchestration Architecture

In accordance with Section 4 of the Capstone Blueprint, future AI capabilities will be isolated inside `backend/src/modules/ai-orchestration/` and governed by strict operational rules:

### Architectural Rules for AI Agents
1. **No Direct Database Access**: Agents never receive database credentials or raw Prisma clients. They invoke narrow, permission-checked backend service tools that enforce organization and role scope.
2. **Deterministic Math Separation**: All totals, balances, ratios, and forecast trajectories are computed by tested TypeScript domain services—never by language-model arithmetic.
3. **Read-Only Default & Human Accountability**: Agents operate in read-only mode by default. Any consequential recommendation requires explicit human review and approval.

### Planned Agent Topology
- **Central Supervisor / AI Orchestrator**: Classifies user requests, validates permissions, executes deterministic calculation services first, dispatches scoped context to specialist agents, and routes outputs through the Verifier Agent.
- **Finance Data Analyst Agent**: Inspects normalized records, category coverage, and data completeness.
- **Cash-Flow Forecasting Agent**: Explains forecast trajectories, underlying assumptions, and confidence ranges.
- **Expense & Anomaly Detection Agent**: Explains flagged spending anomalies and duplicate candidates with record citations.
- **Financial Risk Assessment Agent**: Evaluates liquidity pressure, overdue receivables concentration, and budget overrun risks.
- **Scenario Planning Agent**: Compares user-modified assumptions against baseline projections.
- **Strategic Recommendation Agent**: Synthesizes verified findings into prioritized options with caveats.
- **Financial Reporting Agent**: Compiles narrative report drafts grounded in verified calculation snapshots.
- **Verifier AI Agent**: Inspects structured outputs, schema compliance, arithmetic citations, and source record IDs before any response is returned to the user.
