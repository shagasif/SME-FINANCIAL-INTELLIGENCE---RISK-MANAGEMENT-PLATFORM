import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsIn, IsInt, IsNumberString, IsOptional } from 'class-validator';
import { ForecastScenarioType } from '../../../generated/prisma/client.js';

export class GenerateForecastDto {
  @ApiProperty({ enum: [7, 30, 60, 90], example: 30 })
  @IsInt()
  @IsIn([7, 30, 60, 90])
  horizonDays!: 7 | 30 | 60 | 90;

  @ApiPropertyOptional({
    enum: ForecastScenarioType,
    default: ForecastScenarioType.BASE,
  })
  @IsOptional()
  @IsEnum(ForecastScenarioType)
  scenarioType?: ForecastScenarioType = ForecastScenarioType.BASE;

  @ApiPropertyOptional({
    example: '2026-10-01T00:00:00.000Z',
    description: 'Optional projection start date (defaults to current date)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '5000.0000',
    description: 'Minimum liquidity safety buffer below which a liquidity warning is raised',
  })
  @IsOptional()
  @IsNumberString()
  liquiditySafetyBuffer?: string = '5000.0000';
}
