import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { EnvConfig } from './config/env.validation.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<EnvConfig, true>>(ConfigService);

  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const frontendUrl = config.get('FRONTEND_URL', { infer: true });
  const port = config.get('PORT', { infer: true });

  configureApp(app, {
    frontendUrl,
    enableSwagger: nodeEnv !== 'production',
  });

  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`SME Financial Intelligence API running at http://localhost:${port}/api/health`);
  if (nodeEnv !== 'production') {
    logger.log(`OpenAPI/Swagger documentation available at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
