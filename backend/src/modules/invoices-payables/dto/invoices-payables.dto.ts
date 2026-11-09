import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaymentMethod } from '../../../generated/prisma/client.js';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'INV-2026-1042' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  invoiceNumber!: string;

  @ApiProperty({ example: 'NorthStar Logistics Corp' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  customerName!: string;

  @ApiPropertyOptional({ example: 'ap@northstarlogistics.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: 'Sales Revenue', default: 'Sales Revenue' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string = 'Sales Revenue';

  @ApiPropertyOptional({ example: 'Commercial Operations' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiProperty({ example: '2026-10-01T00:00:00.000Z' })
  @IsDateString()
  issueDate!: string;

  @ApiProperty({ example: '2026-10-31T00:00:00.000Z' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiProperty({ example: '18500.0000' })
  @IsNumberString()
  totalAmount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateBillDto {
  @ApiProperty({ example: 'BILL-2026-881' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  billNumber!: string;

  @ApiProperty({ example: 'Precision Steel Suppliers Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  supplierName!: string;

  @ApiPropertyOptional({ example: 'billing@precisionsteel.com' })
  @IsOptional()
  @IsEmail()
  supplierEmail?: string;

  @ApiPropertyOptional({ example: 'Raw Materials', default: 'Operating Expense' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string = 'Operating Expense';

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiProperty({ example: '2026-10-05T00:00:00.000Z' })
  @IsDateString()
  issueDate!: string;

  @ApiProperty({ example: '2026-11-05T00:00:00.000Z' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string = 'USD';

  @ApiProperty({ example: '9200.0000' })
  @IsNumberString()
  totalAmount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RecordPaymentDto {
  @ApiProperty({ example: '5000.0000' })
  @IsNumberString()
  amount!: string;

  @ApiProperty({ example: '2026-10-20T00:00:00.000Z' })
  @IsDateString()
  paymentDate!: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.BANK_TRANSFER })
  @IsOptional()
  @IsEnum(PaymentMethod)
  method?: PaymentMethod = PaymentMethod.BANK_TRANSFER;

  @ApiPropertyOptional({
    description: 'Optional FinancialAccount UUID to also record ledger cash flow',
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ example: 'WIRE-99412' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
