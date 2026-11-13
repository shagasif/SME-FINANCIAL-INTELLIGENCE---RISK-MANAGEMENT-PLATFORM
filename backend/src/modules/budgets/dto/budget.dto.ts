import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BudgetPeriodType } from '../../../generated/prisma/client.js';

export class BudgetLineInputDto {
  @ApiProperty({ example: 'Cloud & IT Infrastructure' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category!: string;

  @ApiPropertyOptional({ example: 'Engineering', default: 'General' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string = 'General';

  @ApiProperty({ example: '12000.0000' })
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'allocatedAmount must be a non-negative decimal with up to 4 decimal places',
  })
  allocatedAmount!: string;

  @ApiPropertyOptional({ example: '90.0000', default: '90.0000' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'alertThreshold must be a non-negative percentage with up to 4 decimal places',
  })
  alertThreshold?: string = '90.0000';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class CreateBudgetDto {
  @ApiProperty({ example: 'Q4 2026 Operating Budget' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: BudgetPeriodType, example: BudgetPeriodType.QUARTERLY })
  @IsEnum(BudgetPeriodType)
  periodType!: BudgetPeriodType;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-12-31T23:59:59.000Z' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ type: [BudgetLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineInputDto)
  lines!: BudgetLineInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReviseBudgetDto {
  @ApiProperty({ example: 'Increased cloud allocation for Q4 customer onboarding' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  changeSummary!: string;

  @ApiProperty({ type: [BudgetLineInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineInputDto)
  lines!: BudgetLineInputDto[];
}
