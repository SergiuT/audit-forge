import { RateLimitOptions } from '@/common/decorators/rate-limit.decorator';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CacheService } from './cache.service';

export interface RateLimitResult {
    limit: number;
    remaining: number;
    reset: number;
    retryAfter?: number;
}

@Injectable()
export class RateLimiterService {
    private readonly logger = new Logger(RateLimiterService.name);

    constructor(private readonly cacheService: CacheService) {}

    async checkRateLimit(
        key: string,
        config: RateLimitOptions,
    ): Promise<RateLimitResult> {
        try {
            const now = Date.now();
            const windowStart = now - config.windowMs

            const requests = await this.cacheService.getRedisClient().zrangebyscore(key, windowStart, '+inf');
            const currentCount = requests.length;

            if (currentCount >= config.maxRequests) {
                const oldestRequest = await this.cacheService.getRedisClient().zrange(key, 0, 0, 'WITHSCORES');
                const resetTime = parseInt(oldestRequest[1]) + config.windowMs;

                return {
                    limit: config.maxRequests,
                    remaining: 0,
                    reset: resetTime,
                    retryAfter: Math.ceil((resetTime - now) / 1000)
                };
            }

            await this.cacheService.getRedisClient().zadd(key, now, now.toString());
            await this.cacheService.getRedisClient().expire(key, Math.ceil(config.windowMs / 1000));

            return {
                limit: config.maxRequests,
                remaining: config.maxRequests - currentCount - 1,
                reset: now + config.windowMs
            };
        } catch (error) {
            this.logger.error('Rate limiting error:', error);
            // Return permissive result if Redis fails
            return {
                limit: config.maxRequests,
                remaining: config.maxRequests,
                reset: Date.now() + config.windowMs
            };
        }
    }

    async getUserKey(userId: number, endpoint: string): Promise<string> {
        return `rate_limit:user:${userId}:${endpoint}`;
    }

    async getIPKey(ip: string, endpoint: string): Promise<string> {
        return `rate_limit:ip:${ip}:${endpoint}`;
    }

    async getGlobalKey(endpoint: string): Promise<string> {
        return `rate_limit:global:${endpoint}`;
    }
}