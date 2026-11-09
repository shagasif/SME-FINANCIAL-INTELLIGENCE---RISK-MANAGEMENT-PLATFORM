import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AccountType,
  RecurrenceFrequency,
  TransactionType,
} from '../../../generated/prisma/client.js';

export class CreateFinancialAccountDto {
  @ApiProperty({ example: '1010' })
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  code!: string;

  @ApiProperty({ example: 'Primary Operating Checking' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: AccountType, example: AccountType.BANK })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiPropertyOptional({ example: '125000.0000', default: '0.0000' })
  @IsOptional()
  @IsNumberString()
  openingBalance?: string = '0.0000';

  @ApiPropertyOptional({ example: 'First Commercial Bank' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  institution?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isLiquid?: boolean = true;
}

export class CreateTransactionDto {
  @ApiProperty({ description: 'Financial Account UUID' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ enum: TransactionType, example: TransactionType.EXPENSE })
  @IsEnum(TransactionType)
  type!: TransactionType;

  @ApiProperty({
    example: '4250.5000',
    description: 'Positive decimal string (NUMERIC(19,4))',
  })
  @IsNumberString()
  amount!: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiProperty({ example: '2026-10-15T00:00:00.000Z' })
  @IsDateString()
  transactionDate!: string;

  @ApiProperty({ example: 'Monthly AWS Cloud Infrastructure' })
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  description!: string;

  @ApiProperty({ example: 'Cloud & IT Infrastructure' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  category!: string;

  @ApiPropertyOptional({ example: 'Hosting' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ example: 'Amazon Web Services' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  counterparty?: string;

  @ApiPropertyOptional({ example: 'INV-AWS-2026-10' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean = false;

  @ApiPropertyOptional({ enum: RecurrenceFrequency, default: RecurrenceFrequency.NONE })
  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  recurrenceFrequency?: RecurrenceFrequency = RecurrenceFrequency.NONE;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCostOfGoodsSold?: boolean = false;
}

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional({ example: '4500.0000' })
  @IsOptional()
  @IsNumberString()
  amount?: string;

  @ApiPropertyOptional({ example: '2026-10-16T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @ApiPropertyOptional({ example: 'Updated Cloud Infrastructure' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional({ example: 'Cloud & IT Infrastructure' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  counterparty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({ enum: RecurrenceFrequency })
  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  recurrenceFrequency?: RecurrenceFrequency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCostOfGoodsSold?: boolean;
}

export class TransactionFilterQueryDto {
  @ApiPropertyOptional({ enum: TransactionType })
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeArchived?: boolean = false;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 25 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 25;
}
