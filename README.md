# AI-Powered SME Financial Intelligence & Risk Management Platform

> **Phase 1: Architectural & Development Environment Foundation**  
> Aligned with the *AI-Powered SME Financial Intelligence & Risk Management Platform — Capstone Project Blueprint (Version 1.0)*.

---

## 1. Project Overview

The **AI-Powered SME Financial Intelligence & Risk Management Platform** is a responsive, browser-based financial intelligence and decision-support platform designed for small and medium-sized enterprises (SMEs).

This repository currently implements **Phase 1 (Foundation Initialization)**: a modular monolithic software foundation comprising a React + TypeScript + Vite + Tailwind CSS frontend, a NestJS + TypeScript REST API backend with OpenAPI/Swagger support, and a PostgreSQL + Prisma 7 ORM persistence layer with live health and database readiness diagnostics.

---

## 2. Project Purpose

Small and medium-sized businesses frequently manage financial data across disconnected spreadsheets, bank exports, invoices, and accounting tools. Static historical records alone rarely provide timely visibility into upcoming liquidity requirements, overdue receivables, anomalous spending, or period-over-period shifts.

The platform is engineered to provide:

- **Financial visibility**: Consolidated clarity across business income, expenses, invoices, payables, and budgets.
- **Cash-flow awareness**: Short-term liquidity visibility and configurable horizon cash-flow projections (`7`, `30`, `60`, and `90` days).
- **Financial risk monitoring**: Evidence-linked detection of unusual expense patterns, overdue receivables, and cash shortfall risks.
- **Historical financial intelligence**: Time-aware period comparisons powered by **FinMemory**, connecting snapshots, prior forecasts, and actual outcomes.
- **Evidence-based business decisions**: Deterministic, decimal-safe financial calculations paired with bounded multi-agent interpretation, scenario analysis, verifier checks, and human approval workflows.

---

## 3. Technology Stack

| Layer | Technology | Installed Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js / npm | `v24.20.0` / `12.2.0` | JavaScript/TypeScript execution & package management |
| **Frontend Framework** | React + TypeScript | `19.3.1` / `6.0.3` | Component-driven UI with strict static typing |
| **Frontend Build Tool** | Vite | `8.3.7` | Fast HMR development server and production bundler |
| **Styling & Design System** | Tailwind CSS (`@tailwindcss/vite`) | `4.3.3` | Design tokens (Deep Forest Green, Charcoal, Warm Ivory, Teal & Amber) + Light/Dark Mode |
| **Future Analytics Library** | Recharts | `3.10.1` | Maintained chart library prepared for Phase 5+ analytics (no charts rendered in Phase 1) |
| **Backend Framework** | NestJS (`@nestjs/core`, `@nestjs/common`) | `12.4.1` | Modular monolithic REST API architecture |
| **API Documentation** | OpenAPI / Swagger (`@nestjs/swagger`) | `12.1.1` | Auto-generated interactive REST API docs at `/api/docs` |
| **Security & Validation** | Helmet + `class-validator` + `class-transformer` | `8.1.0` / `0.15.1` / `0.5.1` | Security HTTP headers and strict DTO validation |
| **Database & ORM** | PostgreSQL + Prisma ORM (`@prisma/adapter-pg`) | PG `16` / Prisma `7.10.1` | Relational database & type-safe query client |
| **Code Quality** | ESLint + Prettier | `10.14.0` / `3.9.10` | TypeScript-aware linting and consistent code formatting |
| **Automated Testing** | Jest + Supertest (Backend) / Vitest + Testing Library (Frontend) | Jest `30.5.2` / Vitest `5.1.0` | Unit, component, and API integration testing |

---

## 4. Architecture Overview

The application uses a **Modular Monolithic Architecture** (no microservices in Phase 1) with clear separation of responsibilities:

1. **Presentation Layer (`frontend/`)**:
   - Application shell (`AppShell`, `Header`, `Footer`), reusable UI primitives (`Card`, `Badge`, `StatusIndicator`), centralized environment configuration (`src/config/env.ts`), typed HTTP client (`src/services/apiClient.ts`), custom React hooks (`useSystemHealth`, `useTheme`), and the Phase 1 Landing Page (`src/pages/LandingPage.tsx`).
2. **API & Infrastructure Layer (`backend/`)**:
   - NestJS modular monolith with startup environment validation (`src/config/env.validation.ts`), Helmet security headers, restricted CORS, URI versioning readiness, global `ValidationPipe`, structured HTTP logging (`LoggingInterceptor`), centralized error handling (`AllExceptionsFilter`), Prisma 7 database infrastructure (`PrismaModule`/`PrismaService`), and health/readiness endpoints (`HealthModule`).
3. **Data Layer (`backend/prisma/` & PostgreSQL)**:
   - PostgreSQL 16 configured via Prisma 7 (`prisma.config.ts` and `prisma/schema.prisma`) with live readiness verification (`SELECT 1`).
