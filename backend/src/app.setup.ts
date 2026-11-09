import { INestApplication, ValidationPipe, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

export interface AppSetupOptions {
  frontendUrl?: string;
  enableSwagger?: boolean;
}

/**
 * Shared NestJS Bootstrap Configuration
 *
 * Applies security headers (Helmet), restricted CORS, URI versioning readiness,
 * global DTO validation, structured request logging, centralized exception
 * handling, and OpenAPI/Swagger documentation.
 */
export function configureApp(app: INestApplication, options: AppSetupOptions = {}): void {
  // 1. Security HTTP headers via Helmet
  app.use(helmet());

  // 2. Restricted CORS configuration
  if (options.frontendUrl) {
    const allowedOrigins = options.frontendUrl
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);

    app.enableCors({
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Organization-Id'],
      credentials: true,
    });
  }

  // 3. Global API prefix and URI versioning readiness for business endpoints
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: VERSION_NEUTRAL,
  });

  // 4. Global DTO request validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // 5. Global structured logging and centralized exception filter
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // 6. OpenAPI / Swagger documentation (enabled in non-production environments)
  if (options.enableSwagger) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('AI-Powered SME Financial Intelligence & Risk Management API')
      .setDescription(
        'Complete REST API for the SME Financial Intelligence & Risk Management Platform (Auth, 7-Role RBAC, Transactions, CSV Import, Invoices/Bills, Budgets, Deterministic Analytics, 7/30/60/90-Day Forecasting, FinMemory, Anomaly/Risk Detection, Scenario Planning, Multi-Agent Orchestrator, MCP, Agent Skills, AI Model Provider, Sandbox, Hooks, Reports & Audit).',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('Health Monitoring', 'Liveness and PostgreSQL database readiness probes')
      .addTag(
        'Authentication & Sessions',
        'User registration, login, session revocation, and password recovery',
      )
      .addTag(
        'Organizations & RBAC Workspaces',
        'Multi-tenant organization workspaces and 7-role memberships',
      )
      .addTag(
        'Financial Accounts & Transactions',
        'Chart of accounts and decimal-safe income/expense ledger',
      )
      .addTag(
        'CSV Financial Import Pipeline',
        'Column mapping, preview, duplicate detection, sanitization, and commit',
      )
      .addTag(
        'Invoices, Supplier Bills & Aging',
        'Receivables, payables, partial payments, and aging buckets',
      )
      .addTag(
        'Budgets, Variance & Revisions',
        'Monthly/quarterly budgets, variance calculation, and revision history',
      )
      .addTag(
        'Financial Intelligence & Deterministic Metrics',
        '10 decimal-safe financial metrics with formulas and citations',
      )
      .addTag(
        'Cash-Flow Forecasting Engine (7/30/60/90 Days)',
        'Base, optimistic, and conservative projections with actual comparison',
      )
      .addTag(
        'FinMemory Historical Financial Intelligence',
        'Monthly snapshots, completeness scores, and period comparisons',
      )
      .addTag(
        'Anomaly Detection & Financial Risk Alerts',
        '8 risk detectors with non-fraud policy and human triage',
      )
      .addTag('What-If Scenario Planning', 'Non-destructive scenario sensitivity simulations')
      .addTag(
        'Multi-Agent Orchestrator, MCP, Agent Skills & AI Model Provider',
        '8 Specialist Agents, Supervisor, Verifier, MCP, Skills, Sandbox & Hooks',
      )
      .addTag(
        'Reports, Exports, Notifications, Tasks & Review History',
        'Executive reports, RBAC-protected CSV/PDF exports, notifications, and tasks',
      )
      .addTag('Audit Trail', 'Immutable organization and security audit events')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
