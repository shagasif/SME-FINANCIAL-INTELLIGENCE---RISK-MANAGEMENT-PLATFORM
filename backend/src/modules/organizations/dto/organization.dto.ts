import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
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

  @ApiPropertyOptional({ example: 'Pakistan' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional({ example: 'PKR', default: 'PKR' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(3)
  baseCurrency?: string;

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

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Star Enterprises' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ example: 'PKR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, {
    message: 'baseCurrency must be a valid 3-letter ISO-4217 currency code',
  })
  baseCurrency?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @ApiPropertyOptional({ example: 'REG-2026-99812' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Retail & Wholesale' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  industry?: string;
}