4. **Future Domain & Multi-Agent Boundaries**:
   - Logical boundaries are prepared for Financial Records, Transactions, Invoices & Payables, Budgets, Cash-Flow Forecasting, Financial Analytics, Risk Monitoring, Scenario Planning, FinMemory, Reporting & Audit, and the bounded AI Orchestrator + 8 Specialized Agents (including the Verifier AI Agent). Future agents will access scoped data strictly through permission-checked backend tools.

See [`docs/architecture.md`](./docs/architecture.md) for the complete architectural specification.

---

## 5. Folder Structure

```text
ai-powered-sme-financial-intelligence/
├── frontend/
│   ├── public/
│   │   └── favicon.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── Header.tsx
│   │   │   └── ui/
│   │   │       ├── Badge.tsx
│   │   │       ├── Card.tsx
│   │   │       └── StatusIndicator.tsx
│   │   ├── config/
│   │   │   └── env.ts
│   │   ├── hooks/
│   │   │   ├── useSystemHealth.ts
│   │   │   └── useTheme.ts
│   │   ├── pages/
│   │   │   └── LandingPage.tsx
│   │   ├── services/
│   │   │   ├── apiClient.ts
│   │   │   └── healthService.ts
│   │   ├── test/
│   │   │   └── setup.ts
│   │   ├── types/
│   │   │   ├── api.types.ts
│   │   │   └── health.types.ts
│   │   ├── utils/
│   │   │   └── formatters.ts
│   │   ├── App.test.tsx
│   │   ├── App.tsx
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── .env.example
│   ├── .prettierignore
│   ├── .prettierrc
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── backend/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── common/
│   │   │   ├── dto/
│   │   │   │   ├── api-error-response.dto.ts
│   │   │   │   └── pagination-query.dto.ts
│   │   │   ├── filters/
│   │   │   │   └── all-exceptions.filter.ts
│   │   │   └── interceptors/
│   │   │       └── logging.interceptor.ts
│   │   ├── config/
│   │   │   ├── env.validation.spec.ts
│   │   │   └── env.validation.ts
│   │   ├── database/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── health/
│   │   │   ├── dto/
│   │   │   │   └── health-response.dto.ts
│   │   │   ├── health.controller.spec.ts
│   │   │   ├── health.controller.ts
│   │   │   ├── health.module.ts
│   │   │   └── health.service.ts
│   │   ├── app.module.ts
│   │   ├── app.setup.ts
│   │   └── main.ts
│   ├── test/
│   │   └── health.e2e-spec.ts
│   ├── .env.example
│   ├── .prettierignore
│   ├── .prettierrc
│   ├── eslint.config.js
│   ├── jest.config.js
│   ├── jest.e2e.config.js
│   ├── nest-cli.json
│   ├── package.json
│   ├── prisma.config.ts
│   ├── tsconfig.build.json
│   ├── tsconfig.json
│   └── tsconfig.test.json
├── docs/
│   ├── architecture.md
│   ├── development-notes.md
│   └── setup-guide.md
├── .editorconfig
├── .gitignore
├── .prettierrc
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 6. Frontend Setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The Vite development server starts on **`http://localhost:5173`** and proxies `/api` requests to the configured backend server (`http://localhost:3000`).

---

## 7. Backend Setup

```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npm run start:dev
```

The NestJS REST API starts on **`http://localhost:3000`**.
- Health liveness endpoint: `http://localhost:3000/api/health`
- Database readiness endpoint: `http://localhost:3000/api/health/ready`
- Swagger / OpenAPI documentation (development): `http://localhost:3000/api/docs`

---

## 8. PostgreSQL Setup

### Option A: Docker Compose (Recommended)
From the repository root:
```bash
docker compose up -d
```
This starts a PostgreSQL 16 container on port `5432` with database `sme_financial_intelligence_dev`.

### Option B: Existing Local PostgreSQL Instance
Create the development database manually:
```sql
CREATE DATABASE sme_financial_intelligence_dev;
```
Then update `DATABASE_URL` in `backend/.env` with your PostgreSQL credentials.

---

## 9. Prisma Configuration

Prisma 7 is configured using:
- `backend/prisma.config.ts`: Reads `DATABASE_URL` from environment variables via `dotenv/config` and `defineConfig` (`prisma/config`).
- `backend/prisma/schema.prisma`: Configures the `prisma-client` generator (`output = "../src/generated/prisma"`, `moduleFormat = "esm"`) and the `postgresql` datasource provider.
- `backend/src/database/prisma.service.ts`: Connects to PostgreSQL using `@prisma/adapter-pg` (`PrismaPg`).

Useful Prisma commands (run inside `backend/`):
```bash
npm run prisma:generate   # Generate Prisma Client into src/generated/prisma
npm run prisma:migrate    # Run interactive schema migrations (when models are added in Phase 2+)
npm run prisma:deploy     # Apply committed migrations in CI/production
npm run prisma:studio     # Open Prisma Studio GUI
```

---

## 10. Environment Variables

Never commit real `.env` files or credentials.

### Frontend (`frontend/.env.example`)
| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | Base URL for backend REST API requests |

