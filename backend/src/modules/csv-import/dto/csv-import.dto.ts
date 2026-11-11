import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AutoMapColumnsDto {
  @ApiProperty({ example: 'october_2026_bank_statement.csv' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @ApiProperty({ example: ['Date', 'Amount', 'Description', 'Type', 'Category'] })
  @IsArray()
  @IsString({ each: true })
  headers!: string[];

  @ApiPropertyOptional({
    description: 'Sample data rows from the uploaded file represented as string arrays or row objects',
    example: [
      ['2026-10-01', '1500.00', 'Client Retainer Payment', 'INCOME', 'Consulting'],
      ['2026-10-02', '240.50', 'AWS Cloud Infrastructure', 'EXPENSE', 'Software'],
    ],
  })
  @IsArray()
  sampleRows!: unknown[];
}

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
    description:
      'UTF-8 tabular content with header row in CSV format (parsed from CSV, XLSX, XLS, or JSON)',
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
