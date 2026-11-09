import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import {
  ReviewActionType,
  RiskAlertStatus,
  RiskAlertType,
  RiskSeverity,
} from '../../../generated/prisma/client.js';

export class TriageRiskAlertDto {
  @ApiProperty({
    enum: [
      ReviewActionType.ACKNOWLEDGE,
      ReviewActionType.DISMISS,
      ReviewActionType.INVESTIGATE,
      ReviewActionType.ESCALATE,
    ],
    example: ReviewActionType.INVESTIGATE,
  })
  @IsIn([
    ReviewActionType.ACKNOWLEDGE,
    ReviewActionType.DISMISS,
    ReviewActionType.INVESTIGATE,
    ReviewActionType.ESCALATE,
  ])
  action!:
    | typeof ReviewActionType.ACKNOWLEDGE
    | typeof ReviewActionType.DISMISS
    | typeof ReviewActionType.INVESTIGATE
    | typeof ReviewActionType.ESCALATE;

  @ApiProperty({
    example: 'Verified with operations team; checking supplier contract addendum.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reviewerNotes!: string;
}

export class RiskAlertQueryDto {
  @ApiPropertyOptional({ enum: RiskAlertStatus })
  @IsOptional()
  @IsEnum(RiskAlertStatus)
  status?: RiskAlertStatus;

  @ApiPropertyOptional({ enum: RiskSeverity })
  @IsOptional()
  @IsEnum(RiskSeverity)
  severity?: RiskSeverity;

  @ApiPropertyOptional({ enum: RiskAlertType })
  @IsOptional()
  @IsEnum(RiskAlertType)
  type?: RiskAlertType;
}
