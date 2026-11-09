import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateScenarioSimulationDto {
  @ApiProperty({ description: 'Baseline CashFlowForecast UUID to compare against' })
  @IsUUID()
  baselineForecastId!: string;

  @ApiProperty({ example: '15-Day Customer Delay + 12% Cost Inflation Stress Test' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: 15,
    default: 0,
    description: 'Number of days customer invoice inflows are delayed (0 to 90)',
  })
  @IsOptional()
  @IsInt()
  @Min(-30)
  @Max(90)
  customerPaymentDelayDays?: number = 0;

  @ApiPropertyOptional({
    example: '-10.0000',
    default: '0.0000',
    description: 'Percentage change in sales/recurring inflows (-90% to +200%)',
  })
  @IsOptional()
  @IsNumberString()
  salesGrowthPct?: string = '0.0000';

  @ApiPropertyOptional({
    example: '12.0000',
    default: '0.0000',
    description: 'Percentage change in operating/recurring expenses (-90% to +200%)',
  })
  @IsOptional()
  @IsNumberString()
  operatingCostChangePct?: string = '0.0000';

  @ApiPropertyOptional({
    example: 7,
    default: 0,
    description:
      'Days shift in supplier bill payments (positive = deferred later, negative = paid earlier)',
  })
  @IsOptional()
  @IsInt()
  @Min(-30)
  @Max(90)
  supplierPaymentTimingDays?: number = 0;
}
