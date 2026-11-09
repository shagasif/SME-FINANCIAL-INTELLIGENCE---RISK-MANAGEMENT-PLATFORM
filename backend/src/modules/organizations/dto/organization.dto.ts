import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MembershipStatus, RoleType } from '../../../generated/prisma/client.js';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Apex Industrial Components Ltd' })
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: 'REG-2026-99812' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  baseCurrency?: string = 'USD';

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number = 1;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isSyntheticDemo?: boolean = false;
}

export class AddMemberDto {
  @ApiProperty({ example: 'analyst@acmesme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: RoleType, example: RoleType.FINANCIAL_ANALYST })
  @IsEnum(RoleType)
  role!: RoleType;

  @ApiPropertyOptional({ example: 'Finance & Strategy' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: RoleType })
  @IsEnum(RoleType)
  role!: RoleType;

  @ApiPropertyOptional({ enum: MembershipStatus })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
