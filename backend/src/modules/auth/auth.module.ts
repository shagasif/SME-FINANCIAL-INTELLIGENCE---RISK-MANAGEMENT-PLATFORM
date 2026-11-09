import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { OrgRbacGuard } from '../../common/guards/org-rbac.guard.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, OrgRbacGuard, RateLimitGuard],
  exports: [AuthService, JwtAuthGuard, OrgRbacGuard, RateLimitGuard],
})
export class AuthModule {}
