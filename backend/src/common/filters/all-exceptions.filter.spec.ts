import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockStatus: ReturnType<typeof jest.fn>;
  let mockJson: ReturnType<typeof jest.fn>;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    const mockResponse = { status: mockStatus };
    const mockRequest = { method: 'POST', originalUrl: '/api/v1/auth/login' };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  it('maps standard HttpExceptions correctly', () => {
    const error = new HttpException('Invalid email or password', HttpStatus.UNAUTHORIZED);
    filter.catch(error, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'Invalid email or password',
        path: '/api/v1/auth/login',
      }),
    );
  });

  it('maps Prisma P1001 database connection error to 503 SERVICE_UNAVAILABLE', () => {
    const dbError = {
      code: 'P1001',
      message: "Can't reach database server at localhost:5432",
    };
    filter.catch(dbError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database service is temporarily unavailable. Please verify database connectivity.',
      }),
    );
  });

  it('maps ECONNREFUSED error to 503 SERVICE_UNAVAILABLE', () => {
    const dbError = new Error('connect ECONNREFUSED 127.0.0.1:5432');
    filter.catch(dbError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database service is temporarily unavailable. Please verify database connectivity.',
      }),
    );
  });

  it('maps unknown generic exceptions to 500 INTERNAL_SERVER_ERROR', () => {
    const unknownError = new Error('Random runtime bug');
    filter.catch(unknownError, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      }),
    );
  });
});
