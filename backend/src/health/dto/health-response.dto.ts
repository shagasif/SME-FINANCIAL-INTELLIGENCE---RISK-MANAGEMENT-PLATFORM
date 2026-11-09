import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({ example: 'ok', enum: ['ok'] })
  status!: 'ok';

  @ApiProperty({ example: 'SME Financial Intelligence API' })
  service!: string;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  timestamp!: string;
}

export class DatabaseStatusDto {
  @ApiProperty({ example: 'connected', enum: ['connected', 'disconnected'] })
  status!: 'connected' | 'disconnected';

  @ApiPropertyOptional({ example: 3 })
  latencyMs?: number;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ready', enum: ['ready', 'not_ready'] })
  status!: 'ready' | 'not_ready';

  @ApiProperty({ example: 'SME Financial Intelligence API' })
  service!: string;

  @ApiProperty({ type: () => DatabaseStatusDto })
  database!: DatabaseStatusDto;

  @ApiProperty({ example: '2026-11-09T12:00:00.000Z' })
  timestamp!: string;
}
