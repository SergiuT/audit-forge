import { Injectable } from "@nestjs/common";
import { CacheService } from "@/shared/services/cache.service";

@Injectable()
export class RedisHealthIndicator {

  constructor(private cacheService: CacheService) {}

  async isHealthy(key: string): Promise<Record<string, any>> {
    try {
      const healthy = await this.cacheService.healthCheck();
      return { [key]: { status: healthy ? 'up' : 'down' } };
    } catch (e) {
      return { [key]: { status: 'down', error: e.message } };
    }
  }
}