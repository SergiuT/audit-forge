import { Controller, Get } from '@nestjs/common';
import { 
    HealthCheckService, 
    HealthCheck, 
    TypeOrmHealthIndicator, 
    MemoryHealthIndicator,
} from '@nestjs/terminus';
import { OpenAIHealthIndicator } from './indicators/openai.health';
import { PineconeHealthIndicator } from './indicators/pinecone.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private openai: OpenAIHealthIndicator,
    private pinecone: PineconeHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
      () => this.openai.isHealthy('openai'),
      () => this.pinecone.isHealthy('pinecone'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}