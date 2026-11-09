import { Controller, Get, HttpCode, HttpStatus, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../common/dto/api-error-response.dto.js';
import { HealthResponseDto, ReadinessResponseDto } from './dto/health-response.dto.js';
import { HealthService } from './health.service.js';

@ApiTags('Health Monitoring')
@Controller({
  path: 'health',
  version: VERSION_NEUTRAL,
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Application liveness probe',
    description:
      'Returns the operational status of the SME Financial Intelligence API independently of database availability.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'API service is running',
    type: HealthResponseDto,
  })
  check(): HealthResponseDto {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Database readiness probe',
    description:
      'Verifies actual PostgreSQL connectivity through Prisma ORM. Returns HTTP 200 when connected or HTTP 503 when unreachable.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'PostgreSQL connection verified via Prisma',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'PostgreSQL database is unreachable',
    type: ApiErrorResponseDto,
  })
  async checkReadiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadiness();
  }
}
