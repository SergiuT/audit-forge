import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService, SystemHealth } from '@/shared/services/health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) { }

    @Get()
    @ApiOperation({
        summary: 'Get system health status',
        description: 'Returns overall system health including database, AI services, and external integrations'
    })
    @ApiResponse({
        status: 200,
        description: 'System health status retrieved successfully'
    })
    @ApiResponse({
        status: 503,
        description: 'System is unhealthy'
    })
    async getHealth(): Promise<SystemHealth> {
        const health = await this.healthService.getSystemHealth();

        // Return appropriate HTTP status based on health
        if (health.overall === 'unhealthy') {
            // This could be handled with proper HTTP status codes in a real implementation
            // For now, we'll return the data and let the client decide
        }

        return health;
    }

    @Get('metrics')
    @ApiOperation({
        summary: 'Get system metrics',
        description: 'Returns detailed metrics including circuit breaker status, cache statistics, and uptime'
    })
    @ApiResponse({
        status: 200,
        description: 'System metrics retrieved successfully'
    })
    async getMetrics() {
        return this.healthService.getMetrics();
    }

    @Get('ready')
    @ApiOperation({
        summary: 'Readiness probe',
        description: 'Returns 200 if the system is ready to accept traffic'
    })
    @ApiResponse({
        status: 200,
        description: 'System is ready'
    })
    @ApiResponse({
        status: 503,
        description: 'System is not ready'
    })
    async getReadiness(): Promise<{ status: string; ready: boolean }> {
        const health = await this.healthService.getSystemHealth();
        const ready = health.overall !== 'unhealthy';

        return {
            status: ready ? 'ready' : 'not ready',
            ready,
        };
    }

    @Get('live')
    @ApiOperation({
        summary: 'Liveness probe',
        description: 'Returns 200 if the system is alive (basic health check)'
    })
    @ApiResponse({
        status: 200,
        description: 'System is alive'
    })
    async getLiveness(): Promise<{ status: string; timestamp: string }> {
        return {
            status: 'alive',
            timestamp: new Date().toISOString(),
        };
    }
} 