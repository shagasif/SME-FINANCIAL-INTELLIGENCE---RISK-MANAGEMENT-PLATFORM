import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({ example: 'owner@acmesme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass#2026!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Sarah Jenkins' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Acme Precision Manufacturing Ltd' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  organizationName?: string;

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
}

export class LoginDto {
  @ApiProperty({ example: 'owner@acmesme.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass#2026!' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class RequestPasswordResetDto {
  @ApiProperty({ example: 'owner@acmesme.com' })
  @IsEmail()
  email!: string;
}

export class ConfirmPasswordResetDto {
  @ApiProperty({ description: 'Password reset token' })
  @IsString()
  @MinLength(16)
  token!: string;

  @ApiProperty({ example: 'NewStrongPass#2026!', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
