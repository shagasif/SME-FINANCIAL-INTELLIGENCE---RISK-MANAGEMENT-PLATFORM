import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateFinMemorySnapshotDto {
  @ApiProperty({
    example: '2026-10',
    description: 'Period identifier such as YYYY-MM or YYYY-QN',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  periodKey!: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-10-31T23:59:59.000Z' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({
    example: 'Baseline October close after supplier contract renegotiation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
