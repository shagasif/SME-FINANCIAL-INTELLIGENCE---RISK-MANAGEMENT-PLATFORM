import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CsvColumnMappingDto {
  @ApiProperty({ example: 'date' })
  @IsString()
  dateColumn!: string;

  @ApiProperty({ example: 'amount' })
  @IsString()
  amountColumn!: string;

  @ApiProperty({ example: 'description' })
  @IsString()
  descriptionColumn!: string;

  @ApiPropertyOptional({ example: 'type' })
  @IsOptional()
  @IsString()
  typeColumn?: string;

  @ApiPropertyOptional({ example: 'category' })
  @IsOptional()
  @IsString()
  categoryColumn?: string;

  @ApiPropertyOptional({ example: 'counterparty' })
  @IsOptional()
  @IsString()
  counterpartyColumn?: string;

  @ApiPropertyOptional({ example: 'department' })
  @IsOptional()
  @IsString()
  departmentColumn?: string;

  @ApiPropertyOptional({ example: 'reference' })
  @IsOptional()
  @IsString()
  referenceColumn?: string;
}

export class UploadCsvPreviewDto {
  @ApiProperty({ description: 'Target Financial Account UUID' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: 'october_2026_bank_statement.csv' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({
    description: 'UTF-8 CSV file content with header row',
    example:
      'date,type,amount,description,category,counterparty\n2026-10-05,INCOME,15000.00,Enterprise SaaS License,Sales Revenue,GlobalCorp\n2026-10-06,EXPENSE,2400.50,Cloud Hosting,Cloud & IT,AWS',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(2_000_000)
  csvContent!: string;

  @ApiProperty({ type: CsvColumnMappingDto })
  @ValidateNested()
  @Type(() => CsvColumnMappingDto)
  columnMapping!: CsvColumnMappingDto;
}

export class ConfirmCsvImportDto {
  @ApiPropertyOptional({
    default: true,
    description: 'When true, detected duplicate rows are skipped during commit',
  })
  @IsOptional()
  @IsBoolean()
  skipDuplicates?: boolean = true;
}
