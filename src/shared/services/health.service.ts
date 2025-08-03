import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@/modules/auth/entities/user.entity';
import { OpenAIService } from './openai.service';
import { CacheService } from './cache.service';
import { CircuitBreakerService } from './circuit-breaker.service';

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime: number;
  error?: string;
  details?: any;
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  services: HealthCheckResult[];
  timestamp: string;
  uptime: number;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startTime = Date.now();

  constructor(
    private configService: ConfigService,
    private openaiService: OpenAIService,
    private cacheService: CacheService,
    private circuitBreakerService: CircuitBreakerService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async getSystemHealth(): Promise<SystemHealth> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkOpenAI(),
      this.checkCache(),
      this.checkEnvironment(),
    ]);

    const services: HealthCheckResult[] = checks.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceNames = ['database', 'openai', 'cache', 'environment'];
        return {
          service: serviceNames[index],
          status: 'unhealthy',
          responseTime: 0,
          error: result.reason?.message || 'Unknown error',
        };
      }
    });

    const overall = this.determineOverallHealth(services);
    const uptime = Date.now() - this.startTime;

    return {
      overall,
      services,
      timestamp: new Date().toISOString(),
      uptime,
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.userRepository.count();
      return {
        service: 'database',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          type: 'postgresql',
          host: this.configService.get('DB_HOST'),
        },
      };
    } catch (error) {
      return {
        service: 'database',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkOpenAI(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const isHealthy = await this.openaiService.healthCheck();
      const circuitStatus =
        this.circuitBreakerService.getCircuitStatus('openai-health');

      return {
        service: 'openai',
        status: isHealthy ? 'healthy' : 'degraded',
        responseTime: Date.now() - start,
        details: {
          circuitBreaker: circuitStatus?.state || 'CLOSED',
          failures: circuitStatus?.failures || 0,
        },
      };
    } catch (error) {
      return {
        service: 'openai',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkCache(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const stats = await this.cacheService.getStats();
      return {
        service: 'cache',
        status: stats.enabled ? 'healthy' : 'degraded',
        responseTime: Date.now() - start,
        details: stats,
      };
    } catch (error) {
      return {
        service: 'cache',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message,
      };
    }
  }

  private async checkEnvironment(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const requiredVars = ['JWT_SECRET', 'DB_HOST', 'OPENAI_API_KEY'];

      const missing = requiredVars.filter(
        (varName) => !this.configService.get(varName),
      );

      if (missing.length > 0) {
        return {
          service: 'environment',
          status: 'unhealthy',
          responseTime: Date.now() - start,
          error: `Missing environment variables: ${missing.join(', ')}`,
        };
      }

      return {
        service: 'environment',
        status: 'healthy',
        responseTime: Date.now() - start,
        details: {
          nodeEnv: this.configService.get<string>('NODE_ENV'),
          cachingEnabled: this.configService.get<boolean>('ENABLE_CACHING'),
          secretsManager: this.configService.get<boolean>(
            'ENABLE_SECRETS_MANAGER',
          ),
        },
      };
    } catch (error) {
      return {
        service: 'environment',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        error: error.message as string,
      };
    }
  }

  private determineOverallHealth(
    services: HealthCheckResult[],
  ): 'healthy' | 'unhealthy' | 'degraded' {
    const unhealthyServices = services.filter((s) => s.status === 'unhealthy');
    const degradedServices = services.filter((s) => s.status === 'degraded');

    if (unhealthyServices.length > 0) {
      // If critical services are down
      const criticalServices = ['database', 'environment'];
      const criticalDown = unhealthyServices.some((s) =>
        criticalServices.includes(s.service),
      );
      return criticalDown ? 'unhealthy' : 'degraded';
    }

    if (degradedServices.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  async getMetrics(): Promise<{
    circuits: Record<string, any>;
    cache: any;
    uptime: number;
    timestamp: string;
  }> {
    try {
      const [circuits, cacheStats] = await Promise.all([
        Promise.resolve(this.circuitBreakerService.getAllCircuits()),
        this.cacheService.getStats(),
      ]);

      return {
        circuits,
        cache: cacheStats,
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get metrics:', error);

      // Return partial metrics on error
      return {
        circuits: this.circuitBreakerService.getAllCircuits(),
        cache: { enabled: false, entriesCount: 0, memoryUsage: 'Error' },
        uptime: Date.now() - this.startTime,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
