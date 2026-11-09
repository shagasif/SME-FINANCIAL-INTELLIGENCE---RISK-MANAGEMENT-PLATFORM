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
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });
  }

  // 3. Global API prefix and URI versioning readiness for future business endpoints
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
        'REST API foundation for the SME Financial Intelligence & Risk Management Platform (Phase 1 Foundation).',
      )
      .setVersion('0.1.0')
      .addTag('Health Monitoring', 'Liveness and PostgreSQL database readiness probes')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }
}
