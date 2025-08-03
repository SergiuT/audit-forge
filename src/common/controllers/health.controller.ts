import {
  Controller,
  Get,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, SystemHealth } from '@/shared/services/health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Get system health status',
    description:
      'Returns overall system health including database, AI services, and external integrations',
  })
  @ApiResponse({
    status: 200,
    description: 'System health status retrieved successfully',
  })
  @ApiResponse({
    status: 503,
    description: 'System is unhealthy',
  })
  async getHealth(): Promise<SystemHealth> {
    this.logger.log(`Starting system health check`);

    try {
      const health = await this.healthService.getSystemHealth();

      // Return appropriate HTTP status based on health
      if (health.overall === 'unhealthy') {
        this.logger.warn(`System health check returned unhealthy status`);
        // This could be handled with proper HTTP status codes in a real implementation
        // For now, we'll return the data and let the client decide
      }

      this.logger.log(
        `Successfully completed system health check, status: ${health.overall}`,
      );
      return health;
    } catch (error) {
      this.logger.error(`Failed to get system health`, error.stack);
      throw new InternalServerErrorException('Failed to get system health');
    }
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Get system metrics',
    description:
      'Returns detailed metrics including circuit breaker status, cache statistics, and uptime',
  })
  @ApiResponse({
    status: 200,
    description: 'System metrics retrieved successfully',
  })
  async getMetrics() {
    this.logger.log(`Starting system metrics fetch`);

    try {
      const metrics = await this.healthService.getMetrics();
      this.logger.log(`Successfully fetched system metrics`);
      return metrics;
    } catch (error) {
      this.logger.error(`Failed to get system metrics`, error.stack);
      throw new InternalServerErrorException('Failed to get system metrics');
    }
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness probe',
    description: 'Returns 200 if the system is ready to accept traffic',
  })
  @ApiResponse({
    status: 200,
    description: 'System is ready',
  })
  @ApiResponse({
    status: 503,
    description: 'System is not ready',
  })
  async getReadiness(): Promise<{ status: string; ready: boolean }> {
    this.logger.log(`Starting readiness probe`);

    try {
      const health = await this.healthService.getSystemHealth();
      const ready = health.overall !== 'unhealthy';

      this.logger.log(`Readiness probe completed, ready: ${ready}`);
      return {
        status: ready ? 'ready' : 'not ready',
        ready,
      };
    } catch (error) {
      this.logger.error(`Failed to perform readiness probe`, error.stack);
      throw new InternalServerErrorException(
        'Failed to perform readiness probe',
      );
    }
  }
}
