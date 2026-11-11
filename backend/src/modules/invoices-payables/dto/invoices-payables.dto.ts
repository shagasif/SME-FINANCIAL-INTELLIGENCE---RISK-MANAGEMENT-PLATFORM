import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { BillStatus, InvoiceStatus, PaymentMethod } from '../../../generated/prisma/client.js';

export class LineItemDto {
  @ApiProperty({ example: 'Financial Advisory Retainer' })
  @IsString()
  @MinLength(1)
  @MaxLength(250)
  description!: string;

  @ApiProperty({ example: '2.0000' })
  @IsNumberString()
  quantity!: string;

  @ApiProperty({ example: '5000.0000' })
  @IsNumberString()
  unitPrice!: string;

  @ApiPropertyOptional({ example: '15.0000', description: 'Optional line tax percentage (0-100)' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;
}

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

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    enum: [InvoiceStatus.DRAFT, InvoiceStatus.ISSUED],
    default: InvoiceStatus.ISSUED,
  })
  @IsOptional()
  @IsIn([InvoiceStatus.DRAFT, InvoiceStatus.ISSUED])
  status?: 'DRAFT' | 'ISSUED';

  @ApiPropertyOptional({ example: '18500.0000', description: 'Required when lineItems are omitted' })
  @IsOptional()
  @IsNumberString()
  totalAmount?: string;

  @ApiPropertyOptional({ example: '15.0000', description: 'Optional header tax rate percentage (0-100)' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ example: 'INV-2026-1042' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'NorthStar Logistics Corp' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  customerName?: string;

  @ApiPropertyOptional({ example: 'ap@northstarlogistics.com' })
  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @ApiPropertyOptional({ example: 'Sales Revenue' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'Commercial Operations' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2026-11-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: [InvoiceStatus.ISSUED] })
  @IsOptional()
  @IsIn([InvoiceStatus.ISSUED])
  status?: 'ISSUED';

  @ApiPropertyOptional({ example: '18500.0000' })
  @IsOptional()
  @IsNumberString()
  totalAmount?: string;

  @ApiPropertyOptional({ example: '15.0000' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

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

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({
    enum: [BillStatus.DRAFT, BillStatus.OPEN],
    default: BillStatus.OPEN,
  })
  @IsOptional()
  @IsIn([BillStatus.DRAFT, BillStatus.OPEN])
  status?: 'DRAFT' | 'OPEN';

  @ApiPropertyOptional({ example: '9200.0000', description: 'Required when lineItems are omitted' })
  @IsOptional()
  @IsNumberString()
  totalAmount?: string;

  @ApiPropertyOptional({ example: '15.0000' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateBillDto {
  @ApiPropertyOptional({ example: 'BILL-2026-881' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  billNumber?: string;

  @ApiPropertyOptional({ example: 'Precision Steel Suppliers Ltd' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'billing@precisionsteel.com' })
  @IsOptional()
  @IsEmail()
  supplierEmail?: string;

  @ApiPropertyOptional({ example: 'Raw Materials' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({ example: '2026-10-05T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ example: '2026-11-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ enum: [BillStatus.OPEN] })
  @IsOptional()
  @IsIn([BillStatus.OPEN])
  status?: 'OPEN';

  @ApiPropertyOptional({ example: '9200.0000' })
  @IsOptional()
  @IsNumberString()
  totalAmount?: string;

  @ApiPropertyOptional({ example: '15.0000' })
  @IsOptional()
  @IsNumberString()
  taxRate?: string;

  @ApiPropertyOptional({ type: [LineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems?: LineItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class VoidDocumentDto {
  @ApiPropertyOptional({ example: 'Duplicate billing issued in error' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
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
