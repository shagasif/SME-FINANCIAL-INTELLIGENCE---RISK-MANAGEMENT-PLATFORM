import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AgentType } from '../../../generated/prisma/client.js';

export class ExecuteAiWorkflowDto {
  @ApiProperty({
    example:
      'Analyze our current cash flow, liquidity runway, overdue receivables, anomalous expenses, and recommend actions for the next 30 days.',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  prompt!: string;

  @ApiPropertyOptional({
    enum: AgentType,
    isArray: true,
    description:
      'Optional explicit list of specialist agents to invoke; if omitted, Supervisor classifies task and selects agents automatically.',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(AgentType, { each: true })
  requestedAgents?: AgentType[];

  @ApiPropertyOptional({ enum: [7, 30, 60, 90], default: 30 })
  @IsOptional()
  @IsInt()
  @IsIn([7, 30, 60, 90])
  horizonDays?: 7 | 30 | 60 | 90 = 30;
}

export class InvokeMcpToolRequestDto {
  @ApiProperty({ example: 'mcp.finance.get_deterministic_metrics' })
  @IsString()
  toolName!: string;

  @ApiProperty({ enum: AgentType, example: AgentType.FINANCE_DATA_ANALYST })
  @IsEnum(AgentType)
  agentType!: AgentType;

  @ApiPropertyOptional({
    description: 'Tool input payload',
    example: {},
  })
  @IsOptional()
  input?: Record<string, unknown>;
}

export class ExecuteAgentSkillRequestDto {
  @ApiProperty({ example: 'skill.financial-data-analysis' })
  @IsString()
  skillId!: string;

  @ApiProperty({ enum: AgentType, example: AgentType.FINANCE_DATA_ANALYST })
  @IsEnum(AgentType)
  agentType!: AgentType;

  @ApiPropertyOptional({
    example: 'Evaluate liquidity ratios and working capital completeness.',
  })
  @IsOptional()
  @IsString()
  prompt?: string;
}