### Backend (`backend/.env.example`)
| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port for the NestJS API server |
| `NODE_ENV` | `development` | Runtime mode (`development`, `test`, or `production`) |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed frontend origin(s) for restricted CORS |
| `DATABASE_URL` | `postgresql://postgres:postgrespassword@localhost:5432/sme_financial_intelligence_dev?schema=public` | PostgreSQL connection URL (never exposed to frontend) |

---

## 11. Development Commands

From the repository root:
```bash
npm run dev:backend       # Start NestJS backend in watch mode (port 3000)
npm run dev:frontend      # Start Vite frontend dev server (port 5173)
npm run lint              # Run ESLint across both backend and frontend
npm run format            # Format backend and frontend code with Prettier
npm run format:check      # Check code formatting without modifying files
```

---

## 12. Testing Commands

From the repository root:
```bash
npm test                  # Run backend unit tests and frontend Vitest tests
npm run test:backend      # Run backend Jest unit tests
npm run test:backend:e2e  # Run backend Supertest E2E integration tests
npm run test:frontend     # Run frontend Vitest component & API communication tests
```

---

## 13. Build Commands

From the repository root:
```bash
npm run build             # Build both backend (nest build) and frontend (tsc -b && vite build)
npm run build:backend     # Compile NestJS backend to backend/dist/
npm run build:frontend    # Typecheck and bundle React frontend to frontend/dist/
```

---

## 14. Health-Check Endpoints

### 1. Application Liveness (`GET /api/health`)
Operates independently of database availability.

**Response (`200 OK`)**:
```json
{
  "status": "ok",
  "service": "SME Financial Intelligence API",
  "timestamp": "2026-11-09T11:30:00.000Z"
}
```

### 2. Database Readiness (`GET /api/health/ready`)
Executes a live `SELECT 1` query against PostgreSQL via Prisma ORM.

**Response when PostgreSQL is connected (`200 OK`)**:
```json
{
  "status": "ready",
  "service": "SME Financial Intelligence API",
  "database": {
    "status": "connected",
    "latencyMs": 3
  },
  "timestamp": "2026-11-09T11:30:00.000Z"
}
```

**Response when PostgreSQL is unreachable (`503 Service Unavailable`)**:
```json
{
  "statusCode": 503,
  "error": "SERVICE_UNAVAILABLE",
  "message": "Database connection is not ready",
  "database": {
    "status": "disconnected"
  },
  "path": "/api/health/ready",
  "timestamp": "2026-11-09T11:30:00.000Z"
}
```

---

## 15. Troubleshooting

- **`Environment configuration validation failed: DATABASE_URL is required`**:
  Ensure `backend/.env` exists (`cp backend/.env.example backend/.env`) and contains a valid `postgresql://` connection string.
- **`GET /api/health/ready` returns `503 Service Unavailable`**:
  Verify that PostgreSQL is running on port `5432` (`docker compose up -d`) and that the `sme_financial_intelligence_dev` database exists.
- **CORS errors in browser**:
  Ensure `FRONTEND_URL` in `backend/.env` matches the exact origin of the Vite dev server (`http://localhost:5173`).
- **Missing Prisma Client types (`Cannot find module '../generated/prisma/client.js'`)**:
  Run `npm run prisma:generate` inside `backend/`.

---

## 16. Current Phase 1 Limitations

By strict design and scope control, Phase 1 **does not** implement:
- Functional financial dashboards, charts, or KPI scorecards.
- Financial database models (Transactions, Invoices, Payables, Budgets, Forecasts, FinMemory snapshots).
- Deterministic financial calculation engines or CSV import pipelines.
- Authentication, session management, or Role-Based Access Control (RBAC) enforcement.
- The Central Supervisor / AI Orchestrator, Specialized AI Agents, or Verifier AI Agent.
- External accounting, banking, or payment integrations.

---

## 17. Future Development Phases

Following the Capstone Project Blueprint roadmap:
- **Phase 2**: Core PostgreSQL financial schema (`@db.Decimal(19, 4)`), migrations, and seed/demo labeling infrastructure.
- **Phase 3**: Authentication, organization workspaces, and backend-enforced RBAC (`Platform Administrator`, `Business Owner`, `Finance Manager`, `Accountant`, `Operations Manager`, `Financial Analyst`, `Auditor`).
- **Phase 4**: Financial record management (CSV import with validation & duplicate detection, transactions, invoices, bills, and budgets).
- **Phase 5**: Deterministic financial analytics (liquidity ratios, working capital, receivables/payables aging, budget variance, and Recharts visualizations).
- **Phase 6**: First grounded AI capability (Anomaly explanations & read-only AI Finance Assistant).
- **Phase 7**: Cash-Flow Forecasting Engine (`7/30/60/90` days) & **FinMemory** historical intelligence snapshots.
- **Phase 8**: Multi-Agent Orchestration (Supervisor, 7 Specialist Agents, and Verifier AI Agent with narrow permission-checked tools).
- **Phase 9**: Scenario Planning, Decision Support, Reporting, and Human Review/Approval Queue.
- **Phase 10**: Comprehensive QA, security verification, and capstone demonstration.
