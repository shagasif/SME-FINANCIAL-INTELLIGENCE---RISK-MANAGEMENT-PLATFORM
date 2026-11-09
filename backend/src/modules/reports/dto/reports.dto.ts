import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ReportType, RiskSeverity, TaskStatus } from '../../../generated/prisma/client.js';

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType, example: ReportType.BUSINESS_HEALTH })
  @IsEnum(ReportType)
  type!: ReportType;

  @ApiPropertyOptional({ example: 'October 2026 Executive Business Health Report' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({ example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}

export class ExportReportQueryDto {
  @ApiProperty({ enum: ['CSV', 'PDF'], example: 'CSV' })
  @IsIn(['CSV', 'PDF'])
  format!: 'CSV' | 'PDF';
}

export class CreateFollowUpTaskDto {
  @ApiProperty({ example: 'Follow up with NorthStar Logistics on overdue Invoice INV-2026-1042' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Call accounts payable contact to confirm settlement date.' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description!: string;

  @ApiPropertyOptional({ enum: RiskSeverity, default: RiskSeverity.HIGH })
  @IsOptional()
  @IsEnum(RiskSeverity)
  priority?: RiskSeverity = RiskSeverity.HIGH;

  @ApiPropertyOptional({ example: '2026-11-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @ApiPropertyOptional({ example: 'INVOICE' })
  @IsOptional()
  @IsString()
  relatedType?: string;
}

export class UpdateFollowUpTaskStatusDto {
  @ApiProperty({ enum: TaskStatus, example: TaskStatus.COMPLETED })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
