# Manual Installation & Setup Guide

## AI-Powered SME Financial Intelligence & Risk Management Platform (Phase 1)

This guide covers step-by-step manual installation, environment configuration, PostgreSQL setup, Prisma client generation, and end-to-end verification.

---

## 1. Prerequisites

Ensure the following tools are installed:
- **Node.js**: `v20.0.0+` (verified on `v24.20.0`)
- **npm**: `v10.0.0+` (verified on `12.2.0`)
- **Git**: `v2.40+` (verified on `2.55.0.windows.5`)
- **PostgreSQL**: `v15+` or `v16+` (via Docker Compose or local PostgreSQL installation)

---

## 2. Step-by-Step Environment Setup

### Step 1: Configure Backend Environment Variables
Copy `backend/.env.example` to `backend/.env`:
```bash
cd backend
cp .env.example .env
```

Verify the contents of `backend/.env`:
```env
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/sme_financial_intelligence_dev?schema=public
```

### Step 2: Configure Frontend Environment Variables
Copy `frontend/.env.example` to `frontend/.env`:
```bash
cd ../frontend
cp .env.example .env
```

Verify the contents of `frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## 3. PostgreSQL & Prisma Initialization

### Option A: Start PostgreSQL via Docker Compose
From the project root:
```bash
docker compose up -d
```

### Option B: Create the Database on an Existing Local PostgreSQL Instance
If PostgreSQL is already running on `localhost:5432`:
```bash
psql -U postgres -c "CREATE DATABASE sme_financial_intelligence_dev;"
```

### Generate the Prisma 7 Client
```bash
cd backend
npm install
npm run prisma:generate
```

*(Note: Phase 1 intentionally contains no financial domain tables. When domain models are introduced in Phase 2, run `npm run prisma:migrate` to create and apply SQL migrations).*

---

## 4. Installing Dependencies & Building

### Backend
```bash
cd backend
npm install
npm run lint
npm run build
npm test
npm run test:e2e
```

### Frontend
```bash
cd frontend
npm install
npm run lint
npm run build
npm test
```

---

## 5. Starting the Development Servers

### Terminal 1: Start the NestJS Backend
```bash
cd backend
npm run start:dev
```
- Liveness check: `http://localhost:3000/api/health`
- Database readiness check: `http://localhost:3000/api/health/ready`
- OpenAPI / Swagger UI: `http://localhost:3000/api/docs`

### Terminal 2: Start the React + Vite Frontend
```bash
cd frontend
npm run dev
```
- Web application: `http://localhost:5173`

Open `http://localhost:5173` in your browser to view the Phase 1 Landing Page and verify live API liveness and PostgreSQL readiness.
