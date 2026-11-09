# Development Notes & Engineering Decisions

## AI-Powered SME Financial Intelligence & Risk Management Platform (Phase 1)

---

## 1. Installed Environment & Package Versions

Verified on Windows with:
- **Node.js**: `v24.20.0`
- **npm**: `12.2.0`
- **Git**: `2.55.0.windows.5`
- **PostgreSQL**: `16` (running in Docker on port `5432`, database `sme_financial_intelligence_dev`)

### Backend Key Packages (`backend/package.json`)
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/testing`: `12.4.1`
- `@nestjs/config`: `12.0.1`
- `@nestjs/swagger`: `12.1.1` (selected specifically for peer dependency compatibility with `@nestjs/common@^12.0.0` and `typescript@^6.0.0`)
- `prisma`, `@prisma/client`, `@prisma/adapter-pg`: `7.10.1`
- `pg`: `8.23.1`
- `helmet`: `8.1.0`
- `class-validator`: `0.15.1`
- `class-transformer`: `0.5.1`
- `typescript`: `6.0.3`
- `eslint`: `10.14.0` + `typescript-eslint`: `8.72.1`
- `prettier`: `3.9.10`
- `jest`: `30.5.2` + `ts-jest`: `29.4.15` + `supertest`: `7.3.1`

### Frontend Key Packages (`frontend/package.json`)
- `react`, `react-dom`: `19.3.1`
- `vite`: `8.3.7` + `@vitejs/plugin-react`: `6.1.2`
- `tailwindcss`, `@tailwindcss/vite`: `4.3.3`
- `recharts`: `3.10.1` (installed and verified for React 19 compatibility; reserved for Phase 5+ analytics)
- `typescript`: `6.0.3`
- `eslint`: `10.14.0` + `typescript-eslint`: `8.72.1`
- `prettier`: `3.9.10`
- `vitest`: `5.1.0` + `@testing-library/react`: `16.3.3` + `@testing-library/jest-dom`: `7.0.1` + `jsdom`: `30.1.3`

---

## 2. Key Technical Decisions

### 2.1 Prisma 7 Configuration (`prisma.config.ts` & Driver Adapter)
Prisma 7 removes datasource `url = env("DATABASE_URL")` from `schema.prisma` in favor of `prisma.config.ts` (`defineConfig` from `prisma/config`) for CLI operations and driver adapters (`@prisma/adapter-pg`) for runtime `PrismaClient` instantiation.
- `backend/prisma.config.ts` loads `DATABASE_URL` via `dotenv/config`.
- `backend/src/database/prisma.service.ts` instantiates `PrismaPg` using the validated `DATABASE_URL` from NestJS `ConfigService`.

### 2.2 Separation of Liveness (`/api/health`) and Readiness (`/api/health/ready`)
- `GET /api/health` is a pure process liveness probe returning `{ status: "ok", service: "SME Financial Intelligence API", timestamp: "..." }`. It never queries the database, ensuring container orchestrators and uptime checks can distinguish process crashes from database maintenance.
- `GET /api/health/ready` executes a live `SELECT 1` query through Prisma against PostgreSQL. It returns HTTP `200 OK` only when PostgreSQL responds and returns HTTP `503 Service Unavailable` when the database connection fails.

### 2.3 Cross-Platform ESM Jest Execution on Windows
To ensure backend unit and E2E tests run cleanly on Windows PowerShell, CMD, macOS, and Linux without relying on POSIX-only `NODE_OPTIONS=...` prefixes, `backend/package.json` invokes Jest directly via:
```json
"test": "node --experimental-vm-modules ./node_modules/jest/bin/jest.js"
```

### 2.4 Capstone Blueprint Visual System (Page 12)
The frontend design token system (`frontend/src/index.css`) implements the exact visual palette specified in Section 9.1 of the Capstone Blueprint:
- **Deep Forest Green** (`#16382C` / `#1E4D3B`)
- **Charcoal** (`#181D1B` / `#222926`)
- **Warm Ivory** (`#F6F3EC` / `#FAF8F3`)
- **Restrained Teal** (`#1F6E6C`) and **Amber** (`#B8732A`) status accents
Both Light Mode and Dark Mode are supported at the design-token level via `data-theme="light" | "dark"`.

---

## 3. Unresolved Setup Requirements & Phase 2 Prerequisites

- **Database Schema Migrations**: Because Phase 1 strictly prohibits creating financial models prematurely, `prisma/schema.prisma` contains only the generator and PostgreSQL datasource configuration. When financial models are added in Phase 2, run `npm run prisma:migrate` in `backend/` to generate the initial SQL migration.
- **Authentication & RBAC Secrets**: `JWT_SECRET` / session keys are intentionally omitted in Phase 1 and will be added to `backend/.env.example` and `env.validation.ts` in Phase 3 when authentication and RBAC are implemented.
