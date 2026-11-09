import { ApiProperty } from '@nestjs/swagger';

/**
 * Standard API Error Envelope DTO for OpenAPI/Swagger documentation.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'BAD_REQUEST' })
  error!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Validation failed',
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/health' })
  path!: string;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  timestamp!: string;
}
