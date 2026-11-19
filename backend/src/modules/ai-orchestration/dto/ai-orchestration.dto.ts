import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AgentType } from '../../../generated/prisma/client.js';

export class ChatMessageHistoryDto {
  @ApiProperty({
    example: 'USER',
    description: 'Role or identifier of message sender (e.g., USER or ASSISTANT)',
  })
  @IsString()
  @IsNotEmpty()
  sender!: string;

  @ApiProperty({
    example: 'What is our current cash runway?',
    description: 'Text content of the conversational turn',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}

export class ExecuteAiWorkflowDto {
  @ApiPropertyOptional({
    example:
      'Analyze our current cash flow, liquidity runway, overdue receivables, anomalous expenses, and recommend actions for the next 30 days.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt?: string;

  @ApiPropertyOptional({
    example: 'What is our current cash runway?',
    description: 'Alternative query property alias for prompt',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query?: string;

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

  @ApiPropertyOptional({
    description: 'Recent conversation history for conversational context awareness',
    type: () => [ChatMessageHistoryDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageHistoryDto)
  history?: ChatMessageHistoryDto[];
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
