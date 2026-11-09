import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Structured HTTP Request/Response Logging Interceptor
 *
 * Logs HTTP method, route path, status code, and latency in milliseconds.
 * Explicitly avoids logging request headers, query tokens, or request bodies
 * so sensitive financial or authentication data is never written to logs.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startTime = Date.now();

    const { method, path } = request;

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          this.logger.log(`${method} ${path} ${response.statusCode} - ${durationMs}ms`);
        },
      }),
    );
  }
}
