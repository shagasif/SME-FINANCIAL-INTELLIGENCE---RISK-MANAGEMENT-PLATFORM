import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  AuthenticatedPrincipal,
  CurrentUser,
  Public,
} from '../../common/decorators/auth.decorators.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RateLimit, RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { AuthService } from './auth.service.js';
import {
  ConfirmPasswordResetDto,
  LoginDto,
  RegisterUserDto,
  RequestPasswordResetDto,
} from './dto/auth.dto.js';

@ApiTags('Authentication & Sessions')
@UseGuards(RateLimitGuard)
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @RateLimit({ windowMs: 60_000, maxRequests: 20 })
  @ApiOperation({
    summary: 'Register a new user and optional initial SME organization workspace',
  })
  async register(@Body() dto: RegisterUserDto, @Req() req: Request) {
    return this.authService.register(dto, req.ip, req.headers['user-agent']);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, maxRequests: 25 })
  @ApiOperation({ summary: 'Authenticate user and issue session-backed JWT bearer token' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip, req.headers['user-agent']);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke current active session' })
  async logout(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.logout(user.sessionId, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get authenticated user profile and active organization memberships' })
  async getMe(@CurrentUser() user: AuthenticatedPrincipal) {
    return this.authService.getProfile(user.userId);
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, maxRequests: 10 })
  @ApiOperation({ summary: 'Request a time-limited password recovery token' })
  async requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ windowMs: 60_000, maxRequests: 10 })
  @ApiOperation({ summary: 'Confirm password reset and revoke existing sessions' })
  async confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.authService.confirmPasswordReset(dto);
  }
}
